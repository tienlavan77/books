#!/bin/sh
# Purpose: bootstrap the personal PDF reader in a non-empty project directory.
# The script uses POSIX shell syntax so it works when invoked with sh or bash.
# It creates Next.js in a temporary empty directory, then installs application
# dependencies and prepares private filesystem storage for PDFs and thumbnails.
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
if [ "$#" -ge 1 ]; then
  PROJECT_DIR=$(CDPATH= cd "$1" && pwd)
elif [ "$(basename "$SCRIPT_DIR")" = "workflows" ]; then
  PROJECT_DIR=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)
else
  PROJECT_DIR=$SCRIPT_DIR
fi

cd "$PROJECT_DIR"

say() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js chưa được cài."
command -v pnpm >/dev/null 2>&1 || fail "pnpm chưa được cài."

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Cần Node.js >= 20; hiện tại là $(node --version)."
fi

printf 'Project: %s\n' "$PROJECT_DIR"
printf 'Node: %s\n' "$(node --version)"
printf 'pnpm: %s\n' "$(pnpm --version)"

if [ ! -f package.json ]; then
  say "Khởi tạo Next.js trong thư mục tạm vì thư mục dự án đã có file"
  INIT_DIR="$PROJECT_DIR/nextinit-$$"
INIT_SUFFIX=0
while [ -e "$INIT_DIR" ]; do
  INIT_SUFFIX=$((INIT_SUFFIX + 1))
  INIT_DIR="$PROJECT_DIR/nextinit-$$-$INIT_SUFFIX"
done
mkdir "$INIT_DIR"
  cleanup() {
    rm -rf "$INIT_DIR"
  }
  trap cleanup 0 1 2 3 15

  pnpm create next-app@latest "$INIT_DIR" \
    --js \
    --app \
    --eslint \
    --no-src-dir \
    --use-pnpm \
    --no-tailwind \
    --import-alias '@/*'

  rm -rf "$INIT_DIR/node_modules"
  cp -R "$INIT_DIR"/. "$PROJECT_DIR"/
  rm -rf "$INIT_DIR"
  trap - 0 1 2 3 15
else
  say "Đã có package.json; bỏ qua create-next-app"
fi

[ -f package.json ] || fail "Không tìm thấy package.json sau bước khởi tạo."

say "Cho phép các build script cần thiết của dependency"
node <<'NODE'
const fs = require('fs');
const file = 'package.json';
const packageJson = JSON.parse(fs.readFileSync(file, 'utf8'));
const pnpm = packageJson.pnpm || {};
const current = Array.isArray(pnpm.onlyBuiltDependencies)
  ? pnpm.onlyBuiltDependencies
  : [];
const allowed = new Set(current);
allowed.add('esbuild');
allowed.add('workerd');
pnpm.onlyBuiltDependencies = Array.from(allowed).sort();
packageJson.pnpm = pnpm;
fs.writeFileSync(file, `${JSON.stringify(packageJson, null, 2)}\n`);
NODE
pnpm install

say "Cài dependency ứng dụng"
pnpm add pdfjs-dist react-pdf react-pageflip sharp @prisma/client
pnpm add -D prisma

if [ ! -f prisma/schema.prisma ]; then
  say "Khởi tạo Prisma cho MariaDB"
  mkdir -p prisma
  cat > prisma/schema.prisma <<'PRISMA'
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
PRISMA
else
  say "Đã có prisma/schema.prisma; bỏ qua khởi tạo Prisma"
fi

say "Tạo thư mục lưu trữ riêng, không nằm trong public"
mkdir -p storage/books storage/thumbnails storage/temp
chmod 700 storage storage/books storage/thumbnails storage/temp
touch storage/books/.gitkeep storage/thumbnails/.gitkeep storage/temp/.gitkeep

if [ ! -f .env ]; then
  cat > .env <<'ENV'
DATABASE_URL="mysql://book_user:change_me@127.0.0.1:3306/books"
FILE_STORAGE_PATH="./storage"
ENV
  printf 'Đã tạo .env mẫu; hãy đổi DATABASE_URL trước khi migrate.\n'
else
  printf 'Đã có .env; không ghi đè.\n'
fi

if [ ! -f .env.example ]; then
  cat > .env.example <<'ENV'
DATABASE_URL="mysql://book_user:change_me@127.0.0.1:3306/books"
FILE_STORAGE_PATH="./storage"
ENV
fi

if [ ! -f .gitignore ]; then
  cat > .gitignore <<'GITIGNORE'
node_modules/
.next/
out/
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
fi

say "Kiểm tra Prisma"
pnpm exec prisma --version

cat <<'SUMMARY'

Cài đặt dependency và tạo cấu trúc dự án đã hoàn tất.

Tiếp theo:
  1. Sửa DATABASE_URL trong .env.
  2. Khai báo model User, Book và ReadingProgress trong prisma/schema.prisma.
  3. Chạy: pnpm exec prisma migrate dev --name init
  4. Chạy: pnpm dev

Lưu ý: script chưa tự chạy migration vì schema nghiệp vụ chưa được định nghĩa.
SUMMARY
