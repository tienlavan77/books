/* Provides module implementation and exported declarations for route.js. */

import { NextResponse } from "next/server.js";
import { requireApiOwnerAuth } from "../../../lib/auth.js";
import { listBooksWithProgress } from "../../../lib/books-repo.js";
import { handlePdfUploadFormData, serializeBookForClient } from "../../../lib/upload-service.js";

/* Executes documented symbol logic in route.js. */
export async function GET(request) {
  const auth = requireApiOwnerAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("q") || url.searchParams.get("search") || "";
    const sort = url.searchParams.get("sort") || "recent";

    const books = await listBooksWithProgress({ search, sort });
    return NextResponse.json({
      books: books.map((book) => serializeBookForClient(book)),
    });
  } catch {
    return NextResponse.json(
      {
        error: "FETCH_BOOKS_FAILED",
        message: "Không thể tải danh sách thư viện sách lúc này.",
      },
      { status: 500 }
    );
  }
}

/* Executes documented symbol logic in route.js. */
export async function POST(request) {
  const auth = requireApiOwnerAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const result = await handlePdfUploadFormData(formData);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          message: result.message,
        },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json(
      {
        book: result.book,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        error: "UPLOAD_FAILED",
        message: "Đã xảy ra lỗi khi tải tệp PDF lên máy chủ.",
      },
      { status: 500 }
    );
  }
}
