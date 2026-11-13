/* Provides module implementation and exported declarations for route.js. */

import fs from "node:fs";
import { NextResponse } from "next/server.js";
import { requireApiOwnerAuth } from "../../../../../lib/auth.js";
import { findBookById, updateBookMetadata } from "../../../../../lib/books-repo.js";
import {
  resolveSafeStoragePath,
  generateAndSaveThumbnail,
  removeBookPhysicalFiles,
  createFileWebStream,
} from "../../../../../lib/storage.js";
import { parseClientThumbnailInput, serializeBookForClient } from "../../../../../lib/upload-service.js";

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

  let thumbnailKey = book.thumbnailKey;
  let thumbPath = null;

  if (thumbnailKey) {
    try {
      const candidate = resolveSafeStoragePath(thumbnailKey, "thumbnails");
      if (fs.existsSync(candidate)) {
        thumbPath = candidate;
      }
    } catch {
      thumbPath = null;
    }
  }

  if (!thumbPath) {
    thumbnailKey = await generateAndSaveThumbnail({
      title: book.title,
      pageCount: book.pageCount,
    });
    await updateBookMetadata(book.id, { thumbnailKey });
    thumbPath = resolveSafeStoragePath(thumbnailKey, "thumbnails");
  }

  const stat = fs.statSync(thumbPath);
  const stream = createFileWebStream(thumbPath);
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/* Executes documented symbol logic in route.js. */
export async function PUT(request, context) {
  const auth = requireApiOwnerAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;
  const existing = await findBookById(id);
  if (!existing) {
    return NextResponse.json(
      {
        error: "BOOK_NOT_FOUND",
        message: "Không tìm thấy sách để cập nhật ảnh bìa.",
      },
      { status: 404 }
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let thumbBuffer = null;
    let nextPageCount = existing.pageCount;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      thumbBuffer = await parseClientThumbnailInput(
        formData.get("thumbnail") || formData.get("thumbnailDataUrl")
      );
      if (formData.get("pageCount")) {
        nextPageCount = Number.parseInt(String(formData.get("pageCount")), 10) || existing.pageCount;
      }
    } else {
      const body = await request.json().catch(() => ({}));
      thumbBuffer = await parseClientThumbnailInput(body?.thumbnailDataUrl || body?.thumbnail);
      if (body?.pageCount) {
        nextPageCount = Number.parseInt(String(body.pageCount), 10) || existing.pageCount;
      }
    }

    if (!thumbBuffer) {
      return NextResponse.json(
        {
          error: "INVALID_THUMBNAIL",
          message: "Dữ liệu ảnh bìa gửi lên không hợp lệ.",
        },
        { status: 400 }
      );
    }

    const newThumbnailKey = await generateAndSaveThumbnail({
      title: existing.title,
      pageCount: nextPageCount,
      clientThumbnailBuffer: thumbBuffer,
    });

    if (existing.thumbnailKey && existing.thumbnailKey !== newThumbnailKey) {
      removeBookPhysicalFiles({ storageKey: null, thumbnailKey: existing.thumbnailKey });
    }

    const updated = await updateBookMetadata(id, {
      pageCount: nextPageCount,
      thumbnailKey: newThumbnailKey,
    });

    return NextResponse.json({
      book: serializeBookForClient(updated),
    });
  } catch {
    return NextResponse.json(
      {
        error: "THUMBNAIL_UPDATE_FAILED",
        message: "Không thể lưu ảnh bìa mới.",
      },
      { status: 500 }
    );
  }
}
