/* Provides module implementation and exported declarations for proxy.js. */

import { NextResponse } from "next/server";
import { getRequestOwnerSession } from "@/lib/auth";

/* Executes documented symbol logic in proxy.js. */
export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/register" ||
    pathname === "/signup" ||
    pathname.startsWith("/api/auth/register") ||
    pathname.startsWith("/api/auth/signup")
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "REGISTRATION_DISABLED",
          message: "Hệ thống chỉ dành cho một chủ sở hữu cố định (SINGLE_OWNER), không mở đăng ký công khai.",
        },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/pdf-worker")
  ) {
    return NextResponse.next();
  }

  const session = getRequestOwnerSession(request);

  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/books") || pathname.startsWith("/api/uploads")) {
    if (!session) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Vui lòng đăng nhập bằng tài khoản chủ sở hữu để truy cập tài nguyên này.",
        },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    if (pathname && pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/books|api/uploads).*)"],
};
