/* Provides module implementation and exported declarations for route.js. */

import { NextResponse } from "next/server.js";
import { requireApiOwnerAuth } from "../../../../lib/auth.js";
import { findBookById, updateBookMetadata, deleteBookRecord } from "../../../../lib/books-repo.js";
import {
  removeBookPhysicalFiles,
  generateAndSaveThumbnail,
} from "../../../../lib/storage.js";
import { serializeBookForClient, parseClientThumbnailInput } from "../../../../lib/upload-service.js";

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
        message: "Không tìm thấy cuốn sách yêu cầu trong thư viện.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    book: serializeBookForClient(book),
  });
}

/* Executes documented symbol logic in route.js. */
export async function PATCH(request, context) {
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
        message: "Không tìm thấy cuốn sách cần cập nhật.",
      },
      { status: 404 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    let nextThumbnailKey = existing.thumbnailKey;

    if (body?.thumbnailDataUrl) {
      const thumbBuffer = await parseClientThumbnailInput(body.thumbnailDataUrl);
      if (thumbBuffer) {
        nextThumbnailKey = await generateAndSaveThumbnail({
          title: body?.title || existing.title,
          pageCount: body?.pageCount || existing.pageCount,
          clientThumbnailBuffer: thumbBuffer,
        });
        if (existing.thumbnailKey && existing.thumbnailKey !== nextThumbnailKey) {
          removeBookPhysicalFiles({ storageKey: null, thumbnailKey: existing.thumbnailKey });
        }
      }
    }

    const updated = await updateBookMetadata(id, {
      title: body?.title,
      pageCount: body?.pageCount,
      thumbnailKey: nextThumbnailKey,
    });

    return NextResponse.json({
      book: serializeBookForClient(updated),
    });
  } catch {
    return NextResponse.json(
      {
        error: "UPDATE_BOOK_FAILED",
        message: "Không thể cập nhật thông tin sách lúc này.",
      },
      { status: 500 }
    );
  }
}

/* Executes documented symbol logic in route.js. */
export async function DELETE(request, context) {
  const auth = requireApiOwnerAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;
  const deleted = await deleteBookRecord(id);
  if (!deleted) {
    return NextResponse.json(
      {
        error: "BOOK_NOT_FOUND",
        message: "Cuốn sách không tồn tại hoặc đã bị xóa trước đó.",
      },
      { status: 404 }
    );
  }

  const fileCleanup = removeBookPhysicalFiles({
    storageKey: deleted.storageKey,
    thumbnailKey: deleted.thumbnailKey,
  });

  return NextResponse.json({
    deleted: true,
    id: deleted.id,
    fileCleanup,
  });
}
