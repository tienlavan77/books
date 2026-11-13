/* Provides module implementation and exported declarations for route.js. */

import { NextResponse } from "next/server.js";
import { requireApiOwnerAuth } from "../../../lib/auth.js";
import { handlePdfUploadFormData } from "../../../lib/upload-service.js";

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
        message: "Không thể xử lý tệp PDF tải lên.",
      },
      { status: 500 }
    );
  }
}
