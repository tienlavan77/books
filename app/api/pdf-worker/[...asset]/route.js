/* Provides module implementation and exported declarations for route.js. */
import fs from "node:fs";
import path from "node:path";

const ALLOWED_ASSET_DIRS = new Set(["wasm", "cmaps", "standard_fonts", "iccs"]);

/* Executes documented symbol logic in route.js. */
function resolvePdfjsDistDir() {
  const rootDir = process.cwd();
  const candidates = [];

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
            "pdfjs-dist"
          )
        );
      }

      const reactPdfRealDir = path.dirname(fs.realpathSync(reactPdfPkgPath));
      candidates.push(path.resolve(reactPdfRealDir, "..", "pdfjs-dist"));
    }
  } catch {
    // Executes documented symbol logic in route.js.
  }

  candidates.push(path.join(rootDir, "node_modules", "pdfjs-dist"));

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/* Executes documented symbol logic in route.js. */
function getAssetContentType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".wasm")) return "application/wasm";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".bcmap") || lower.endsWith(".icc") || lower.endsWith(".pfb")) {
    return "application/octet-stream";
  }
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".otf")) return "font/otf";
  return "application/octet-stream";
}

/* Executes documented symbol logic in route.js. */
export async function GET(_request, context) {
  const resolvedParams = await context?.params;
  const segments = Array.isArray(resolvedParams?.asset) ? resolvedParams.asset : [];

  if (segments.length !== 2) {
    return new Response("Not Found", { status: 404 });
  }

  const [category, rawFilename] = segments;
  if (!ALLOWED_ASSET_DIRS.has(category)) {
    return new Response("Not Found", { status: 404 });
  }

  const filename = path.basename(String(rawFilename || ""));
  if (!filename || filename !== rawFilename || filename.includes("..")) {
    return new Response("Not Found", { status: 404 });
  }

  const pdfjsDir = resolvePdfjsDistDir();
  if (!pdfjsDir) {
    return new Response("Not Found", { status: 404 });
  }

  const targetDir = path.resolve(pdfjsDir, category);
  const targetFile = path.resolve(targetDir, filename);

  if (!targetFile.startsWith(targetDir + path.sep) || !fs.existsSync(targetFile)) {
    return new Response("Not Found", { status: 404 });
  }

  const content = fs.readFileSync(targetFile);
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": getAssetContentType(filename),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
