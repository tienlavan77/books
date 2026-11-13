/* Provides module implementation and exported declarations for pdf-client-utils.js. */
"use client";

/* Executes documented symbol logic in pdf-client-utils.js. */
export function buildPdfDocumentOptions() {
  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  const basePrefix = `${origin}/api/pdf-worker`;

  return {
    cMapUrl: `${basePrefix}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${basePrefix}/standard_fonts/`,
    wasmUrl: `${basePrefix}/wasm/`,
    iccUrl: `${basePrefix}/iccs/`,
    isEvalSupported: false,
  };
}

/* Executes documented symbol logic in pdf-client-utils.js. */
export async function extractClientPdfPreview(file) {
  if (typeof window === "undefined" || !file) {
    return { pageCount: null, thumbnailDataUrl: null };
  }

  try {
    const { pdfjs } = await import("react-pdf");
    pdfjs.GlobalWorkerOptions.workerSrc = `/api/pdf-worker?v=${encodeURIComponent(pdfjs.version || "6.3.289")}`;

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      ...buildPdfDocumentOptions(),
    });
    const pdfDocument = await loadingTask.promise;
    const pageCount = pdfDocument.numPages || 1;

    let thumbnailDataUrl = null;
    try {
      const firstPage = await pdfDocument.getPage(1);
      const baseViewport = firstPage.getViewport({ scale: 1 });
      const targetWidth = 480;
      const scale = Math.min(2, Math.max(0.5, targetWidth / Math.max(1, baseViewport.width)));
      const viewport = firstPage.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });

      if (context) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await firstPage.render({
          canvasContext: context,
          viewport,
        }).promise;
        thumbnailDataUrl = canvas.toDataURL("image/webp", 0.84);
      }
      firstPage.cleanup();
    } catch {
      // Executes documented symbol logic in pdf-client-utils.js.
    }

    await pdfDocument.destroy();
    return {
      pageCount,
      thumbnailDataUrl,
    };
  } catch {
    return {
      pageCount: null,
      thumbnailDataUrl: null,
    };
  }
}
