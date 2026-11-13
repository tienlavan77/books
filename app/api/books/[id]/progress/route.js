/* Provides module implementation and exported declarations for route.js. */

import { NextResponse } from "next/server.js";
import { requireApiOwnerAuth } from "../../../../../lib/auth.js";
import { findBookById, saveReadingProgress } from "../../../../../lib/books-repo.js";

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
        message: "Không tìm thấy sách để lấy tiến độ đọc.",
      },
      { status: 404 }
    );
  }

  const pageCount = Math.max(1, Number.parseInt(book.pageCount, 10) || 1);
  const currentPage = Math.min(
    pageCount,
    Math.max(1, Number.parseInt(book.progress?.currentPage, 10) || 1)
  );
  const progressPercent =
    book.progress?.progressPercent !== undefined && book.progress?.progressPercent !== null
      ? Math.min(100, Math.max(0, Number(book.progress.progressPercent)))
      : 0;

  return NextResponse.json({
    bookId: book.id,
    pageCount,
    progress: {
      currentPage,
      progressPercent,
      lastDevice: book.progress?.lastDevice || null,
      updatedAt: book.progress?.updatedAt
        ? new Date(book.progress.updatedAt).toISOString()
        : new Date(book.createdAt).toISOString(),
    },
  });
}

/* Executes documented symbol logic in route.js. */
async function handleSaveProgress(request, context) {
  const auth = requireApiOwnerAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  if (body?.currentPage === undefined || body?.currentPage === null) {
    return NextResponse.json(
      {
        error: "INVALID_PROGRESS_PAYLOAD",
        message: "Thiếu thông tin trang đang đọc (currentPage).",
      },
      { status: 400 }
    );
  }

  const result = await saveReadingProgress({
    bookId: id,
    currentPage: body.currentPage,
    progressPercent: body.progressPercent,
    pageCount: body.pageCount,
    lastDevice: body.lastDevice || request.headers.get("user-agent") || null,
    clientUpdatedAt: body.clientUpdatedAt || body.baseUpdatedAt || null,
    force: Boolean(body.force),
  });

  if (!result) {
    return NextResponse.json(
      {
        error: "BOOK_NOT_FOUND",
        message: "Không tìm thấy sách cần lưu tiến độ.",
      },
      { status: 404 }
    );
  }

  const formattedProgress = {
    currentPage: result.progress.currentPage,
    progressPercent: result.progress.progressPercent,
    lastDevice: result.progress.lastDevice || null,
    updatedAt: new Date(result.progress.updatedAt).toISOString(),
  };

  if (result.conflict) {
    return NextResponse.json(
      {
        conflict: true,
        message: "Phát hiện tiến độ đọc mới hơn từ một thiết bị khác.",
        bookId: id,
        pageCount: result.bookPageCount,
        progress: formattedProgress,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    conflict: false,
    bookId: id,
    pageCount: result.bookPageCount,
    progress: formattedProgress,
  });
}

/* Executes documented symbol logic in route.js. */
export async function PUT(request, context) {
  return handleSaveProgress(request, context);
}

/* Executes documented symbol logic in route.js. */
export async function POST(request, context) {
  return handleSaveProgress(request, context);
}
