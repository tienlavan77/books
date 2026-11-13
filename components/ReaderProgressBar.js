/* Displays reading progress and direct page navigation independently of flipbook
 * layout mounts, keeping fullscreen lifecycle changes out of the progress UI. */
"use client";

// Renders the existing progress slider and keyboard hints without owning page state.
export default function ReaderProgressBar({ currentPage, numPages, onPageChange }) {
  const percent = numPages <= 1 ? 100 : Math.min(100, Math.max(0, Math.round((currentPage / numPages) * 1000) / 10));
  return (
    <footer className="reader-bottombar">
      <div className="reader-scrubber-row">
        <span className="scrubber-label">
          Trang {currentPage} / {numPages} ({percent}%)
        </span>
        <input
          type="range"
          min={1}
          max={numPages}
          value={currentPage}
          onChange={(event) => onPageChange(Number(event.target.value))}
          className="reader-range-slider"
          aria-label="Thanh kéo tiến trình đọc sách"
        />
        <span className="scrubber-hint">
          Phím tắt: ← ↑ → ↓ lật trang • N chế độ ban đêm • F toàn màn hình
        </span>
      </div>
    </footer>
  );
}
