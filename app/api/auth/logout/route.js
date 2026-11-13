/* Provides module implementation and exported declarations for route.js. */

import { NextResponse } from "next/server.js";
import { clearSessionCookie } from "../../../../lib/auth.js";

/* Executes documented symbol logic in route.js. */
export async function POST(request) {
  const response = NextResponse.json({
    loggedOut: true,
    message: "Đã đăng xuất khỏi thư viện cá nhân.",
  });
  clearSessionCookie(response, request);
  return response;
}
