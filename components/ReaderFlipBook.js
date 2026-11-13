/* Isolates one pageflip layout mount from reader state updates. Initialization
 * restores progress silently; stable event delegates always reach current handlers. */
"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";
import HTMLFlipBook from "react-pageflip";
import FlipPageSheet from "./FlipPageSheet";
import { createReaderFlipbookLifecycle } from "../lib/reader-flipbook-lifecycle";

// Renders a keyed layout with fixed mount settings and live navigation callbacks.
const ReaderFlipBook = forwardRef(function ReaderFlipBook({
  metrics, numPages, currentPage, zoom, onFlip, onState, controller,
}, ref) {
  const lifecycleRef = useRef(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = createReaderFlipbookLifecycle({
      startPage: currentPage,
      cancel: (reason) => controller.cancel(reason),
      onFlip,
      onState,
    });
  }
  const lifecycle = lifecycleRef.current;
  lifecycle.update({ onFlip, onState });
  useEffect(() => {
    lifecycle.activate();
    return () => lifecycle.dispose();
  }, [lifecycle]);
  const handleInit = useCallback((event) => lifecycle.init(event.object), [lifecycle]);
  const handleFlip = useCallback((event) => lifecycle.flip(event), [lifecycle]);
  const handleState = useCallback((event) => lifecycle.state(event), [lifecycle]);
  const pages = useMemo(() => Array.from({ length: numPages }, (_, index) => (
    <FlipPageSheet
      key={index + 1}
      pageNumber={index + 1}
      totalPages={numPages}
      width={metrics.pageWidth}
      height={metrics.pageHeight}
      devicePixelRatio={metrics.pixelRatio}
      isSpreadMode={metrics.isSpread}
    />
  )), [numPages, metrics.pageWidth, metrics.pageHeight, metrics.pixelRatio, metrics.isSpread]);
  return (
    <HTMLFlipBook
      ref={ref}
      width={metrics.pageWidth}
      height={metrics.pageHeight}
      size="fixed"
      minWidth={240}
      maxWidth={780}
      minHeight={340}
      maxHeight={1120}
      drawShadow={true}
      flippingTime={580}
      usePortrait={!metrics.isSpread}
      startPage={Math.max(0, currentPage - 1)}
      startZIndex={10}
      autoSize={false}
      maxShadowOpacity={0.45}
      showCover={false}
      mobileScrollSupport={true}
      clickEventForward={true}
      useMouseEvents={zoom === 1}
      swipeDistance={30}
      showPageCorners={true}
      disableFlipByClick={false}
      renderOnlyPageLengthChange={true}
      onInit={handleInit}
      onFlip={handleFlip}
      onChangeState={handleState}
      className="pdf-html-flipbook"
      style={{
        width: `${metrics.isSpread ? metrics.pageWidth * 2 : metrics.pageWidth}px`,
        height: `${metrics.pageHeight}px`,
      }}
    >
      {pages}
    </HTMLFlipBook>
  );
});

export default ReaderFlipBook;
