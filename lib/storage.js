/* Provides module implementation and exported declarations for storage.js. */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";

const DEFAULT_MAX_UPLOAD_MB = 500;
const PDF_MAGIC_PREFIX = "%PDF-";

/* Executes documented symbol logic in storage.js. */
export function getMaxUploadBytes() {
  const configuredMb = Number.parseInt(
    process.env.MAX_UPLOAD_SIZE_MB || process.env.MAX_PDF_UPLOAD_MB || String(DEFAULT_MAX_UPLOAD_MB),
    10
  );
  const validMb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : DEFAULT_MAX_UPLOAD_MB;
  return validMb * 1024 * 1024;
}

/* Executes documented symbol logic in storage.js. */
export function ensureStorageDirectories() {
  const configuredPath = process.env.FILE_STORAGE_PATH || "./storage";
  const rootDir = path.resolve(process.cwd(), configuredPath);
  const publicDir = path.resolve(process.cwd(), "public");

  if (rootDir === publicDir || rootDir.startsWith(`${publicDir}${path.sep}`)) {
    throw new Error("FILE_STORAGE_PATH tuyệt đối không được nằm trong thư mục public/.");
  }

  const booksDir = path.join(rootDir, "books");
  const thumbnailsDir = path.join(rootDir, "thumbnails");
  const tempDir = path.join(rootDir, "temp");

  for (const dir of [rootDir, booksDir, thumbnailsDir, tempDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  return {
    rootDir,
    booksDir,
    thumbnailsDir,
    tempDir,
  };
}

/* Executes documented symbol logic in storage.js. */
export function resolveSafeStoragePath(storageKey, expectedSubdir = null) {
  if (!storageKey || typeof storageKey !== "string") {
    throw new Error("Khóa lưu trữ không hợp lệ.");
  }
  const normalizedKey = storageKey.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !normalizedKey ||
    normalizedKey.includes("..") ||
    normalizedKey.includes("\0") ||
    path.isAbsolute(normalizedKey)
  ) {
    throw new Error("Phát hiện truy cập đường dẫn không an toàn (path traversal).");
  }

  const { rootDir } = ensureStorageDirectories();
  const baseAllowed = expectedSubdir ? path.resolve(rootDir, expectedSubdir) : rootDir;
  const targetPath = path.resolve(rootDir, normalizedKey);

  if (targetPath !== baseAllowed && !targetPath.startsWith(`${baseAllowed}${path.sep}`)) {
    throw new Error("Đường dẫn tệp vượt ra ngoài phạm vi lưu trữ cho phép.");
  }

  return targetPath;
}

/* Executes documented symbol logic in storage.js. */
export function validatePdfHeaderAndMeta({ headerBuffer, fileName = "", mimeType = "", fileSize = 0 }) {
  const maxBytes = getMaxUploadBytes();
  if (!fileSize || fileSize <= 0) {
    return { valid: false, error: "EMPTY_FILE", message: "Tệp tải lên đang rỗng." };
  }
  if (fileSize > maxBytes) {
    return {
      valid: false,
      error: "FILE_TOO_LARGE",
      message: `Dung lượng tệp vượt quá giới hạn cho phép (${Math.round(maxBytes / (1024 * 1024))}MB).`,
    };
  }

  const normalizedMime = String(mimeType || "").toLowerCase().trim();
  const normalizedName = String(fileName || "").toLowerCase().trim();
  const isPdfMimeOrExt =
    normalizedMime === "application/pdf" ||
    normalizedMime === "application/x-pdf" ||
    normalizedMime === "application/octet-stream" ||
    normalizedMime === "" ||
    normalizedName.endsWith(".pdf");

  if (!isPdfMimeOrExt) {
    return {
      valid: false,
      error: "INVALID_MIME_TYPE",
      message: "Chỉ chấp nhận tệp định dạng PDF (.pdf).",
    };
  }

  if (!headerBuffer || !Buffer.isBuffer(headerBuffer) || headerBuffer.length < 5) {
    return {
      valid: false,
      error: "INVALID_PDF_HEADER",
      message: "Không đọc được phần đầu tệp PDF hợp lệ.",
    };
  }

  const probeText = headerBuffer.subarray(0, Math.min(headerBuffer.length, 1024)).toString("latin1");
  if (!probeText.includes(PDF_MAGIC_PREFIX)) {
    return {
      valid: false,
      error: "INVALID_PDF_MAGIC",
      message: "Tệp không có chữ ký chuẩn %PDF- của định dạng PDF.",
    };
  }

  return { valid: true };
}

/* Executes documented symbol logic in storage.js. */
export function extractPdfPageCountFromBuffer(pdfBuffer) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    return 1;
  }

  // Giới hạn vùng quét metadata ở đầu và cuối tệp nếu tệp quá lớn (>12MB) để tránh tốn bộ nhớ và CPU.
  const MAX_SCAN_BYTES = 12 * 1024 * 1024;
  const text =
    pdfBuffer.length <= MAX_SCAN_BYTES
      ? pdfBuffer.toString("latin1")
      : pdfBuffer.subarray(0, 6 * 1024 * 1024).toString("latin1") +
        "\n" +
        pdfBuffer.subarray(pdfBuffer.length - 6 * 1024 * 1024).toString("latin1");

  let maxDeclaredCount = 0;

  const pagesDictRegex = /\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/g;
  let match;
  while ((match = pagesDictRegex.exec(text)) !== null) {
    const count = Number.parseInt(match[1], 10);
    if (Number.isFinite(count) && count > maxDeclaredCount && count < 500000) {
      maxDeclaredCount = count;
    }
  }

  const reversePagesDictRegex = /\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages\b/g;
  while ((match = reversePagesDictRegex.exec(text)) !== null) {
    const count = Number.parseInt(match[1], 10);
    if (Number.isFinite(count) && count > maxDeclaredCount && count < 500000) {
      maxDeclaredCount = count;
    }
  }

  if (maxDeclaredCount > 0) {
    return maxDeclaredCount;
  }

  const singlePageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
  const leafCount = singlePageMatches ? singlePageMatches.length : 0;

  if (leafCount > 0) {
    return leafCount;
  }
  return 1;
}

