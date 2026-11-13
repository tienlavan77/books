// Provides module declarations and business logic for route.js.

import { NextResponse } from "next/server.js";
import {
  attachSessionCookie,
  authenticateSingleOwner,
  createSignedSessionToken,
  getRequestOwnerSession,
} from "../../../../lib/auth.js";

export const runtime = "nodejs";

// Executes documented symbol logic in route.js.
function resolveSafeNextPath(rawNext) {
  const nextPath = typeof rawNext === "string" ? rawNext.trim() : "";
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }
  return "/";
}

// Executes documented symbol logic in route.js.
function buildRedirectUrl(request, targetPath) {
  const host =
    request.headers?.get?.("x-forwarded-host") ||
    request.headers?.get?.("host") ||
    request.nextUrl?.host ||
    "localhost:3200";
  const protoHeader = request.headers?.get?.("x-forwarded-proto");
  const proto = protoHeader
    ? protoHeader.split(",")[0].trim()
    : request.nextUrl?.protocol?.replace(":", "") || "http";
  return new URL(targetPath, `${proto}://${host}`);
}

/* Executes documented symbol logic in route.js. */
export async function GET(request) {
  const session = getRequestOwnerSession(request);
  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
        owner: null,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    owner: session,
  });
}

/* Executes documented symbol logic in route.js. */
export async function POST(request) {
  const contentType = (request.headers?.get?.("content-type") || "").toLowerCase();
  const isFormSubmit =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  try {
    let username = "";
    let password = "";
    let nextPath = "/";

    if (isFormSubmit) {
      const formData = await request.formData();
      username = formData.get("username") ? String(formData.get("username")) : "";
      password = String(formData.get("password") ?? formData.get("pin") ?? "");
      nextPath = resolveSafeNextPath(formData.get("next"));
    } else {
      const body = await request.json().catch(() => ({}));
      username = body?.username ? String(body.username) : "";
      password = body?.password ?? body?.pin ?? "";
      nextPath = resolveSafeNextPath(body?.next);
    }

    const result = await authenticateSingleOwner({ username, password });
    if (!result.ok) {
      if (isFormSubmit) {
        const loginUrl = buildRedirectUrl(request, "/login");
        loginUrl.searchParams.set("error", "invalid");
        if (nextPath !== "/") {
          loginUrl.searchParams.set("next", nextPath);
        }
        return NextResponse.redirect(loginUrl, { status: 303 });
      }
      return NextResponse.json(
        {
          error: "INVALID_CREDENTIALS",
          message: "Mật khẩu hoặc mã PIN chủ sở hữu không chính xác.",
        },
        { status: 401 }
      );
    }

    const token = createSignedSessionToken(result.owner);

    if (isFormSubmit) {
      const redirectUrl = buildRedirectUrl(request, nextPath);
      const response = NextResponse.redirect(redirectUrl, { status: 303 });
      attachSessionCookie(response, token, request);
      return response;
    }

    const response = NextResponse.json({
      authenticated: true,
      owner: result.owner,
      redirectTo: nextPath,
    });

    attachSessionCookie(response, token, request);
    return response;
  } catch (error) {
    console.error("[auth/login] Error:", error);
    if (isFormSubmit) {
      const loginUrl = buildRedirectUrl(request, "/login?error=server");
      return NextResponse.redirect(loginUrl, { status: 303 });
    }
    return NextResponse.json(
      {
        error: "AUTH_ERROR",
        message: `Lỗi xác thực: ${error?.message || "Không thể xử lý yêu cầu đăng nhập"}`,
      },
      { status: 500 }
    );
  }
}
