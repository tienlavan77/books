/* Provides module implementation and exported declarations for db.js. */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

/* Executes documented symbol logic in db.js. */
export function getPrismaClient() {
  if (!globalForPrisma.__booksPrismaClient) {
    globalForPrisma.__booksPrismaClient = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.__booksPrismaClient;
}

/* Executes documented symbol logic in db.js. */
export function getFallbackCatalogPath() {
  const storageRoot = path.resolve(process.cwd(), process.env.FILE_STORAGE_PATH || "./storage");
  if (!fs.existsSync(storageRoot)) {
    fs.mkdirSync(storageRoot, { recursive: true, mode: 0o700 });
  }
  return path.join(storageRoot, ".catalog-db.json");
}

/* Executes documented symbol logic in db.js. */
export function readFallbackStore() {
  const filePath = getFallbackCatalogPath();
  if (!fs.existsSync(filePath)) {
    return { ownerAccounts: [], books: [], readingProgress: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ownerAccounts: Array.isArray(parsed.ownerAccounts) ? parsed.ownerAccounts : [],
      books: Array.isArray(parsed.books) ? parsed.books : [],
      readingProgress: Array.isArray(parsed.readingProgress) ? parsed.readingProgress : [],
    };
  } catch {
    return { ownerAccounts: [], books: [], readingProgress: [] };
  }
}

/* Executes documented symbol logic in db.js. */
export function writeFallbackStore(store) {
  const filePath = getFallbackCatalogPath();
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

/* Executes documented symbol logic in db.js. */
export function isDatabaseConnectionError(error) {
  if (!error) return false;
  const code = error.code || "";
  if (["P1000", "P1001", "P1002", "P1003", "P2021"].includes(code)) {
    return true;
  }
  const message = String(error.message || "");
  return (
    message.includes("Authentication failed against database server") ||
    message.includes("Can't reach database server") ||
    message.includes("Access to this API has been restricted") ||
    message.includes("does not exist in the current database")
  );
}
