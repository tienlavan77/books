/* Provides module implementation and exported declarations for FlipPageSheet.js. */
"use client";

import { createContext, forwardRef, Suspense, useState, useCallback, useContext } from "react";
import { Page } from "react-pdf";

export const ReaderActivePageContext = createContext({
  activePage: 1,
  renderedPagesSet: null,
  nightMode: false,
});

/* Executes documented symbol logic in FlipPageSheet.js. */
const FlipPageSheet = forwardRef(function FlipPageSheet(
  {
    pageNumber,
    totalPages,
    width,
    height,
    shouldRenderCanvas,
    devicePixelRatio = 1.5,
    isSpreadMode = false,
  },
  ref
) {
  const contextValue = useContext(ReaderActivePageContext);
  const activePage =
    typeof contextValue === "number" ? contextValue : Number(contextValue?.activePage) || 1;
  const renderedPagesSet =
    typeof contextValue === "object" && contextValue !== null
      ? contextValue.renderedPagesSet
      : null;

  const [pageAspect, setPageAspect] = useState(null);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [renderFailed, setRenderFailed] = useState(false);

  const isLeftPage = isSpreadMode && pageNumber % 2 === 1;
  const sideClass = isSpreadMode
    ? isLeftPage
      ? "page-sheet-left"
      : "page-sheet-right"
    : "page-sheet-single";

  /* Computes page aspect ratio when PDF page metadata loads so the canvas fits within sheet bounds. */
  const handlePageLoadSuccess = useCallback((page) => {
    setRenderFailed(false);
    const origW = Number(page?.originalWidth) || Number(page?.width) || 0;
    const origH = Number(page?.originalHeight) || Number(page?.height) || 0;
    if (origW > 0 && origH > 0) {
      setPageAspect(origH / origW);
    }
  }, []);

  /* Xử lý lỗi khi dựng canvas trang PDF và tự động thử lại một lần nếu bộ giải mã ảnh chưa sẵn sàng. */
  const handlePageRenderError = useCallback(() => {
    setRenderAttempt((prev) => {
      if (prev < 2) {
        return prev + 1;
      }
      setRenderFailed(true);
      return prev;
    });
  }, []);

  const fallbackWindow = isSpreadMode ? 11 : 10;
  const shouldKeepRendered =
    typeof shouldRenderCanvas === "boolean"
      ? shouldRenderCanvas
      : renderedPagesSet instanceof Set
        ? renderedPagesSet.has(pageNumber)
        : Math.abs(pageNumber - activePage) <= fallbackWindow;

  const availHeight = Math.max(100, height - 24);
  const fittedWidth =
    pageAspect && width * pageAspect > availHeight
      ? Math.max(120, Math.floor(availHeight / pageAspect))
      : width;

  return (
    <div
      ref={ref}
      className={`flip-page-sheet ${sideClass}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
      data-page-number={pageNumber}
      data-cached={shouldKeepRendered ? "true" : "false"}
    >
      <div className="flip-page-inner">
        {shouldKeepRendered ? (
          <Suspense
            fallback={
              <div className="flip-page-placeholder">
                <span>Đang dựng trang {pageNumber}...</span>
              </div>
            }
          >
            {renderFailed ? (
              <div className="flip-page-placeholder">
                <span>Không thể hiển thị trang {pageNumber}</span>
                <button
                  type="button"
                  className="btn-reader-tool"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenderFailed(false);
                    setRenderAttempt((n) => n + 1);
                  }}
                >
                  Thử tải lại trang
                </button>
              </div>
            ) : (
              <Page
                key={`page-${pageNumber}-attempt-${renderAttempt}`}
                pageNumber={pageNumber}
                width={fittedWidth}
                devicePixelRatio={devicePixelRatio}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                onLoadSuccess={handlePageLoadSuccess}
                onRenderError={handlePageRenderError}
                onLoadError={handlePageRenderError}
                loading={
                  <div className="flip-page-placeholder">
                    <span>Đang tải trang {pageNumber}...</span>
                  </div>
                }
              />
            )}
          </Suspense>
        ) : (
          <div className="flip-page-placeholder">
            <span className="placeholder-page-num">Trang {pageNumber}</span>
            <span className="placeholder-page-sub">Cuộn hoặc lật tới gần để hiển thị</span>
          </div>
        )}

        <div className="flip-page-footer">
          <span>
            Trang {pageNumber} / {totalPages}
          </span>
        </div>
      </div>
    </div>
  );
});

export default FlipPageSheet;
