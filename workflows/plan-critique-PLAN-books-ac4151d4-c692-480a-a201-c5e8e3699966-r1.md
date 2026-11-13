<!-- Tài liệu phản biện kỹ thuật của System Engineer cho kế hoạch PLAN-books-ac4151d4-c692-480a-a201-c5e8e3699966 (r1) nhằm đối chiếu kiến trúc đề xuất với trạng thái mã nguồn và dependency thực tế trong dự án. -->
# Phản biện kỹ thuật (Plan Critique): `PLAN-books-ac4151d4-c692-480a-a201-c5e8e3699966` (r1)

- **Kế hoạch mục tiêu:** `PLAN-books-ac4151d4-c692-480a-a201-c5e8e3699966` (Revision `r1`)
- **Hồ sơ kế hoạch gốc:** `.forge/runtime/nf/plans/PLAN-books-ac4151d4-c692-480a-a201-c5e8e3699966/ke-hoach-r1.md`
- **Vai trò thực hiện phản biện:** System Engineer (SE)
- **Trạng thái đánh giá:** `ALIGNED`

---

## 1. Đánh giá tổng quan & Tính khả thi

Về mặt nghiệp vụ và kiến trúc tổng thể, bản kế hoạch **O1 → O4** bao phủ đầy đủ và chặt chẽ các yêu cầu cốt lõi của ứng dụng đọc sách PDF cá nhân:
- Xác thực một tài khoản chủ sở hữu cố định (`SINGLE_OWNER`) qua biến môi trường và HTTP-only session cookie bảo mật, không mở đăng ký công khai.
- Lưu trữ file PDF và ảnh bìa/thumbnail trên filesystem riêng tư (`./storage/{books,thumbnails,temp}` cấu hình qua `FILE_STORAGE_PATH`), tách biệt hoàn toàn khỏi `public/`.
- Phân phối file PDF qua Route Handler có kiểm tra phiên đăng nhập và hỗ trợ đầy đủ **HTTP Range Requests (`206 Partial Content`, `Content-Range`, `Accept-Ranges: bytes`)**.
- Giao diện thư viện và trình đọc PDF lật trang responsive (1 trang trên màn hình nhỏ/dọc, 2 trang trên màn hình lớn/ngang) kết hợp tối ưu bộ nhớ canvas cho Safari iOS/iPadOS.
- Đồng bộ tiến độ đọc (`currentPage`, `progressPercent`, `updatedAt`) vào MariaDB có debounce và cơ chế chống ghi đè lùi khi đọc trên nhiều thiết bị.

Qua khảo sát trực tiếp các file hiện có trong repository (`package.json`, `pnpm-lock.yaml`, `prisma/schema.prisma`, `next.config.mjs`, `AGENTS.md`, `workflows/install.sh`), có **5 điểm kỹ thuật thực tế** cần lưu ý và xử lý trong quá trình triển khai để không bị chặn lúc chạy migration hoặc build.

---

## 2. Các điểm xung đột kỹ thuật phát hiện từ mã nguồn hiện tại

### Điểm 1 [Blocker tiềm ẩn — Lệch phiên bản `prisma` CLI (`8.0.0-rc.30`) và `@prisma/client` (`^7.10.1`)]
- **Hiện trạng trong repo:**
  - `package.json` hiện khai báo `@prisma/client: "^7.10.1"` trong `dependencies`, nhưng `devDependencies` lại đang cài `prisma: "8.0.0-rc.30"`.
  - Kiểm tra thực tế với `pnpm exec prisma --help` cho thấy `prisma@8.0.0-rc.30` là CLI mới của **Prisma Developer Platform / Prisma Composer** (sử dụng các nhóm lệnh `contract`, `orm`, `db`, `migration` kèm cấu hình `prisma.config.ts`), không còn các lệnh CLI truyền thống như `prisma migrate dev` hay `prisma generate` như giả định trong `workflows/install.sh`.
  - Ngoài ra, dự án có guardrail bắt buộc **chỉ sử dụng JavaScript thuần (`.js`/`.mjs`/`.jsx`), tuyệt đối không thêm TypeScript (`.ts`/`.tsx`)**.
- **Hướng xử lý khi thực thi O1:**
  - Đồng bộ lại phiên bản `prisma` CLI và `@prisma/client` trong `package.json` về cặp phiên bản tương thích ổn định với MariaDB (`mysql` provider) và hỗ trợ đầy đủ workflow schema/migration/client bằng JavaScript mà không yêu cầu file cấu hình `.ts`.

### Điểm 2 [Quan trọng — Next.js `16.4.5` bật sẵn `cacheComponents: true` trong `next.config.mjs`]
- **Hiện trạng trong repo:**
  - `next.config.mjs` đang cấu hình:
    ```js
    const nextConfig = {
      cacheComponents: true,
      partialPrefetching: true,
    };
    ```
  - Theo tài liệu chính thức của Next.js 16 trong `node_modules/next/dist/docs/`, khi bật `cacheComponents: true`, mọi thao tác đọc request-time data (`cookies()`, `headers()`, session hoặc truy vấn DB động) ở Server Component nếu không đặt trong `<Suspense>` boundary hoặc cấu hình phù hợp sẽ gây lỗi prerender khi chạy `pnpm build`.
  - Đồng thời, trên Next.js 16, file `middleware.js` truyền thống đã được thay bằng quy ước **`proxy.js`**.
