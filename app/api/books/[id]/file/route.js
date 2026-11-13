/* Provides module implementation and exported declarations for route.js. */

import fs from "node:fs";
import { NextResponse } from "next/server.js";
import { requireApiOwnerAuth } from "../../../../../lib/auth.js";
import { findBookById } from "../../../../../lib/books-repo.js";
import {
  resolveSafeStoragePath,
  parseHttpByteRange,
  createFileWebStream,
} from "../../../../../lib/storage.js";

/* Executes documented symbol logic in route.js. */
export async function HEAD(request, context) {
  const auth = requireApiOwnerAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;
  const book = await findBookById(id);
  if (!book) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const filePath = resolveSafeStoragePath(book.storageKey, "books");
    if (!fs.existsSync(filePath)) {
      return new NextResponse(null, { status: 404 });
    }
    const stat = fs.statSync(filePath);
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

/* Executes documented symbol logic in route.js. */
export async function GET(request, context) {
  const auth = requireApiOwnerAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;
  const book = await findBookById(id);
  if (!book) {
    return NextResponse.json(
      {
        error: "BOOK_NOT_FOUND",
        message: "Không tìm thấy sách yêu cầu.",
      },
      { status: 404 }
    );
  }

  let filePath;
  try {
    filePath = resolveSafeStoragePath(book.storageKey, "books");
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_STORAGE_KEY",
        message: "Khóa lưu trữ tệp không hợp lệ.",
      },
      { status: 400 }
    );
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      {
        error: "FILE_MISSING",
        message: "Tệp PDF vật lý không còn tồn tại trong kho lưu trữ.",
      },
      { status: 404 }
    );
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const safeFilename = encodeURIComponent(book.originalName || `${book.title || "book"}.pdf`);
  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    const parsedRange = parseHttpByteRange(rangeHeader, fileSize);
    if (parsedRange?.unsatisfiable) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    if (parsedRange) {
      const { start, end, chunkSize } = parsedRange;
      const webStream = createFileWebStream(filePath, { start, end });
      return new NextResponse(webStream, {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `inline; filename*=UTF-8''${safeFilename}`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  const fullStream = createFileWebStream(filePath);
  return new NextResponse(fullStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename*=UTF-8''${safeFilename}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
