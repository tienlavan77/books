/* Provides module implementation and exported declarations for books-app.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  hashOwnerPassword,
  verifyPasswordHash,
  authenticateSingleOwner,
  createSignedSessionToken,
  verifySignedSessionToken,
  SESSION_COOKIE_NAME,
} from "../lib/auth.js";
import {
  resolveSafeStoragePath,
  parseHttpByteRange,
  extractPdfPageCountFromBuffer,
} from "../lib/storage.js";
import { POST as loginPost, GET as loginGet } from "../app/api/auth/login/route.js";
import { POST as logoutPost } from "../app/api/auth/logout/route.js";
import { GET as booksGet, POST as booksPost } from "../app/api/books/route.js";
import {
  GET as bookDetailGet,
  DELETE as bookDelete,
} from "../app/api/books/[id]/route.js";
import { GET as bookFileGet } from "../app/api/books/[id]/file/route.js";
import { GET as bookThumbGet } from "../app/api/books/[id]/thumbnail/route.js";
import {
  GET as progressGet,
  PUT as progressPut,
} from "../app/api/books/[id]/progress/route.js";
import {
  computeReaderViewportMetrics,
  updateVisitedPageCache,
  computeRenderedPagesSet,
} from "../lib/reader-metrics.js";
import { GET as getPdfAsset } from "../app/api/pdf-worker/[...asset]/route.js";

/* Executes documented symbol logic in books-app.test.mjs. */
function buildSamplePdfBuffer(pageCount = 5) {
  const pageRefs = Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(" ");
  const pageObjects = Array.from(
    { length: pageCount },
    (_, i) =>
      `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj`
  ).join("\n");

  const pdfContent = [
    "%PDF-1.4",
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
    `2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>\nendobj`,
    pageObjects,
    "%%EOF",
  ].join("\n");

  return Buffer.from(pdfContent, "utf8");
}

