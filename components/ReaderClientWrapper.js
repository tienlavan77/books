/*
 * Loads the PDF reader only in the browser and exposes a finite failure state.
 * This prevents older Safari versions from remaining on an indefinite loading
 * shell when a modern client chunk or PDF dependency cannot initialize.
 */
"use client";

import { useEffect, useState } from "react";

const READER_LOAD_TIMEOUT_MS = 15000;

/* Detects Safari on iOS 12 and earlier, whose runtime cannot load this reader stack. */
function isLegacyIosSafari() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  const iosDevice = /iPad|iPhone|iPod/.test(userAgent);
  const webKitBrowser = /AppleWebKit/.test(userAgent);
  const versionMatch = userAgent.match(/OS (\d+)[._]/i);
  const majorVersion = versionMatch ? Number(versionMatch[1]) : 99;
  return iosDevice && webKitBrowser && majorVersion <= 12;
}

/* Renders a finite reader loading/error shell for unsupported browser runtimes. */
function ReaderLoaderState({ error }) {
  return (
    <div className="reader-shell reader-shell-loading" role={error ? "alert" : "status"} aria-live="polite">
      <div className="reader-loading-box">
        {error ? (
          <>
            <strong>Không thể khởi tạo không gian đọc sách lật trang.</strong>
            <span>{error}</span>
          </>
        ) : (
          "Đang khởi tạo không gian đọc sách lật trang..."
        )}
      </div>
    </div>
  );
}

/* Loads PdfFlipReader with timeout and import-error recovery instead of indefinite suspense. */
export default function ReaderClientWrapper({ initialBook }) {
  const [ReaderComponent, setReaderComponent] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        timedOut = true;
        setLoadError("Trình duyệt không phản hồi khi tải bộ đọc PDF. Hãy dùng Safari mới hơn hoặc Chrome/Edge.");
      }
    }, READER_LOAD_TIMEOUT_MS);

    if (isLegacyIosSafari()) {
      window.clearTimeout(timeoutId);
      setLoadError("Safari iOS 12.5.7 không tương thích với bộ đọc PDF hiện tại. Hãy cập nhật iPad/iPhone hoặc dùng máy tính.");
      return () => {
        cancelled = true;
      };
    }

    import("./PdfFlipReader")
      .then((module) => {
        if (!cancelled && !timedOut) setReaderComponent(() => module.default);
      })
      .catch(() => {
        if (!cancelled && !timedOut) {
          setLoadError("Không tải được thành phần đọc PDF. Hãy tải lại trang hoặc dùng trình duyệt được hỗ trợ.");
        }
      })
      .finally(() => window.clearTimeout(timeoutId));

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (loadError) return <ReaderLoaderState error={loadError} />;
  if (!ReaderComponent) return <ReaderLoaderState />;
  return <ReaderComponent initialBook={initialBook} />;
}
