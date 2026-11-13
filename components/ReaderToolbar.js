/* Provides module implementation and exported declarations for ReaderToolbar.js. */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

export {
  computeReaderViewportMetrics,
  updateVisitedPageCache,
  computeRenderedPagesSet,
  MAX_CACHED_PRIOR_PAGES,
  PRELOAD_NEXT_PAGES_COUNT,
} from "../lib/reader-metrics";

/* Executes documented symbol logic in ReaderToolbar.js. */
export function useReaderProgressSync({ bookId, initialProgress, currentPage, numPages, pdfReady }) {
  const latestSyncedPageRef = useRef(initialProgress?.currentPage || 1);
  const serverUpdatedAtRef = useRef(initialProgress?.updatedAt || null);
  const requestSequenceRef = useRef(0);
  const [syncState, setSyncState] = useState("Đã đồng bộ");
  const [remoteConflict, setRemoteConflict] = useState(null);

  const saveProgressToServer = useCallback(
    async (targetPage, totalPagesCount = numPages, forceWrite = false) => {
      const clamped = Math.min(Math.max(1, totalPagesCount), Math.max(1, targetPage));
      const percent =
        totalPagesCount <= 1
          ? 100
          : Math.min(100, Math.max(0, Math.round((clamped / totalPagesCount) * 1000) / 10));

      const requestSequence = ++requestSequenceRef.current;
      setSyncState("Đang lưu tiến độ...");
      try {
        const res = await fetch(`/api/books/${bookId}/progress`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPage: clamped,
            progressPercent: percent,
            pageCount: totalPagesCount,
            clientUpdatedAt: serverUpdatedAtRef.current,
            force: forceWrite,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (requestSequence !== requestSequenceRef.current) return;
        if (res.status === 409 && data?.conflict && data?.progress) {
          setRemoteConflict(data.progress);
          setSyncState("Có tiến độ mới hơn trên thiết bị khác");
          return;
        }

        if (res.ok && data?.progress) {
          latestSyncedPageRef.current = data.progress.currentPage;
          serverUpdatedAtRef.current = data.progress.updatedAt;
          setRemoteConflict(null);
          setSyncState(`Đã lưu Tr.${data.progress.currentPage} (${data.progress.progressPercent}%)`);
        } else {
          setSyncState("Chưa lưu được tiến độ");
        }
      } catch {
        if (requestSequence === requestSequenceRef.current) setSyncState("Tạm mất kết nối đồng bộ");
      }
    },
    [bookId, numPages]
  );

  useEffect(() => {
    if (!pdfReady || currentPage === latestSyncedPageRef.current) return;
    const debounceTimer = setTimeout(() => {
      saveProgressToServer(currentPage, numPages, false);
    }, 650);
    return () => clearTimeout(debounceTimer);
  }, [currentPage, numPages, pdfReady, saveProgressToServer]);

  useEffect(() => {
    /* Executes documented symbol logic in ReaderToolbar.js. */
    const checkRemoteProgress = async () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/books/${bookId}/progress`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!data?.progress) return;

        const remoteTime = new Date(data.progress.updatedAt).getTime();
        const localTime = serverUpdatedAtRef.current
          ? new Date(serverUpdatedAtRef.current).getTime()
          : 0;

        if (remoteTime > localTime && data.progress.currentPage !== currentPage) {
          setRemoteConflict(data.progress);
        }
      } catch {
        // Executes documented symbol logic in ReaderToolbar.js.
      }
    };

    window.addEventListener("focus", checkRemoteProgress);
    document.addEventListener("visibilitychange", checkRemoteProgress);
    return () => {
      window.removeEventListener("focus", checkRemoteProgress);
      document.removeEventListener("visibilitychange", checkRemoteProgress);
    };
  }, [bookId, currentPage]);

  useEffect(() => {
    /* Executes documented symbol logic in ReaderToolbar.js. */
    const flushProgressOnLeave = () => {
      if (currentPage === latestSyncedPageRef.current) return;
      const percent =
        numPages <= 1 ? 100 : Math.min(100, Math.max(0, Math.round((currentPage / numPages) * 1000) / 10));
      const payload = JSON.stringify({
        currentPage,
        progressPercent: percent,
        pageCount: numPages,
        clientUpdatedAt: serverUpdatedAtRef.current,
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          `/api/books/${bookId}/progress`,
          new Blob([payload], { type: "application/json" })
        );
      }
    };

    window.addEventListener("beforeunload", flushProgressOnLeave);
    return () => window.removeEventListener("beforeunload", flushProgressOnLeave);
  }, [currentPage, numPages, bookId]);

  /* Executes documented symbol logic in ReaderToolbar.js. */
  const acceptRemoteProgress = useCallback(() => {
    if (!remoteConflict) return null;
    serverUpdatedAtRef.current = remoteConflict.updatedAt;
    latestSyncedPageRef.current = remoteConflict.currentPage;
    const target = remoteConflict.currentPage;
    setRemoteConflict(null);
    return target;
  }, [remoteConflict]);

  /* Executes documented symbol logic in ReaderToolbar.js. */
  const keepLocalProgress = useCallback(() => {
    setRemoteConflict(null);
    saveProgressToServer(currentPage, numPages, true);
  }, [currentPage, numPages, saveProgressToServer]);

  return {
    syncState,
    remoteConflict,
    acceptRemoteProgress,
    keepLocalProgress,
  };
}

/* Executes documented symbol logic in ReaderToolbar.js. */
export function ReaderTopBar({
  title,
  isSpread,
  syncState,
  cachedCount = 0,
  currentPage,
  numPages,
  pageInput,
  setPageInput,
  onJumpSubmit,
  onPrevPage,
  onNextPage,
  zoom,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  layoutMode,
  setLayoutMode,
  nightMode = false,
  onToggleNightMode,
  isFullscreen = false,
  onToggleFullscreen,
}) {
  return (
    <header className="reader-topbar">
      <div className="reader-topbar-left">
        <Link href="/" className="btn-secondary reader-back-btn">
          ← Thư viện
        </Link>
        <div className="reader-book-info">
          <h1 className="reader-book-title" title={title}>
            {title}
          </h1>
          <span className="reader-sync-pill">
            {isSpread ? "Chế độ 2 trang mở" : "Chế độ 1 trang"} • {syncState}
            {cachedCount > 0 ? ` • Đệm ${cachedCount} trang` : ""}
          </span>
        </div>
      </div>

      <div className="reader-topbar-controls">
        <div className="reader-nav-group">
          <button
            type="button"
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            className="btn-reader-tool"
            title="Trang trước (← / ↑ / PageUp)"
          >
            ‹ Trước
          </button>

          <form onSubmit={onJumpSubmit} className="reader-jump-form">
            <input
              type="number"
              min={1}
              max={numPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              className="reader-page-input"
              aria-label="Số trang hiện tại"
            />
            <span className="reader-page-total">/ {numPages}</span>
            <button type="submit" className="btn-reader-tool">
              Đến
            </button>
          </form>

          <button
            type="button"
            onClick={onNextPage}
            disabled={currentPage >= numPages}
            className="btn-reader-tool"
            title="Trang tiếp (→ / ↓ / PageDown)"
          >
            Tiếp ›
          </button>
        </div>

        <div className="reader-zoom-group">
          <button
            type="button"
            onClick={onZoomOut}
            className="btn-reader-tool"
            title="Thu nhỏ"
          >
            −
          </button>
          <button
            type="button"
            onClick={onZoomReset}
            className="btn-reader-tool"
            title="Khớp vừa màn hình (100%)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="btn-reader-tool"
            title="Phóng to"
          >
            +
          </button>
          <select
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value)}
            className="reader-layout-select"
            aria-label="Chế độ bố cục trang"
          >
            <option value="auto">Tự động (1/2 trang)</option>
            <option value="single">Luôn 1 trang</option>
            <option value="spread">Luôn 2 trang</option>
          </select>

          <button
            type="button"
            onClick={onToggleNightMode}
            className={`btn-reader-tool ${nightMode ? "btn-reader-tool-active" : ""}`}
            aria-pressed={nightMode}
            title="Chế độ đọc ban đêm (Phím tắt: N)"
          >
            {nightMode ? "☀ Ban ngày" : "🌙 Ban đêm"}
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            className={`btn-reader-tool ${isFullscreen ? "btn-reader-tool-active" : ""}`}
            aria-pressed={isFullscreen}
            title="Toàn màn hình (Phím tắt: F)"
          >
            {isFullscreen ? "⤫ Thoát toàn màn hình" : "⛶ Toàn màn hình"}
          </button>
        </div>
      </div>
    </header>
  );
}

/* Executes documented symbol logic in ReaderToolbar.js. */
export function ReaderConflictBanner({
  remoteConflict,
  currentPage,
  onAcceptRemote,
  onKeepLocal,
}) {
  if (!remoteConflict) return null;

  return (
    <div className="reader-conflict-banner" role="alert">
      <span>
        Phát hiện vị trí đọc mới hơn từ phiên khác: <strong>Trang {remoteConflict.currentPage}</strong> (Hiện tại: Trang {currentPage})
      </span>
      <div className="conflict-actions">
        <button type="button" className="btn-primary btn-xs" onClick={onAcceptRemote}>
          Chuyển đến Trang {remoteConflict.currentPage}
        </button>
        <button type="button" className="btn-secondary btn-xs" onClick={onKeepLocal}>
          Giữ trang hiện tại
        </button>
      </div>
    </div>
  );
}
