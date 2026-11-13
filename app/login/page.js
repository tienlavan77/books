// Provides module declarations and business logic for page.js.

"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

/* Executes documented symbol logic in page.js. */
function LoginFormContent() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const queryError = searchParams.get("error");

  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const initialErrorMessage =
    queryError === "invalid"
      ? "Mật khẩu hoặc mã PIN chủ sở hữu không chính xác."
      : queryError === "server"
        ? "Lỗi máy chủ khi xử lý đăng nhập. Vui lòng thử lại."
        : "";
  const displayedError = error || initialErrorMessage;

  /* Executes documented symbol logic in page.js. */
  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!password.trim()) {
      setError("Vui lòng nhập mật khẩu hoặc mã PIN của chủ sở hữu.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          username: username.trim(),
          password,
          next: nextPath,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.message || "Mật khẩu hoặc mã PIN không chính xác.");
        setSubmitting(false);
        return;
      }

      const safeRedirect =
        nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
      window.location.replace(safeRedirect);
    } catch {
      setError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-badge">SINGLE OWNER VAULT</div>
        <h1 className="auth-title">Thư viện Sách PDF Cá nhân</h1>
        <p className="auth-subtitle">
          Không gian đọc sách riêng tư với hiệu ứng lật trang giấy và đồng bộ tiến độ xuyên suốt giữa
          Máy tính, Điện thoại, iPad &amp; Tablet.
        </p>

        <form
          method="POST"
          action="/api/auth/login"
          onSubmit={handleSubmit}
          className="auth-form"
        >
          <input type="hidden" name="next" value={nextPath} />

          <div className="form-group">
            <label htmlFor="owner-username" className="form-label">
              Tài khoản chủ sở hữu
            </label>
            <input
              id="owner-username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
              autoComplete="username"
              placeholder="owner"
            />
          </div>

          <div className="form-group">
            <label htmlFor="owner-password" className="form-label">
              Mật khẩu / Mã PIN bảo mật
            </label>
            <input
              id="owner-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu hoặc mã PIN..."
              autoFocus
              required
            />
          </div>

          {displayedError ? (
            <div className="auth-error" role="alert">
              {displayedError}
            </div>
          ) : null}

          <button type="submit" className="btn-primary auth-submit" disabled={submitting}>
            {submitting ? "Đang xác thực..." : "Mở khóa thư viện"}
          </button>
        </form>

        <div className="auth-footer-note">
          Chế độ bảo mật một chủ sở hữu cố định — Hệ thống không mở đăng ký tài khoản công khai.
        </div>
      </div>
    </div>
  );
}

/* Executes documented symbol logic in page.js. */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-shell">
          <div className="auth-card">Đang tải biểu mẫu xác thực...</div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
