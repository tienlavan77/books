/* Provides module implementation and exported declarations for LibraryClient.js. */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { extractClientPdfPreview } from "./pdf-client-utils";

/* Executes documented symbol logic in LibraryClient.js. */
function formatFileSize(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

/* Executes documented symbol logic in LibraryClient.js. */
function formatDateTime(isoString) {
  if (!isoString) return "Chưa đọc";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return "";
  }
}

/* Executes documented symbol logic in LibraryClient.js. */
export default function LibraryClient({ initialBooks = [], owner = null }) {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [books, setBooks] = useState(initialBooks);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [loadingList, setLoadingList] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [customTitle, setCustomTitle] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchBooks = useCallback(
    async (queryText = search, sortBy = sort) => {
      setLoadingList(true);
      try {
        const params = new URLSearchParams();
        if (queryText.trim()) params.set("q", queryText.trim());
        if (sortBy) params.set("sort", sortBy);

        const res = await fetch(`/api/books?${params.toString()}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.books)) {
          setBooks(data.books);
        }
      } finally {
        setLoadingList(false);
      }
    },
    [router, search, sort]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBooks(search, sort);
    }, 220);
    return () => clearTimeout(timer);
  }, [search, sort, fetchBooks]);

  useEffect(() => {
    // Defines onVisibilityOrFocus function behavior for LibraryClient.js.
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        fetchBooks(search, sort);
      }
    };
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [fetchBooks, search, sort]);

  /* Executes documented symbol logic in LibraryClient.js. */
  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setUploadError("");
    setUploadStatus("");
    setSelectedFile(file);
    if (file && !customTitle.trim()) {
      const baseName = file.name.replace(/\.pdf$/i, "");
      setCustomTitle(baseName);
    }
  }

  /* Executes documented symbol logic in LibraryClient.js. */
  async function handleUploadSubmit(event) {
    event.preventDefault();
    setUploadError("");
    if (!selectedFile) {
      setUploadError("Vui lòng chọn một tệp PDF từ thiết bị của bạn.");
      return;
    }

    setUploading(true);
    setUploadStatus("Đang phân tích trang bìa và số trang PDF...");

    try {
      const preview = await extractClientPdfPreview(selectedFile);
      setUploadStatus("Đang tải tệp PDF lên kho lưu trữ riêng tư...");

      const formData = new FormData();
      formData.append("file", selectedFile);
      if (customTitle.trim()) {
        formData.append("title", customTitle.trim());
      }
      if (preview.pageCount) {
        formData.append("pageCount", String(preview.pageCount));
      }
      if (preview.thumbnailDataUrl) {
        formData.append("thumbnailDataUrl", preview.thumbnailDataUrl);
      }

      const response = await fetch("/api/books", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUploadError(data?.message || "Tải tệp PDF lên thất bại.");
        setUploadStatus("");
        setUploading(false);
        return;
      }

      setSelectedFile(null);
      setCustomTitle("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setUploadStatus("Đã tải sách lên thành công!");
      await fetchBooks(search, sort);
      setTimeout(() => setUploadStatus(""), 3500);
    } catch {
      setUploadError("Lỗi kết nối khi tải sách lên máy chủ.");
      setUploadStatus("");
    } finally {
      setUploading(false);
    }
  }

  /* Executes documented symbol logic in LibraryClient.js. */
  async function handleDeleteBook(book) {
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa sách "${book.title}"?\nTệp PDF gốc và tiến độ đọc sẽ bị xóa vĩnh viễn khỏi máy chủ.`
    );
    if (!confirmed) return;

    setDeletingId(book.id);
    try {
      const response = await fetch(`/api/books/${book.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setBooks((prev) => prev.filter((item) => item.id !== book.id));
      } else {
        const data = await response.json().catch(() => ({}));
        window.alert(data?.message || "Không thể xóa sách lúc này.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  /* Executes documented symbol logic in LibraryClient.js. */
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <div className="library-page">
      <header className="library-header">
        <div className="library-brand">
          <span className="brand-badge">PDF READER</span>
          <div>
            <h1 className="library-title">Tủ sách PDF Cá nhân</h1>
            <p className="library-subtitle">
              Xin chào <strong>{owner?.displayName || "Chủ sở hữu"}</strong> • Đồng bộ đa thiết bị
              (Desktop, Mobile, iPad &amp; Tablet)
            </p>
          </div>
        </div>

        <div className="library-header-actions">
          <button type="button" onClick={() => fetchBooks(search, sort)} className="btn-secondary">
            Làm mới đồng bộ
          </button>
          <button type="button" onClick={handleLogout} className="btn-outline-danger">
            Đăng xuất
          </button>
        </div>
      </header>

      <section className="upload-panel" aria-label="Tải sách PDF mới lên">
        <form onSubmit={handleUploadSubmit} className="upload-form">
          <div className="upload-field-file">
            <label htmlFor="pdf-file-input" className="form-label">
              Thêm sách PDF mới vào máy chủ riêng
            </label>
            <input
              ref={fileInputRef}
              id="pdf-file-input"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              className="file-input"
              disabled={uploading}
            />
          </div>

          <div className="upload-field-title">
            <label htmlFor="pdf-title-input" className="form-label">
              Tên hiển thị của sách
            </label>
            <input
              id="pdf-title-input"
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Nhập tên sách (để trống sẽ lấy theo tên file)..."
              className="form-input"
              disabled={uploading}
            />
          </div>

          <div className="upload-field-submit">
            <button type="submit" className="btn-primary" disabled={uploading || !selectedFile}>
              {uploading ? "Đang xử lý..." : "Tải lên thư viện"}
            </button>
          </div>
        </form>

        {uploadStatus ? <div className="upload-status-banner">{uploadStatus}</div> : null}
        {uploadError ? (
          <div className="upload-error-banner" role="alert">
            {uploadError}
          </div>
        ) : null}
      </section>

      <section className="toolbar-panel" aria-label="Bộ lọc và tìm kiếm sách">
        <div className="search-box">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm theo tên sách hoặc tên file..."
            className="form-input"
            aria-label="Tìm kiếm sách"
          />
        </div>

        <div className="sort-box">
          <label htmlFor="sort-select" className="sort-label">
            Sắp xếp:
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="form-select"
          >
            <option value="recent">Đọc gần đây nhất</option>
            <option value="created">Mới tải lên</option>
            <option value="progress">Phần trăm hoàn thành</option>
            <option value="title">Tên sách (A → Z)</option>
          </select>
        </div>
      </section>

      <main className="books-section">
        {loadingList && books.length === 0 ? (
          <div className="empty-library-card">Đang tải danh sách sách từ máy chủ...</div>
        ) : books.length === 0 ? (
          <div className="empty-library-card">
            <h2>Chưa có cuốn sách nào trong thư viện</h2>
            <p>
              Hãy chọn một tệp PDF ở khung bên trên để tải sách lên máy chủ riêng và bắt đầu trải
              nghiệm lật trang như sách giấy.
            </p>
          </div>
        ) : (
          <div className="books-grid">
            {books.map((book) => {
              const currentPage = book.progress?.currentPage || 1;
              const pageCount = Math.max(1, book.pageCount || 1);
              const percent = Math.min(
                100,
                Math.max(0, Math.round((book.progress?.progressPercent ?? 0) * 10) / 10)
              );
              const hasStarted = currentPage > 1 || percent > 0;

              return (
                <article key={book.id} className="book-card">
                  <Link href={`/reader/${book.id}`} className="book-cover-link">
                    <div className="book-cover-wrapper">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={book.thumbnailUrl}
                        alt={`Bìa sách ${book.title}`}
                        className="book-cover-image"
                        loading="lazy"
                      />
                      <span className="book-page-pill">{pageCount} trang</span>
                    </div>
                  </Link>

                  <div className="book-card-body">
                    <h2 className="book-item-title" title={book.title}>
                      {book.title}
                    </h2>
                    <div className="book-meta-row">
                      <span>{formatFileSize(book.fileSize)}</span>
                      <span>•</span>
                      <span>Cập nhật: {formatDateTime(book.progress?.updatedAt)}</span>
                    </div>

                    <div className="book-progress-block">
                      <div className="book-progress-labels">
                        <span>
                          Trang {currentPage} / {pageCount}
                        </span>
                        <strong>{percent}%</strong>
                      </div>
                      <div className="progress-bar-track" aria-hidden="true">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
                        />
                      </div>
                    </div>

                    <div className="book-card-actions">
                      <Link href={`/reader/${book.id}`} className="btn-primary book-read-btn">
                        {hasStarted ? `Tiếp tục đọc (Tr. ${currentPage})` : "Mở đọc sách"}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteBook(book)}
                        disabled={deletingId === book.id}
                        className="btn-icon-delete"
                        title="Xóa sách khỏi thư viện"
                      >
                        {deletingId === book.id ? "..." : "Xóa"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
