// Provides module declarations and business logic for layout.js.

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Tủ sách PDF Cá nhân — Đọc sách lật trang & Đồng bộ đa thiết bị",
  description:
    "Ứng dụng web đọc sách PDF cá nhân với hiệu ứng lật trang như sách giấy, lưu trữ riêng tư trên máy chủ và đồng bộ tiến độ đọc đa thiết bị.",
};

// Defines RootLayout function behavior for layout.js.
export default function RootLayout({ children }) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