test("Thực thi toàn bộ kịch bản kiểm chứng O1 -> O4 của ứng dụng đọc sách PDF cá nhân", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "books-storage-test-"));
  process.env.FILE_STORAGE_PATH = tempRoot;
  process.env.BOOKS_DB_DRIVER = "fallback";
  process.env.OWNER_USERNAME = "owner";
  process.env.OWNER_PASSWORD = "SecretPin2026!";
  process.env.OWNER_SESSION_SECRET = "test-session-secret-key-2026";

  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  await t.test("O1: Xác thực SINGLE_OWNER, băm mật khẩu PBKDF2 và chặn truy cập 401 khi chưa đăng nhập", async () => {
    const hashed = hashOwnerPassword("SecretPin2026!");
    assert.equal(verifyPasswordHash("SecretPin2026!", hashed), true);
    assert.equal(verifyPasswordHash("WrongPassword", hashed), false);

    const wrongAuth = await authenticateSingleOwner({
      username: "owner",
      password: "WrongPassword",
    });
    assert.equal(wrongAuth.ok, false);

    const unauthBooksRes = await booksGet(new Request("http://localhost:3000/api/books"));
    assert.equal(unauthBooksRes.status, 401);

    const badLoginRes = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "owner", password: "wrong" }),
      })
    );
    assert.equal(badLoginRes.status, 401);

    const goodLoginRes = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "owner", password: "SecretPin2026!" }),
      })
    );
    assert.equal(goodLoginRes.status, 200);
    const setCookieHeader = goodLoginRes.headers.get("set-cookie") || "";
    assert.match(setCookieHeader, new RegExp(`${SESSION_COOKIE_NAME}=`));
    assert.match(setCookieHeader, /HttpOnly/i);

    const token = createSignedSessionToken({
      id: "owner_single_account",
      username: "owner",
      displayName: "Chủ sở hữu",
    });
    const verified = verifySignedSessionToken(token);
    assert.equal(verified.username, "owner");
    assert.equal(verified.role, "SINGLE_OWNER");

    const sessionCheckRes = await loginGet(
      new Request("http://localhost:3000/api/auth/login", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      })
    );
    assert.equal(sessionCheckRes.status, 200);

    const logoutRes = await logoutPost();
    assert.equal(logoutRes.status, 200);
    assert.match(logoutRes.headers.get("set-cookie") || "", /Max-Age=0/i);
  });

  const ownerToken = createSignedSessionToken({
    id: "owner_single_account",
    username: "owner",
    displayName: "Chủ sở hữu",
  });
  const authCookieHeader = { cookie: `${SESSION_COOKIE_NAME}=${ownerToken}` };
  let createdBookId = null;

  await t.test("O2: Chống path traversal, từ chối file giả mạo và tải lên PDF hợp lệ kèm tạo thumbnail, hỗ trợ HTTP Range 206", async () => {
    assert.throws(() => resolveSafeStoragePath("../../etc/passwd", "books"));

    const fakeForm = new FormData();
    fakeForm.append(
      "file",
      new File([Buffer.from("NOT_A_PDF_CONTENT")], "malware.pdf", {
        type: "application/pdf",
      })
    );
    const fakeUploadRes = await booksPost(
      new Request("http://localhost:3000/api/books", {
        method: "POST",
        headers: authCookieHeader,
        body: fakeForm,
      })
    );
    assert.equal(fakeUploadRes.status, 400);

    const validPdfBuffer = buildSamplePdfBuffer(12);
    assert.equal(extractPdfPageCountFromBuffer(validPdfBuffer), 12);

    const validForm = new FormData();
    validForm.append(
      "file",
      new File([validPdfBuffer], "clean-architecture.pdf", {
        type: "application/pdf",
      })
    );
    validForm.append("title", "Kiến trúc Phần mềm Sạch");

    const uploadRes = await booksPost(
      new Request("http://localhost:3000/api/books", {
        method: "POST",
        headers: authCookieHeader,
        body: validForm,
      })
    );
    assert.equal(uploadRes.status, 201);
    const uploadJson = await uploadRes.json();
    assert.ok(uploadJson.book?.id);
    assert.equal(uploadJson.book.title, "Kiến trúc Phần mềm Sạch");
    assert.equal(uploadJson.book.pageCount, 12);
    createdBookId = uploadJson.book.id;

    const storedPdfPath = resolveSafeStoragePath(uploadJson.book.storageKey, "books");
    const storedThumbPath = resolveSafeStoragePath(uploadJson.book.thumbnailKey, "thumbnails");
    assert.equal(fs.existsSync(storedPdfPath), true);
    assert.equal(fs.existsSync(storedThumbPath), true);

    const thumbRes = await bookThumbGet(
      new Request(`http://localhost:3000/api/books/${createdBookId}/thumbnail`, {
        headers: authCookieHeader,
      }),
      { params: Promise.resolve({ id: createdBookId }) }
    );
    assert.equal(thumbRes.status, 200);
    assert.equal(thumbRes.headers.get("content-type"), "image/webp");

    const rangeParsed = parseHttpByteRange("bytes=0-15", validPdfBuffer.length);
    assert.equal(rangeParsed.start, 0);
    assert.equal(rangeParsed.end, 15);
    assert.equal(rangeParsed.chunkSize, 16);

    const rangeRes = await bookFileGet(
      new Request(`http://localhost:3000/api/books/${createdBookId}/file`, {
        headers: {
          ...authCookieHeader,
          range: "bytes=0-7",
        },
      }),
      { params: Promise.resolve({ id: createdBookId }) }
    );
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get("accept-ranges"), "bytes");
    assert.equal(
      rangeRes.headers.get("content-range"),
      `bytes 0-7/${validPdfBuffer.length}`
    );
    const partialBytes = Buffer.from(await rangeRes.arrayBuffer());
    assert.equal(partialBytes.length, 8);
    assert.equal(partialBytes.toString("utf8"), "%PDF-1.4");
  });

  await t.test("O3: Tự động tính toán bố cục 1 trang trên màn hình nhỏ (điện thoại) và 2 trang mở trên màn hình lớn (desktop/tablet ngang)", async () => {
    const mobileMetrics = computeReaderViewportMetrics(390, 844, "auto");
    assert.equal(mobileMetrics.isSpread, false);

    const tabletPortraitMetrics = computeReaderViewportMetrics(768, 1024, "auto");
    assert.equal(tabletPortraitMetrics.isSpread, false);

    const desktopSpreadMetrics = computeReaderViewportMetrics(1366, 768, "auto");
    assert.equal(desktopSpreadMetrics.isSpread, true);

    const tabletLandscapeMetrics = computeReaderViewportMetrics(1180, 820, "auto");
    assert.equal(tabletLandscapeMetrics.isSpread, true);

    const fullscreenMetrics = computeReaderViewportMetrics(1366, 768, "auto", true);
    assert.equal(fullscreenMetrics.isSpread, true);
    assert.ok(fullscreenMetrics.pageHeight >= desktopSpreadMetrics.pageHeight);

    const setAtPage1 = computeRenderedPagesSet({
      activePage: 1,
      totalPages: 50,
      isSpread: false,
      cachedPages: updateVisitedPageCache([], 1, 50, false),
    });
    for (let p = 1; p <= 11; p += 1) {
      assert.equal(setAtPage1.has(p), true);
    }
    assert.equal(setAtPage1.has(12), false);

    const setAtPage11 = computeRenderedPagesSet({
      activePage: 11,
      totalPages: 50,
      isSpread: false,
      cachedPages: updateVisitedPageCache([], 11, 50, false),
    });
    for (let p = 1; p <= 21; p += 1) {
      assert.equal(setAtPage11.has(p), true);
    }
    assert.equal(setAtPage11.has(22), false);

    const setAtPage12 = computeRenderedPagesSet({
      activePage: 12,
      totalPages: 50,
      isSpread: false,
      cachedPages: updateVisitedPageCache([], 12, 50, false),
    });
    assert.equal(setAtPage12.has(1), false);
    for (let p = 2; p <= 22; p += 1) {
      assert.equal(setAtPage12.has(p), true);
    }
    assert.equal(setAtPage12.has(23), false);

    const spreadAt11 = computeRenderedPagesSet({
      activePage: 11,
      totalPages: 50,
      isSpread: true,
      cachedPages: updateVisitedPageCache([], 11, 50, true),
    });
    for (let p = 1; p <= 22; p += 1) {
      assert.equal(spreadAt11.has(p), true);
    }
    assert.equal(spreadAt11.has(23), false);

    const spreadAt13 = computeRenderedPagesSet({
      activePage: 13,
      totalPages: 50,
      isSpread: true,
      cachedPages: updateVisitedPageCache([], 13, 50, true),
    });
    assert.equal(spreadAt13.has(1), false);
    assert.equal(spreadAt13.has(2), false);
    for (let p = 3; p <= 24; p += 1) {
      assert.equal(spreadAt13.has(p), true);
    }
    assert.equal(spreadAt13.has(25), false);

    const jbig2WasmRes = await getPdfAsset(new Request("http://localhost/api/pdf-worker/wasm/jbig2.wasm"), {
      params: Promise.resolve({ asset: ["wasm", "jbig2.wasm"] }),
    });
    assert.equal(jbig2WasmRes.status, 200);
    assert.equal(jbig2WasmRes.headers.get("content-type"), "application/wasm");
    const wasmBytes = new Uint8Array(await jbig2WasmRes.arrayBuffer());
    assert.ok(wasmBytes.byteLength > 1000);

    const blockedAssetRes = await getPdfAsset(
      new Request("http://localhost/api/pdf-worker/build/pdf.mjs"),
      { params: Promise.resolve({ asset: ["build", "pdf.mjs"] }) }
    );
    assert.equal(blockedAssetRes.status, 404);
  });

  await t.test("O4: Đồng bộ tiến độ đọc đa thiết bị, khôi phục trang gần nhất, chống ghi đè lùi và xóa sách dọn sạch file vật lý", async () => {
    const firstSaveRes = await progressPut(
      new Request(`http://localhost:3000/api/books/${createdBookId}/progress`, {
        method: "PUT",
        headers: {
          ...authCookieHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPage: 6,
          pageCount: 12,
          lastDevice: "iPad Pro",
        }),
      }),
      { params: Promise.resolve({ id: createdBookId }) }
    );
    assert.equal(firstSaveRes.status, 200);
    const firstSaveData = await firstSaveRes.json();
    assert.equal(firstSaveData.progress.currentPage, 6);
    assert.equal(firstSaveData.progress.progressPercent, 50);

    const staleTimestamp = new Date(Date.now() - 60000).toISOString();
    const conflictRes = await progressPut(
      new Request(`http://localhost:3000/api/books/${createdBookId}/progress`, {
        method: "PUT",
        headers: {
          ...authCookieHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPage: 2,
          pageCount: 12,
          clientUpdatedAt: staleTimestamp,
          force: false,
        }),
      }),
      { params: Promise.resolve({ id: createdBookId }) }
    );
    assert.equal(conflictRes.status, 409);
    const conflictData = await conflictRes.json();
    assert.equal(conflictData.conflict, true);
    assert.equal(conflictData.progress.currentPage, 6);

    const restoreRes = await progressGet(
      new Request(`http://localhost:3000/api/books/${createdBookId}/progress`, {
        headers: authCookieHeader,
      }),
      { params: Promise.resolve({ id: createdBookId }) }
    );
    assert.equal(restoreRes.status, 200);
    const restoreData = await restoreRes.json();
    assert.equal(restoreData.progress.currentPage, 6);

    const detailRes = await bookDetailGet(
      new Request(`http://localhost:3000/api/books/${createdBookId}`, {
        headers: authCookieHeader,
      }),
      { params: Promise.resolve({ id: createdBookId }) }
    );
    const detailData = await detailRes.json();
    const pdfPathBeforeDelete = resolveSafeStoragePath(detailData.book.storageKey, "books");
    const thumbPathBeforeDelete = resolveSafeStoragePath(detailData.book.thumbnailKey, "thumbnails");
    assert.equal(fs.existsSync(pdfPathBeforeDelete), true);
    assert.equal(fs.existsSync(thumbPathBeforeDelete), true);

    const deleteRes = await bookDelete(
      new Request(`http://localhost:3000/api/books/${createdBookId}`, {
        method: "DELETE",
        headers: authCookieHeader,
      }),
      { params: Promise.resolve({ id: createdBookId }) }
    );
    assert.equal(deleteRes.status, 200);
    const deleteData = await deleteRes.json();
    assert.equal(deleteData.deleted, true);
    assert.equal(fs.existsSync(pdfPathBeforeDelete), false);
    assert.equal(fs.existsSync(thumbPathBeforeDelete), false);
  });
});
