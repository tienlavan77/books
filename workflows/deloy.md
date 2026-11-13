# Hướng dẫn Deploy Ứng dụng Đọc sách PDF Cá nhân lên VPS

Tài liệu này hướng dẫn chi tiết từng bước triển khai (deploy) dự án lên máy chủ VPS (Ubuntu/Debian) dựa trên cấu trúc mã nguồn thực tế của dự án.

---

## 1. Tổng quan kiến trúc dự án

- **Framework:** Next.js `16.4.5` (React `19.3.0`), chạy mặc định tại địa chỉ `0.0.0.0:3200` (`package.json`).
- **Trình quản lý gói:** `pnpm` (yêu cầu Node.js >= 20, khuyến nghị Node.js 22 LTS).
- **Cơ sở dữ liệu:** MariaDB / MySQL thông qua **Prisma ORM** (`prisma/schema.prisma`) gồm 3 bảng: `owner_accounts`, `books`, `reading_progress`. Có cơ chế fallback tự động về file JSON (`storage/.catalog-db.json`) nếu đặt `BOOKS_DB_DRIVER=fallback`, nhưng trên Production nên dùng MariaDB.
- **Lưu trữ tệp vật lý (`lib/storage.js`):** Thư mục cục bộ `./storage` (gồm `books/`, `thumbnails/`, `temp/`) với quyền truy cập `0700`, tạo ảnh bìa `.webp` bằng thư viện `sharp` và phát nội dung PDF qua HTTP Byte-Range (`206 Partial Content`).
- **Xác thực (`lib/auth.js` & `proxy.js`):** Chế độ một chủ sở hữu duy nhất (`SINGLE_OWNER`), khóa hoàn toàn các đường dẫn `/register` và `/signup`, quản lý phiên bằng Cookie ký HMAC-SHA256 (`books_owner_session`), tự động nhận diện HTTPS qua header `X-Forwarded-Proto`.
- **Giới hạn tải tệp:** Hỗ trợ upload tệp PDF tối đa **500MB** (`proxyClientMaxBodySize: "500mb"` trong `next.config.mjs`).

---

## 2. Chuẩn bị môi trường trên VPS (Ubuntu / Debian)

SSH vào VPS và cài đặt các gói hệ thống cần thiết (Node.js, `pnpm`, MariaDB, Nginx, PM2 và thư viện xử lý ảnh cho `sharp`):

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx mariadb-server libvips-dev

# Cài đặt Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Kích hoạt pnpm và cài đặt PM2
sudo corepack enable
sudo corepack prepare pnpm@latest --activate
sudo npm install -g pm2
```

Kiểm tra phiên bản sau khi cài đặt:

```bash
node -v
pnpm -v
pm2 -v
```

---

## 3. Khởi tạo Cơ sở dữ liệu MariaDB

Khởi động dịch vụ MariaDB và tạo cơ sở dữ liệu cùng tài khoản riêng cho ứng dụng:

```bash
sudo systemctl enable --now mariadb
sudo mysql
```

Chạy các câu lệnh SQL sau trong giao diện `mysql`:

```sql
CREATE DATABASE books CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'book_user'@'127.0.0.1' IDENTIFIED BY 'MatKhauDB_ManhCuaBan_123!';
GRANT ALL PRIVILEGES ON books.* TO 'book_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. Đưa mã nguồn lên VPS và cấu hình thư mục lưu trữ

### 4.1. Đồng bộ mã nguồn lên VPS
Tạo thư mục chứa ứng dụng trên VPS (ví dụ `/var/www/books`):

```bash
sudo mkdir -p /var/www/books
sudo chown -R $USER:$USER /var/www/books
```

Từ máy local, bạn có thể đẩy mã nguồn lên VPS bằng `rsync` (bỏ qua các thư mục tạm và `node_modules`) hoặc dùng `git clone`:

```bash
rsync -avz \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.forge' \
  --exclude '.git' \
  /home/data/sites/books/ user@IP_VPS:/var/www/books/
```

### 4.2. Tạo thư mục lưu trữ PDF bảo mật
Trên VPS, di chuyển vào thư mục dự án và khởi tạo cây thư mục `storage`:

```bash
cd /var/www/books

mkdir -p storage/books storage/thumbnails storage/temp
chmod 700 storage storage/books storage/thumbnails storage/temp
```

---

## 5. Cấu hình biến môi trường (`.env`)

Tạo tệp `.env` tại thư mục gốc `/var/www/books/.env`:

```bash
nano /var/www/books/.env
```

Điền nội dung cấu hình Production như sau (tương ứng với `lib/auth.js`, `lib/storage.js` và `prisma/schema.prisma`):

