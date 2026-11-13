/* Provides module implementation and exported declarations for PdfFlipReader.js. */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import ReaderFlipBook from "./ReaderFlipBook";
import ReaderProgressBar from "./ReaderProgressBar";
import { Document, pdfjs } from "react-pdf";
import { ReaderActivePageContext } from "./FlipPageSheet";
import { buildPdfDocumentOptions } from "./pdf-client-utils";
import { createReaderTransitionController } from "../lib/reader-transition";
import {
  computeReaderViewportMetrics,
  updateVisitedPageCache,
  computeRenderedPagesSet,
  MAX_CACHED_PRIOR_PAGES,
  PRELOAD_NEXT_PAGES_COUNT,
  useReaderProgressSync,
  ReaderTopBar,
  ReaderConflictBanner,
} from "./ReaderToolbar";

pdfjs.GlobalWorkerOptions.workerSrc = `/api/pdf-worker?v=${encodeURIComponent(pdfjs.version || "6.3.289")}`;

/* Executes documented symbol logic in PdfFlipReader.js. */
export default function PdfFlipReader({ initialBook }) {
  const shellRef = useRef(null);
  const flipBookRef = useRef(null);
  const pdfDocProxyRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const fullscreenExitRef = useRef(null);
  const transitionControllerRef = useRef(null);

  const [numPages, setNumPages] = useState(Math.max(1, initialBook?.pageCount || 1));
  const [currentPage, setCurrentPage] = useState(
    Math.min(
      Math.max(1, initialBook?.pageCount || 1),
      Math.max(1, initialBook?.progress?.currentPage || 1)
    )
  );
  const [pageInput, setPageInput] = useState(String(initialBook?.progress?.currentPage || 1));
  const [zoom, setZoom] = useState(1);
  const [layoutMode, setLayoutMode] = useState("auto");
  const [nightMode, setNightMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cachedPages, setCachedPages] = useState(() => [
    Math.max(1, initialBook?.progress?.currentPage || 1),
  ]);
  const [viewport, setViewport] = useState({ width: 1200, height: 800 });
  const [pdfReady, setPdfReady] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const pdfDocumentOptions = useMemo(() => buildPdfDocumentOptions(), []);

  if (!transitionControllerRef.current) {
    transitionControllerRef.current = createReaderTransitionController({
      maxQueue: 0,
      onCommit: ({ toPage }) => {
        setCurrentPage(toPage);
        setPageInput(String(toPage));
      },
    });
  }

  const {
    syncState,
    remoteConflict,
    acceptRemoteProgress,
    keepLocalProgress,
  } = useReaderProgressSync({
    bookId: initialBook.id,
    initialProgress: initialBook?.progress,
    currentPage,
    numPages,
    pdfReady,
  });

  useEffect(() => {
    try {
      const savedNight = window.localStorage.getItem("reader_night_mode");
      if (savedNight === "1") setNightMode(true);
    } catch {
      // Executes documented symbol logic in PdfFlipReader.js.
    }
  }, []);

  useEffect(() => () => {
    transitionControllerRef.current?.cancel("reader-unmount");
    const docProxy = pdfDocProxyRef.current;
    if (typeof docProxy?.destroy === "function") {
      docProxy.destroy().catch(() => {});
    }
    pdfDocProxyRef.current = null;
  }, []);

  /* Executes documented symbol logic in PdfFlipReader.js. */
  const toggleNightMode = useCallback(() => {
    setNightMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("reader_night_mode", next ? "1" : "0");
      } catch {
        // Executes documented symbol logic in PdfFlipReader.js.
      }
      return next;
    });
  }, []);

  /* Executes documented symbol logic in PdfFlipReader.js. */
  const toggleFullscreen = useCallback(async () => {
    const container = shellRef.current || document.documentElement;
    try {
      if (!document.fullscreenElement) {
        if (container?.requestFullscreen) {
          await container.requestFullscreen();
          setIsFullscreen(true);
          return;
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
        return;
      }
    } catch {
      // Executes documented symbol logic in PdfFlipReader.js.
    }
    setIsFullscreen((prev) => !prev);
  }, []);

  useEffect(() => {
    // Defines updateSize function behavior for PdfFlipReader.js.
    const updateSize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    // Defines onEscape function behavior for PdfFlipReader.js.
    const onEscape = (event) => {
      if (event.key === "Escape" && isFullscreen) toggleFullscreen();
    };
    /* Executes documented symbol logic in PdfFlipReader.js. */
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      updateSize();
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    window.addEventListener("orientationchange", updateSize);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("orientationchange", updateSize);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onEscape);
    };
  }, [isFullscreen, toggleFullscreen]);

  const metrics = useMemo(
    () => computeReaderViewportMetrics(viewport.width, viewport.height, layoutMode, isFullscreen),
    [viewport.width, viewport.height, layoutMode, isFullscreen]
  );

  useEffect(() => {
    if (isFullscreen) fullscreenExitRef.current?.focus();
  }, [isFullscreen]);

  useEffect(() => {
    setCachedPages((prev) =>
      updateVisitedPageCache(prev, currentPage, numPages, metrics.isSpread, MAX_CACHED_PRIOR_PAGES)
    );
  }, [currentPage, numPages, metrics.isSpread]);

  useEffect(() => {
    const docProxy = pdfDocProxyRef.current;
    if (!pdfReady || !docProxy || typeof docProxy.getPage !== "function") return;

    const baseMaxPage = metrics.isSpread ? Math.min(numPages, currentPage + 1) : currentPage;
    for (let offset = 1; offset <= PRELOAD_NEXT_PAGES_COUNT; offset += 1) {
      const targetAhead = baseMaxPage + offset;
      if (targetAhead >= 1 && targetAhead <= numPages) {
        docProxy.getPage(targetAhead).catch(() => {});
      }
    }
  }, [currentPage, numPages, pdfReady, metrics.isSpread]);

  const renderedPagesSet = useMemo(
    () =>
      computeRenderedPagesSet({
        activePage: currentPage,
        totalPages: numPages,
        isSpread: metrics.isSpread,
        cachedPages,
        preloadAheadCount: PRELOAD_NEXT_PAGES_COUNT,
        maxCachedPriorPages: MAX_CACHED_PRIOR_PAGES,
      }),
    [currentPage, numPages, metrics.isSpread, cachedPages]
  );

  const activeContextValue = useMemo(
    () => ({
      activePage: currentPage,
      renderedPagesSet,
      nightMode,
    }),
    [currentPage, renderedPagesSet, nightMode]
  );

  const goToPageNumber = useCallback(
    (targetPage) => {
      const clamped = Math.min(Math.max(1, numPages), Math.max(1, Number(targetPage) || 1));
      transitionControllerRef.current?.cancel("direct-jump");
      setCurrentPage(clamped);
      setPageInput(String(clamped));
      try {
        flipBookRef.current?.pageFlip?.()?.turnToPage(clamped - 1);
      } catch {
        // Executes documented symbol logic in PdfFlipReader.js.
      }
    },
    [numPages]
  );

  const beginSequentialTurn = useCallback(
    (target, direction, source) => {
      const pageFlipInstance = flipBookRef.current?.pageFlip?.();
      if (!pageFlipInstance || zoom !== 1 || target === currentPage) {
        goToPageNumber(target);
        return;
      }

      const result = transitionControllerRef.current.begin({
        fromPage: currentPage,
        toPage: target,
        source,
        invoke: () => {
          if (direction === "next") pageFlipInstance.flipNext();
          else pageFlipInstance.flipPrev();
        },
      });
      if (result.status === "rejected" && !transitionControllerRef.current.getSnapshot().activeTransitionId) {
        goToPageNumber(target);
      }
    },
    [currentPage, goToPageNumber, zoom]
  );

  const goPrevPage = useCallback(() => {
    const step = metrics.isSpread ? 2 : 1;
    const target = Math.max(1, currentPage - step);
    beginSequentialTurn(target, "previous", "navigation");
  }, [beginSequentialTurn, currentPage, metrics.isSpread]);

  const goNextPage = useCallback(() => {
    const step = metrics.isSpread ? 2 : 1;
    const target = Math.min(numPages, currentPage + step);
    beginSequentialTurn(target, "next", "navigation");
  }, [beginSequentialTurn, currentPage, metrics.isSpread, numPages]);

  useEffect(() => {
    // Defines onKeyDown function behavior for PdfFlipReader.js.
    const onKeyDown = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        goPrevPage();
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        goNextPage();
      } else if ((event.key === "f" || event.key === "F") && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        toggleFullscreen();
      } else if ((event.key === "n" || event.key === "N") && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        toggleNightMode();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goPrevPage, goNextPage, toggleFullscreen, toggleNightMode]);

  /* Executes documented symbol logic in PdfFlipReader.js. */
  function handleDocumentLoadSuccess(pdfDocument) {
    pdfDocProxyRef.current = pdfDocument || null;
    const validPages = Math.max(1, Number(pdfDocument?.numPages) || 1);
    setNumPages(validPages);
    setPdfReady(true);
    setPdfError("");

    // Document callbacks may run again after a render; never restore stale saved progress.
    setCurrentPage((page) => Math.min(validPages, Math.max(1, page)));

    if (validPages !== initialBook.pageCount) {
      fetch(`/api/books/${initialBook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageCount: validPages }),
      }).catch(() => {});
    }
  }

  /* Executes documented symbol logic in PdfFlipReader.js. */
  function commitFlipPage(nextPage) {
    const safePage = Math.min(numPages, Math.max(1, Number(nextPage) || 1));
    const transition = transitionControllerRef.current;
    if (transition?.getSnapshot().activeTransitionId) {
      transition.complete(safePage);
      return;
    }
    if (safePage === currentPage) return;
    setCurrentPage(safePage);
    setPageInput(String(safePage));
  }

  /* Executes documented symbol logic in PdfFlipReader.js. */
  function handleFlipEvent(event) {
    commitFlipPage(Number(event?.data || 0) + 1);
  }

  /* Completes a transition from react-pageflip's stable read state when onFlip
   * was not delivered by an older WebKit event path. */
  function handleFlipStateChange(event) {
    if (event?.data !== "read") return;
    const transition = transitionControllerRef.current;
    if (!transition?.getSnapshot().activeTransitionId) return;
    transition.completeActive();
  }

  /* Executes documented symbol logic in PdfFlipReader.js. */
  function handleJumpFormSubmit(event) {
    event.preventDefault();
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    goToPageNumber(parsed);
  }

  /* Executes documented symbol logic in PdfFlipReader.js. */
  function handleTouchStart(event) {
    if (zoom > 1 || !event.touches || event.touches.length !== 1) return;
    touchStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      time: Date.now(),
    };
  }

  /* Executes documented symbol logic in PdfFlipReader.js. */
  function handleTouchEnd(event) {
    if (zoom > 1 || !event.changedTouches || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = event.changedTouches[0].clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;

    if (elapsed < 650 && Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) goNextPage();
      else goPrevPage();
    }
  }

  return (
    <div
      ref={shellRef}
      className={`reader-shell ${nightMode ? "reader-night-mode" : ""} ${isFullscreen ? "reader-fullscreen" : ""}`}
    >
      {isFullscreen ? (
        <button
          ref={fullscreenExitRef}
          type="button"
          className="reader-fullscreen-exit"
          onClick={toggleFullscreen}
          aria-label="Thoát toàn màn hình"
        >
          ⤫
        </button>
      ) : null}
      <ReaderTopBar
        title={initialBook.title}
        isSpread={metrics.isSpread}
        syncState={syncState}
        cachedCount={renderedPagesSet.size}
        currentPage={currentPage}
        numPages={numPages}
        pageInput={pageInput}
        setPageInput={setPageInput}
        onJumpSubmit={handleJumpFormSubmit}
        onPrevPage={goPrevPage}
        onNextPage={goNextPage}
        zoom={zoom}
        onZoomOut={() => setZoom((z) => Math.max(0.75, Math.round((z - 0.15) * 100) / 100))}
        onZoomReset={() => setZoom(1)}
        onZoomIn={() => setZoom((z) => Math.min(2.2, Math.round((z + 0.15) * 100) / 100))}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        nightMode={nightMode}
        onToggleNightMode={toggleNightMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      <ReaderConflictBanner
        remoteConflict={remoteConflict}
        currentPage={currentPage}
        onAcceptRemote={() => {
          const target = acceptRemoteProgress();
          if (target) goToPageNumber(target);
        }}
        onKeepLocal={keepLocalProgress}
      />

      <main className="reader-stage" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div
          className="reader-zoom-container"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
        >
          <Suspense fallback={<div className="reader-loading-box">Đang khởi tạo trình đọc PDF...</div>}>
            <Document
              file={initialBook.fileUrl || `/api/books/${initialBook.id}/file`}
              options={pdfDocumentOptions}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={() =>
                setPdfError("Không thể tải tệp PDF từ máy chủ. Vui lòng kiểm tra lại phiên đăng nhập.")
              }
              loading={<div className="reader-loading-box">Đang tải luồng dữ liệu sách PDF...</div>}
              error={<div className="reader-error-box">{pdfError || "Không thể hiển thị tệp PDF này."}</div>}
              suspense={false}
            >
              {pdfReady ? (
                <ReaderActivePageContext.Provider value={activeContextValue}>
                  <div className="flipbook-frame">
                    <ReaderFlipBook
                      key={`${metrics.isSpread ? "spread" : "single"}-${metrics.pageWidth}-${metrics.pageHeight}-${numPages}`}
                      ref={flipBookRef}
                      metrics={metrics}
                      numPages={numPages}
                      currentPage={currentPage}
                      zoom={zoom}
                      controller={transitionControllerRef.current}
                      onFlip={handleFlipEvent}
                      onState={handleFlipStateChange}
                    />
                  </div>
                </ReaderActivePageContext.Provider>
              ) : null}
            </Document>
          </Suspense>
        </div>
      </main>

      <ReaderProgressBar currentPage={currentPage} numPages={numPages} onPageChange={goToPageNumber} />
    </div>
  );
}