- **Hướng xử lý khi thực thi O1 & O3:**
  - Tuân thủ kiến trúc đọc session/data của Next.js 16 (hoặc điều chỉnh cấu hình caching trong `next.config.mjs` phù hợp với ứng dụng cá nhân yêu cầu xác thực toàn trang) và dùng `proxy.js` (kèm kiểm tra xác thực tại DAL/Route Handlers) để đảm bảo bước **Verification (6) `pnpm build` và `pnpm lint`** vượt qua hoàn toàn.

### Điểm 3 [Quan trọng — Lệch phiên bản `pdfjs-dist` (`6.5.438` vs `6.3.289`) và cấu hình PDF Worker]
- **Hiện trạng trong repo:**
  - `package.json` cài trực tiếp `"pdfjs-dist": "^6.5.438"` và `"react-pdf": "^11.0.0"`.
  - Tuy nhiên trong `pnpm-lock.yaml`, `react-pdf@11.0.0` đang resolve dependency nội bộ sang **`pdfjs-dist@6.3.289`**.
  - Nếu mã nguồn import lẫn lộn giữa `pdfjs-dist` ở root và `react-pdf`, trình duyệt sẽ gặp lỗi lệch phiên bản giữa `API version` và `Worker version`.
- **Hướng xử lý khi thực thi O2 & O3:**
  - Thống nhất sử dụng đối tượng `pdfjs` được export trực tiếp từ `react-pdf` (hoặc đồng bộ phiên bản `pdfjs-dist` khớp tuyệt đối), cấu hình `pdfjs.GlobalWorkerOptions.workerSrc` ngay trong cùng module client-only (`dynamic(..., { ssr: false })`) và phục vụ file worker chuẩn xác để tránh lỗi SSR (`DOMMatrix`/`Canvas` không tồn tại trên Node.js).

### Điểm 4 [Kỹ thuật — Trích xuất `pageCount` và tạo `thumbnail` cho file PDF tại O2]
- **Hiện trạng & Rủi ro:**
  - Trên môi trường Linux hiện tại, `sharp` không mặc định đi kèm `libvips-poppler` để rasterize trực tiếp file PDF sang ảnh ở phía server nếu không cài thêm gói hệ thống ngoài dự án.
  - Mục **7. Evidence and assumptions** của Plan đã cho phép linh hoạt kết hợp PDF.js + canvas ở client khi tải lên hoặc xử lý ở Node.js/sharp phía server.
- **Hướng xử lý khi thực thi O2:**
  - Kết hợp cả hai tầng để vừa có ảnh bìa thật vừa vượt qua mọi bài kiểm thử API độc lập:
    1. **Trên giao diện tải lên (Client):** Dùng PDF.js đọc file PDF ngay khi chọn file để lấy chính xác `pageCount` và render trang 1 ra ảnh bìa, gửi kèm trong form upload (hoặc cập nhật lên server), server dùng `sharp` chuẩn hóa kích thước/định dạng (`.webp`/`.png`) và lưu vào `storage/thumbnails`.
    2. **Trên API tải lên (`/api/books` / `/api/uploads` ở Server):** Kiểm tra chặt MIME type và magic bytes `%PDF-`, ghi qua `storage/temp` trước khi chuyển vào `storage/books`. Nếu request gọi trực tiếp vào API mà không đính kèm ảnh trang đầu từ client, server tự trích xuất `pageCount` từ cấu trúc PDF và dùng `sharp` sinh ảnh bìa/thumbnail chuẩn có tiêu đề sách lưu vào `storage/thumbnails`.

### Điểm 5 [Chi tiết kỹ thuật — Tối ưu bộ nhớ Canvas với `react-pageflip` trên Safari iOS/iPadOS tại O3]
- **Hiện trạng & Rủi ro:**
  - `react-pageflip` khởi tạo khung lật trang dựa trên danh sách các phần tử trang con. Nếu render `<Page>` (canvas của PDF.js) cho toàn bộ các trang của một cuốn sách dày cùng lúc, trình duyệt trên iPhone/iPad sẽ vượt ngưỡng bộ nhớ canvas và bị treo tab.
- **Hướng xử lý khi thực thi O3:**
  - Mỗi trang con truyền vào `HTMLFlipBook` sẽ là một container giữ kích thước cố định; chỉ những trang nằm trong cửa sổ **`currentPage ± 2`** mới mount `<Page>` canvas thực sự, các trang ở xa chỉ hiển thị khung trang nhẹ.
  - Khi người dùng bật chế độ phóng to (`zoom > 1`), khóa tạm thời thao tác kéo lật trang tự động trên bề mặt trang để người dùng cuộn/pan đọc chi tiết không bị lật trang nhầm, trong khi các nút điều hướng và phím mũi tên vẫn hoạt động bình thường.

---

## 3. Kết luận

Bản kế hoạch **`PLAN-books-ac4151d4-c692-480a-a201-c5e8e3699966` (r1)** có cấu trúc `Outcomes (O1–O4)`, `Acceptance` và `Guardrails` rõ ràng, khả thi và bám sát yêu cầu của chủ sở hữu dự án. Các điểm kỹ thuật nêu trên đều nằm trong phạm vi tự chủ triển khai của SE và sẽ được xử lý triệt để khi thực thi.

**[CRITIQUE: ALIGNED]**
