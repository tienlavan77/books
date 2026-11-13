/* Provides module implementation and exported declarations for reader-metrics.js. */

export const MAX_CACHED_PRIOR_PAGES = 10;
export const PRELOAD_NEXT_PAGES_COUNT = 10;

/* Executes documented symbol logic in reader-metrics.js. */
export function computeReaderViewportMetrics(
  viewportWidth,
  viewportHeight,
  layoutOverride = "auto",
  isFullscreen = false
) {
  const safeW = Math.max(320, viewportWidth || 1024);
  const safeH = Math.max(480, viewportHeight || 768);
  const isSpread =
    layoutOverride === "spread"
      ? true
      : layoutOverride === "single"
        ? false
        : safeW >= 920 && safeW > safeH * 0.85;

  const chromeHeightOffset = isFullscreen ? 128 : 185;
  const availableHeight = Math.max(320, safeH - chromeHeightOffset);
  const availableWidth = Math.max(280, safeW - (isSpread ? 80 : 28));
  const pageAspectRatio = 1.414;

  let pageWidth;
  let pageHeight;

  if (isSpread) {
    const maxSingleWidthFromSpread = Math.floor(availableWidth / 2);
    const widthByHeight = Math.floor(availableHeight / pageAspectRatio);
    const maxCap = isFullscreen ? 660 : 560;
    pageWidth = Math.max(240, Math.min(maxCap, maxSingleWidthFromSpread, widthByHeight));
    pageHeight = Math.floor(pageWidth * pageAspectRatio);
  } else {
    const widthByHeight = Math.floor(availableHeight / pageAspectRatio);
    const maxCap = isFullscreen ? 780 : 680;
    pageWidth = Math.max(260, Math.min(maxCap, availableWidth, widthByHeight));
    pageHeight = Math.floor(pageWidth * pageAspectRatio);
  }

  const pixelRatio = safeW < 768 ? 1.35 : 1.75;
  return {
    isSpread,
    pageWidth,
    pageHeight,
    pixelRatio,
  };
}

/* Executes documented symbol logic in reader-metrics.js. */
export function updateVisitedPageCache(
  previousCache = [],
  activePage = 1,
  totalPages = 1,
  isSpread = false,
  maxCachedPriorPages = MAX_CACHED_PRIOR_PAGES
) {
  const validTotal = Math.max(1, Math.trunc(Number(totalPages) || 1));
  // Defines clamp function behavior for reader-metrics.js.
  const clamp = (p) => Math.min(validTotal, Math.max(1, Math.trunc(Number(p) || 1)));
  const current = clamp(activePage);
  const priorLimit = Math.max(0, Math.trunc(Number(maxCachedPriorPages) ?? MAX_CACHED_PRIOR_PAGES));
  const startPrior = Math.max(1, current - priorLimit);
  const endActive = isSpread ? Math.min(validTotal, current + 1) : current;

  const windowPages = [];
  for (let p = startPrior; p <= endActive; p += 1) {
    windowPages.push(p);
  }
  return windowPages;
}

/* Executes documented symbol logic in reader-metrics.js. */
export function computeRenderedPagesSet({
  activePage = 1,
  totalPages = 1,
  isSpread = false,
  cachedPages = [],
  preloadAheadCount = PRELOAD_NEXT_PAGES_COUNT,
  maxCachedPriorPages = MAX_CACHED_PRIOR_PAGES,
}) {
  const validTotal = Math.max(1, Math.trunc(Number(totalPages) || 1));
  const current = Math.min(validTotal, Math.max(1, Math.trunc(Number(activePage) || 1)));
  const priorLimit = Math.max(0, Math.trunc(Number(maxCachedPriorPages) ?? MAX_CACHED_PRIOR_PAGES));
  const aheadLimit = Math.max(0, Math.trunc(Number(preloadAheadCount) ?? PRELOAD_NEXT_PAGES_COUNT));

  const startPage = Math.max(1, current - priorLimit);
  const baseMaxActive = isSpread ? Math.min(validTotal, current + 1) : current;
  const endPage = Math.min(validTotal, baseMaxActive + aheadLimit);

  const activeSet = new Set();
  for (let page = startPage; page <= endPage; page += 1) {
    activeSet.add(page);
  }

  if (Array.isArray(cachedPages)) {
    for (const p of cachedPages) {
      const normalized = Math.trunc(Number(p) || 0);
      if (normalized >= startPage && normalized <= endPage) {
        activeSet.add(normalized);
      }
    }
  }

  return activeSet;
}