```env
NODE_ENV="production"

# 1. Kết nối cơ sở dữ liệu MariaDB
DATABASE_URL="mysql://book_user:MatKhauDB_ManhCuaBan_123!@127.0.0.1:3306/books"

# 2. Cấu hình lưu trữ tệp PDF và giới hạn dung lượng (MB)
FILE_STORAGE_PATH="./storage"
MAX_UPLOAD_SIZE_MB="500"

# 3. Tài khoản chủ sở hữu duy nhất (SINGLE_OWNER)
OWNER_USERNAME="admin"
OWNER_PASSWORD="MatKhauDangNhapWeb_RatManh_2026!"
OWNER_DISPLAY_NAME="Chủ sở hữu thư viện"

# 4. Khóa bí mật ký Cookie phiên (Tạo bằng lệnh: openssl rand -hex 32)
OWNER_SESSION_SECRET="thay_bang_chuoi_ngau_nhien_64_ky_tu_hex_cua_ban"

# 5. Bảo mật Cookie:
# - Đặt "true" nếu chạy qua tên miền có HTTPS
# - Đặt "false" nếu chỉ truy cập trực tiếp qua http://IP_VPS
COOKIE_SECURE="true"
```

Giới hạn quyền đọc tệp `.env`:

```bash
chmod 600 /var/www/books/.env
```

---

## 6. Cài đặt Dependencies, Migrate Database và Build

Thực hiện lần lượt các lệnh sau tại `/var/www/books`:

```bash
cd /var/www/books

# 1. Cài đặt các gói phụ thuộc theo pnpm-lock.yaml
pnpm install --frozen-lockfile

# 2. Sinh Prisma Client và chạy migration tạo bảng trên MariaDB
pnpm exec prisma generate
pnpm run db:migrate
# Ghi chú: Nếu muốn đồng bộ trực tiếp từ schema.prisma không qua migration, dùng:
# pnpm run db:push

# 3. Kiểm tra trạng thái migration
pnpm run db:status

# 4. Build ứng dụng Next.js cho môi trường Production
pnpm run build
```

---

## 7. Khởi chạy và quản lý tiến trình với PM2

Trong `package.json`, script `start` đã được cấu hình sẵn là `next start --hostname 0.0.0.0 --port 3200`. Sử dụng PM2 để chạy ngầm và tự khởi động lại khi VPS reboot:

```bash
cd /var/www/books

# Khởi chạy ứng dụng với tên "books-app"
pm2 start pnpm --name "books-app" -- start

# Lưu danh sách tiến trình và kích hoạt khởi động cùng hệ thống
pm2 save
pm2 startup
```

*(Sao chép và chạy câu lệnh `sudo env PATH=...` do lệnh `pm2 startup` in ra màn hình).*

Các lệnh quản lý PM2 thường dùng:

```bash
pm2 status                 # Xem trạng thái ứng dụng
pm2 logs books-app         # Xem log thời gian thực
pm2 restart books-app      # Khởi động lại sau khi sửa .env hoặc cập nhật code
```

---

## 8. Cấu hình Nginx Reverse Proxy (Hỗ trợ Upload 500MB & Streaming PDF)

Tạo tệp cấu hình Nginx cho website:

```bash
sudo nano /etc/nginx/sites-available/books
```

Dán nội dung cấu hình sau (thay `ten-mien-cua-ban.com` bằng tên miền hoặc địa chỉ IP VPS của bạn):

```nginx
server {
    listen 80;
    server_name ten-mien-cua-ban.com;

    # BẮT BUỘC: Cho phép tải lên tệp PDF tối đa 500MB (khớp với next.config.mjs)
    client_max_body_size 500M;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_connect_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Quan trọng để hàm shouldUseSecureCookie() trong lib/auth.js nhận diện đúng HTTPS
        proxy_set_header X-Forwarded-Proto $scheme;

        # Tắt buffering để hỗ trợ HTTP Byte-Range (206 Partial Content) khi lật trang PDF nặng
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

Kích hoạt cấu hình và khởi động lại Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/books /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. Cài đặt chứng chỉ SSL (HTTPS miễn phí với Let's Encrypt)

Nếu bạn sử dụng tên miền riêng đã trỏ bản ghi DNS `A` về IP của VPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ten-mien-cua-ban.com
```

Certbot sẽ tự động cấu hình chuyển hướng HTTP sang HTTPS và tự động gia hạn chứng chỉ.

---

## 10. Quy trình cập nhật phiên bản mới (Re-deploy) & Sao lưu

### 10.1. Khi cập nhật mã nguồn mới
```bash
cd /var/www/books
git pull                            # Hoặc rsync code mới lên
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm run db:migrate
pnpm run build
pm2 restart books-app
```

### 10.2. Sao lưu dữ liệu (Backup)
Toàn bộ dữ liệu quan trọng cần sao lưu định kỳ gồm 2 phần:
1. **Cơ sở dữ liệu MariaDB:**
   ```bash
   mysqldump -u book_user -p books > backup_books_$(date +%F).sql
   ```
2. **Thư mục tệp PDF & ảnh bìa:**
   ```bash
   tar -czf backup_storage_$(date +%F).tar.gz /var/www/books/storage
   ```
