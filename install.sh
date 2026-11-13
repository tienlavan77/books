#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "==> Project: $PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Chưa cài Node.js." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: Chưa cài pnpm." >&2
  echo "Có thể thử: corepack enable && corepack prepare pnpm@latest --activate" >&2
  exit 1
fi

echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"

if [[ ! -f package.json ]]; then
  echo "==> Khởi tạo Next.js bằng JavaScript..."
  pnpm create next-app . \
    --js \
    --app \
    --eslint \
    --no-src-dir \
    --use-pnpm \
    --no-tailwind
else
  echo "==> Đã có package.json; bỏ qua bước khởi tạo Next.js."
fi

echo "==> Cài thư viện ứng dụng..."
pnpm add pdfjs-dist react-pdf react-pageflip sharp @prisma/client

echo "==> Cài Prisma CLI..."
pnpm add -D prisma

if [[ ! -f prisma/schema.prisma ]]; then
  echo "==> Khởi tạo Prisma cho MariaDB..."
  pnpm exec prisma init --datasource-provider mysql
else
  echo "==> Đã có prisma/schema.prisma; bỏ qua khởi tạo Prisma."
fi

echo "==> Tạo thư mục lưu trữ..."
mkdir -p \
  storage/books \
  storage/thumbnails \
  storage/temp

chmod 700 storage storage/books storage/thumbnails storage/temp

if [[ ! -f .env ]]; then
  cat > .env <<'ENV'
DATABASE_URL="mysql://book_user:change_me@127.0.0.1:3306/books"
FILE_STORAGE_PATH="./storage"
ENV
  echo "==> Đã tạo .env mẫu; hãy sửa mật khẩu MariaDB."
else
  echo "==> Đã có .env; không ghi đè."
fi

touch storage/books/.gitkeep
touch storage/thumbnails/.gitkeep
touch storage/temp/.gitkeep

if [[ ! -f .gitignore ]]; then
  cat > .gitignore <<'GITIGNORE'
node_modules/
.next/
.env
.env.*
!.env.example

storage/books/*
storage/thumbnails/*
storage/temp/*

!storage/books/.gitkeep
!storage/thumbnails/.gitkeep
!storage/temp/.gitkeep
GITIGNORE
else
  echo "==> Đã có .gitignore; không ghi đè."
fi

echo
echo "==> Hoàn tất cài đặt dependencies và tạo thư mục."
echo "==> Việc tiếp theo:"
echo "    1. Sửa DATABASE_URL trong .env"
echo "    2. Khai báo model trong prisma/schema.prisma"
echo "    3. Chạy: pnpm exec prisma migrate dev --name init"
echo "    4. Chạy: pnpm dev"