/* Executes documented symbol logic in storage.js. */
function escapeXmlText(input, maxLen = 36) {
  const clean = String(input || "Sách PDF")
    .replace(/\s+/g, " ")
    .trim();
  const truncated = clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
  return truncated
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* Executes documented symbol logic in storage.js. */
export async function generateAndSaveThumbnail({
  title = "Sách PDF",
  pageCount = 1,
  clientThumbnailBuffer = null,
}) {
  const { thumbnailsDir } = ensureStorageDirectories();
  const randomId = `${Date.now()}-${crypto.randomBytes(12).toString("hex")}`;
  const fileName = `${randomId}.webp`;
  const thumbnailKey = `thumbnails/${fileName}`;
  const fullPath = path.join(thumbnailsDir, fileName);

  if (clientThumbnailBuffer && Buffer.isBuffer(clientThumbnailBuffer) && clientThumbnailBuffer.length > 0) {
    await sharp(clientThumbnailBuffer)
      .resize(480, 680, { fit: "cover", position: "top" })
      .webp({ quality: 84 })
      .toFile(fullPath);
    fs.chmodSync(fullPath, 0o600);
    return thumbnailKey;
  }

  const words = String(title || "Sách PDF").trim().split(/\s+/);
  const lines = [];
  let currentLine = "";
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= 20) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= 3) break;
    }
  }
  if (currentLine && lines.length < 4) {
    lines.push(currentLine);
  }

  const lineElements = lines
    .map(
      (line, idx) =>
        `<text x="44" y="${210 + idx * 44}" font-family="sans-serif" font-size="30" font-weight="700" fill="#fef3c7">${escapeXmlText(
          line,
          24
        )}</text>`
    )
    .join("");

  const svgCover = `
    <svg width="480" height="680" viewBox="0 0 480 680" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="55%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#312e81"/>
        </linearGradient>
      </defs>
      <rect width="480" height="680" rx="18" fill="url(#bg)"/>
      <rect x="20" y="0" width="10" height="680" fill="#f59e0b" opacity="0.75"/>
      <rect x="42" y="44" width="396" height="592" rx="12" fill="none" stroke="#f59e0b" stroke-opacity="0.35" stroke-width="2"/>
      <rect x="44" y="88" width="94" height="34" rx="8" fill="#f59e0b"/>
      <text x="91" y="111" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="800" fill="#0f172a">PDF BOOK</text>
      ${lineElements}
      <line x1="44" y1="530" x2="436" y2="530" stroke="#94a3b8" stroke-opacity="0.3" stroke-width="1.5"/>
      <text x="44" y="572" font-family="sans-serif" font-size="20" font-weight="600" fill="#cbd5e1">Thư viện cá nhân</text>
      <text x="44" y="604" font-family="sans-serif" font-size="18" fill="#94a3b8">${Math.max(
        1,
        Number.parseInt(pageCount, 10) || 1
      )} trang</text>
    </svg>
  `;

  await sharp(Buffer.from(svgCover))
    .resize(480, 680)
    .webp({ quality: 84 })
    .toFile(fullPath);
  fs.chmodSync(fullPath, 0o600);
  return thumbnailKey;
}

