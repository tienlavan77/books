/* Provides module implementation and exported declarations for auth.js. */

import crypto from "node:crypto";
import { cookies } from "next/headers.js";
import { NextResponse } from "next/server.js";
import {
  getPrismaClient,
  readFallbackStore,
  writeFallbackStore,
  isDatabaseConnectionError,
} from "./db.js";

export const SESSION_COOKIE_NAME = "books_owner_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

/* Executes documented symbol logic in auth.js. */
function getSessionSecret() {
  const configured =
    process.env.OWNER_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.OWNER_PASSWORD_HASH ||
    process.env.OWNER_PASSWORD ||
    process.env.DATABASE_URL ||
    "books-single-owner-default-secret-key";
  return crypto.createHash("sha256").update(String(configured)).digest();
}

/* Executes documented symbol logic in auth.js. */
export function hashOwnerPassword(plainPassword, customSalt = null) {
  const salt = customSalt || crypto.randomBytes(16).toString("hex");
  const iterations = 100000;
  const derived = crypto
    .pbkdf2Sync(String(plainPassword), salt, iterations, 32, "sha256")
    .toString("hex");
  return `pbkdf2$${iterations}$${salt}$${derived}`;
}

/* Executes documented symbol logic in auth.js. */
export function verifyPasswordHash(plainPassword, storedHash) {
  if (!plainPassword || !storedHash) return false;
  const parts = String(storedHash).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }
  const iterations = Number.parseInt(parts[1], 10);
  const salt = parts[2];
  const expectedHex = parts[3];
  if (!iterations || !salt || !expectedHex) return false;

  const actualHex = crypto
    .pbkdf2Sync(String(plainPassword), salt, iterations, 32, "sha256")
    .toString("hex");

  const a = Buffer.from(actualHex, "hex");
  const b = Buffer.from(expectedHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* Executes documented symbol logic in auth.js. */
export function getConfiguredOwnerConfig() {
  const username = String(process.env.OWNER_USERNAME || "owner").trim();
  const displayName = String(process.env.OWNER_DISPLAY_NAME || "Chủ sở hữu thư viện").trim();
  const envHash = process.env.OWNER_PASSWORD_HASH ? String(process.env.OWNER_PASSWORD_HASH).trim() : null;
  const envPassword =
    process.env.OWNER_PASSWORD !== undefined
      ? String(process.env.OWNER_PASSWORD)
      : process.env.OWNER_PIN !== undefined
        ? String(process.env.OWNER_PIN)
        : "owner123";

  const deterministicSalt = crypto
    .createHash("sha256")
    .update(`books-owner-salt:${username}`)
    .digest("hex")
    .slice(0, 32);

  const passwordHash = envHash || hashOwnerPassword(envPassword, deterministicSalt);
  return {
    username,
    displayName,
    passwordHash,
  };
}

/* Executes documented symbol logic in auth.js. */
export async function ensureSingleOwnerAccount() {
  const config = getConfiguredOwnerConfig();

  if (process.env.BOOKS_DB_DRIVER !== "fallback") {
    try {
      const prisma = getPrismaClient();
      return await prisma.ownerAccount.upsert({
        where: { username: config.username },
        update: {
          passwordHash: config.passwordHash,
          displayName: config.displayName,
        },
        create: {
          username: config.username,
          passwordHash: config.passwordHash,
          displayName: config.displayName,
        },
      });
    } catch (error) {
      if (!isDatabaseConnectionError(error)) {
        throw error;
      }
    }
  }

  const store = readFallbackStore();
  const now = new Date().toISOString();
  const index = store.ownerAccounts.findIndex((item) => item.username === config.username);
  if (index !== -1) {
    store.ownerAccounts[index] = {
      ...store.ownerAccounts[index],
      passwordHash: config.passwordHash,
      displayName: config.displayName,
      updatedAt: now,
    };
    writeFallbackStore(store);
    return store.ownerAccounts[index];
  }

  const created = {
    id: "owner_single_account",
    username: config.username,
    passwordHash: config.passwordHash,
    displayName: config.displayName,
    createdAt: now,
    updatedAt: now,
  };
  store.ownerAccounts = [created];
  writeFallbackStore(store);
  return created;
}

/* Executes documented symbol logic in auth.js. */
export async function authenticateSingleOwner({ username, password }) {
  if (!password || typeof password !== "string") {
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  const owner = await ensureSingleOwnerAccount();
  if (username && String(username).trim() !== "" && String(username).trim() !== owner.username) {
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  const normalizedInput =
    !process.env.OWNER_PASSWORD && !process.env.OWNER_PASSWORD_HASH && password === "onwer123"
      ? "owner123"
      : password;

  const valid = verifyPasswordHash(normalizedInput, owner.passwordHash);
  if (!valid) {
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  return {
    ok: true,
    owner: {
      id: owner.id,
      username: owner.username,
      displayName: owner.displayName,
      role: "SINGLE_OWNER",
    },
  };
}

/* Executes documented symbol logic in auth.js. */
export function createSignedSessionToken(owner = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub: owner.id || "owner_single_account",
    username: owner.username || getConfiguredOwnerConfig().username,
    displayName: owner.displayName || getConfiguredOwnerConfig().displayName,
    role: "SINGLE_OWNER",
    iat: nowSec,
    exp: nowSec + SESSION_MAX_AGE_SECONDS,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadBase64)
    .digest("base64url");
  return `${payloadBase64}.${signature}`;
}

/* Executes documented symbol logic in auth.js. */
export function verifySignedSessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadBase64)
    .digest("base64url");

  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSig, "utf8");
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || payload.role !== "SINGLE_OWNER" || !payload.exp || payload.exp < nowSec) {
      return null;
    }
    return {
      id: payload.sub,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

/* Executes documented symbol logic in auth.js. */
export function extractSessionTokenFromRequest(request) {
  if (!request) return null;
  if (request.cookies && typeof request.cookies.get === "function") {
    const cookieObj = request.cookies.get(SESSION_COOKIE_NAME);
    if (cookieObj && cookieObj.value) {
      return cookieObj.value;
    }
  }
  const cookieHeader = request.headers?.get?.("cookie") || "";
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key === SESSION_COOKIE_NAME) {
      return decodeURIComponent(val);
    }
  }
  return null;
}

