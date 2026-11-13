// Provides module declarations and business logic for route.js.

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Executes documented symbol logic in route.js.
function resolvePdfWorkerPath(requestedVersion = "") {
  const rootDir = process.cwd();
  const candidates = [];

  const cleanVersion =
    typeof requestedVersion === "string" && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(requestedVersion.trim())
      ? requestedVersion.trim()
      : "";

  if (cleanVersion) {
    candidates.push(
      path.join(
        rootDir,
        "node_modules",
        ".pnpm",
        `pdfjs-dist@${cleanVersion}`,
        "node_modules",
        "pdfjs-dist",
        "build",
        "pdf.worker.min.mjs"
      )
    );
  }

  try {
    const reactPdfPkgPath = path.join(rootDir, "node_modules", "react-pdf", "package.json");
    if (fs.existsSync(reactPdfPkgPath)) {
      const reactPdfPkg = JSON.parse(fs.readFileSync(reactPdfPkgPath, "utf8"));
      const reactPdfVersion = reactPdfPkg?.dependencies?.["pdfjs-dist"];
      if (reactPdfVersion) {
        candidates.push(
          path.join(
            rootDir,
            "node_modules",
            ".pnpm",
            `pdfjs-dist@${reactPdfVersion}`,
            "node_modules",
            "pdfjs-dist",
            "build",
            "pdf.worker.min.mjs"
          )
        );
      }

      const reactPdfRealDir = path.dirname(fs.realpathSync(reactPdfPkgPath));
      candidates.push(
        path.resolve(reactPdfRealDir, "..", "pdfjs-dist", "build", "pdf.worker.min.mjs")
      );
    }
  } catch {
    // Executes documented symbol logic in route.js.
  }

  candidates.push(path.join(rootDir, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"));

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/* Executes documented symbol logic in route.js. */
export async function GET(request) {
  const requestedVersion = request?.nextUrl?.searchParams?.get?.("v") || "";
  const workerPath = resolvePdfWorkerPath(requestedVersion);
  if (!workerPath) {
    return new NextResponse("// Không tìm thấy tệp PDF.js worker\n", {
      status: 404,
      headers: { "Content-Type": "text/javascript; charset=utf-8" },
    });
  }

  const content = fs.readFileSync(workerPath);
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