/* Executes documented symbol logic in storage.js. */
export async function storeUploadedPdf({
  fileBuffer,
  originalName = "document.pdf",
  mimeType = "application/pdf",
  clientPageCount = null,
}) {
  const { tempDir, booksDir } = ensureStorageDirectories();
  const tempFileName = `upload-${Date.now()}-${crypto.randomBytes(12).toString("hex")}.part`;
  const tempFilePath = path.join(tempDir, tempFileName);

  try {
    fs.writeFileSync(tempFilePath, fileBuffer, { mode: 0o600 });
    const stats = fs.statSync(tempFilePath);

    const validation = validatePdfHeaderAndMeta({
      headerBuffer: fileBuffer.subarray(0, Math.min(fileBuffer.length, 1024)),
      fileName: originalName,
      mimeType,
      fileSize: stats.size,
    });

    if (!validation.valid) {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return validation;
    }

    const parsedClientPages = Number.parseInt(clientPageCount, 10);
    const pageCount =
      Number.isFinite(parsedClientPages) && parsedClientPages > 0
        ? parsedClientPages
        : extractPdfPageCountFromBuffer(fileBuffer);

    const finalFileName = `${Date.now()}-${crypto.randomBytes(16).toString("hex")}.pdf`;
    const storageKey = `books/${finalFileName}`;
    const finalFilePath = path.join(booksDir, finalFileName);

    fs.renameSync(tempFilePath, finalFilePath);
    fs.chmodSync(finalFilePath, 0o600);

    return {
      valid: true,
      storageKey,
      fileSize: stats.size,
      pageCount: Math.max(1, pageCount),
      mimeType: "application/pdf",
    };
  } catch (error) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // Executes documented symbol logic in storage.js.
      }
    }
    throw error;
  }
}

/* Executes documented symbol logic in storage.js. */
export function removeBookPhysicalFiles({ storageKey, thumbnailKey }) {
  const removed = { pdfRemoved: false, thumbnailRemoved: false };

  if (storageKey) {
    try {
      const pdfPath = resolveSafeStoragePath(storageKey, "books");
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
        removed.pdfRemoved = true;
      }
    } catch {
      // Executes documented symbol logic in storage.js.
    }
  }

  if (thumbnailKey) {
    try {
      const thumbPath = resolveSafeStoragePath(thumbnailKey, "thumbnails");
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
        removed.thumbnailRemoved = true;
      }
    } catch {
      // Executes documented symbol logic in storage.js.
    }
  }

  return removed;
}

/* Executes documented symbol logic in storage.js. */
export function parseHttpByteRange(rangeHeader, fileSize) {
  if (!rangeHeader || typeof rangeHeader !== "string" || fileSize <= 0) {
    return null;
  }
  const trimmed = rangeHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bytes=")) {
    return { unsatisfiable: true };
  }

  const rangeSpec = trimmed.slice(6).split(",")[0].trim();
  const [startStr, endStr] = rangeSpec.split("-");
  if (startStr === undefined || endStr === undefined) {
    return { unsatisfiable: true };
  }

  let start;
  let end;

  if (startStr === "") {
    const suffixLength = Number.parseInt(endStr, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { unsatisfiable: true };
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(startStr, 10);
    end = endStr === "" ? fileSize - 1 : Number.parseInt(endStr, 10);
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= fileSize ||
    end < start
  ) {
    return { unsatisfiable: true };
  }

  const clampedEnd = Math.min(end, fileSize - 1);
  return {
    unsatisfiable: false,
    start,
    end: clampedEnd,
    chunkSize: clampedEnd - start + 1,
  };
}

/* Executes documented symbol logic in storage.js. */
export function createFileWebStream(filePath, options = {}) {
  const nodeStream = fs.createReadStream(filePath, options);
  return Readable.toWeb(nodeStream);
}
