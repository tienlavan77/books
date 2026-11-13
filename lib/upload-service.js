/* Provides module implementation and exported declarations for upload-service.js. */

import path from "node:path";
import { createBookRecord } from "./books-repo.js";
import { storeUploadedPdf, generateAndSaveThumbnail } from "./storage.js";

/* Executes documented symbol logic in upload-service.js. */
export async function parseClientThumbnailInput(thumbnailField) {
  if (!thumbnailField) return null;

  if (typeof thumbnailField === "string") {
    const trimmed = thumbnailField.trim();
    const base64Match = trimmed.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
    if (base64Match) {
      return Buffer.from(base64Match[1], "base64");
    }
    return null;
  }

  if (typeof thumbnailField.arrayBuffer === "function") {
    const arr = await thumbnailField.arrayBuffer();
    return Buffer.from(arr);
  }

  return null;
}

/* Executes documented symbol logic in upload-service.js. */
export function serializeBookForClient(book) {
  if (!book) return null;
  const pageCount = Math.max(1, Number.parseInt(book.pageCount, 10) || 1);
  const currentPage = Math.min(
    pageCount,
    Math.max(1, Number.parseInt(book.progress?.currentPage, 10) || 1)
  );
  const progressPercent =
    book.progress?.progressPercent !== undefined && book.progress?.progressPercent !== null
      ? Math.min(100, Math.max(0, Number(book.progress.progressPercent)))
      : 0;

  return {
    id: book.id,
    title: book.title,
    originalName: book.originalName,
    storageKey: book.storageKey,
    thumbnailKey: book.thumbnailKey,
    fileSize: book.fileSize,
    pageCount,
    mimeType: book.mimeType || "application/pdf",
    fileUrl: `/api/books/${book.id}/file`,
    thumbnailUrl: `/api/books/${book.id}/thumbnail?v=${new Date(book.updatedAt || Date.now()).getTime()}`,
    createdAt: new Date(book.createdAt).toISOString(),
    updatedAt: new Date(book.updatedAt).toISOString(),
    progress: {
      currentPage,
      progressPercent,
      lastDevice: book.progress?.lastDevice || null,
      updatedAt: book.progress?.updatedAt
        ? new Date(book.progress.updatedAt).toISOString()
        : new Date(book.createdAt).toISOString(),
    },
  };
}

/* Executes documented symbol logic in upload-service.js. */
export async function handlePdfUploadFormData(formData) {
  const fileField = formData.get("file") || formData.get("pdf");
  if (!fileField || typeof fileField.arrayBuffer !== "function") {
    return {
      ok: false,
      status: 400,
      error: "MISSING_FILE",
      message: "Vui lòng chọn một tệp PDF hợp lệ để tải lên.",
    };
  }

  const originalName = String(fileField.name || "document.pdf").trim();
  const rawTitle = formData.get("title") ? String(formData.get("title")).trim() : "";
  const defaultTitle = path.basename(originalName, path.extname(originalName)) || "Sách PDF chưa đặt tên";
  const title = rawTitle || defaultTitle;
  const clientPageCount = formData.get("pageCount") ? Number.parseInt(String(formData.get("pageCount")), 10) : null;

  const arrayBuffer = await fileField.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const stored = await storeUploadedPdf({
    fileBuffer,
    originalName,
    mimeType: fileField.type || "application/pdf",
    clientPageCount,
  });

  if (!stored.valid) {
    const status = stored.error === "FILE_TOO_LARGE" ? 413 : 400;
    return {
      ok: false,
      status,
      error: stored.error,
      message: stored.message,
    };
  }

  const clientThumbnailBuffer = await parseClientThumbnailInput(
    formData.get("thumbnail") || formData.get("thumbnailDataUrl")
  );

  const thumbnailKey = await generateAndSaveThumbnail({
    title,
    pageCount: stored.pageCount,
    clientThumbnailBuffer,
  });

  const createdBook = await createBookRecord({
    title,
    originalName,
    storageKey: stored.storageKey,
    thumbnailKey,
    fileSize: stored.fileSize,
    pageCount: stored.pageCount,
    mimeType: stored.mimeType,
  });

  return {
    ok: true,
    status: 201,
    book: serializeBookForClient(createdBook),
  };
}