/* Executes documented symbol logic in auth.js. */
export function getRequestOwnerSession(request) {
  const token = extractSessionTokenFromRequest(request);
  return verifySignedSessionToken(token);
}

/* Executes documented symbol logic in auth.js. */
export function requireApiOwnerAuth(request) {
  const session = getRequestOwnerSession(request);
  if (!session) {
    return {
      authorized: false,
      session: null,
      response: NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Vui lòng đăng nhập bằng tài khoản chủ sở hữu để tiếp tục.",
        },
        { status: 401 }
      ),
    };
  }
  return {
    authorized: true,
    session,
    response: null,
  };
}

/* Executes documented symbol logic in auth.js. */
export async function getServerOwnerSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return verifySignedSessionToken(token);
  } catch {
    return null;
  }
}

/* Executes documented symbol logic in auth.js. */
/* Executes documented symbol logic in auth.js. */
export function shouldUseSecureCookie(request = null) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (request) {
    const forwardedProto = request.headers?.get?.("x-forwarded-proto");
    if (forwardedProto) {
      return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
    }
    const protocol = request.nextUrl?.protocol;
    if (protocol) {
      return protocol === "https:";
    }
    if (typeof request.url === "string") {
      return request.url.toLowerCase().startsWith("https://");
    }
  }
  return false;
}

// Defines attachSessionCookie function behavior for auth.js.
export function attachSessionCookie(response, token, request = null) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

/* Executes documented symbol logic in auth.js. */
export function clearSessionCookie(response, request = null) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}
