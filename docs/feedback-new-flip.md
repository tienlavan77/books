<!-- Tài liệu này ghi nhận phản biện kỹ thuật đối với kế hoạch reader lật trang; dùng làm đầu vào planning, không phải acceptance contract hay approval triển khai. -->
# Phản biện kỹ thuật `docs/new-flip.md`

## Kết luận ngắn

`docs/new-flip.md` là định hướng tốt và nên giữ các ranh giới: không đưa nguyên plugin WordPress vào production, giữ PDF endpoint riêng tư/Range Requests, kiểm tra license độc lập và rollback ở lớp UI reader.

Tuy nhiên, chưa nên dùng tài liệu hiện tại làm acceptance contract cuối cùng. Tài liệu đang trộn mục tiêu sản phẩm, giả định kỹ thuật và tiêu chí nghiệm thu. Cần chốt thêm các invariant dưới đây trước khi dispatch implementation.

## Đối chiếu với implementation hiện tại

| Hạng mục | Trạng thái hiện tại | Nhận định |
|---|---|---|
| Một/trang đôi responsive | Có một phần | `PdfFlipReader` và `reader-metrics` đã tính single/spread, nhưng chưa chốt quy tắc neo trang khi đổi layout. |
| Cửa sổ render gần trang hiện tại | Có một phần | Có `computeRenderedPagesSet` và giới hạn trang trước/sau. |
| Cache 10 trang đã đọc + 10 trang sắp đọc | Chưa chứng minh | `getPage()` preload không chứng minh page đã decode/render; chưa có eviction, cleanup canvas hay hủy task. |
| Fullscreen | Có một phần | Có native API và fallback class; chưa có exit control riêng cho mobile fullscreen và chưa chứng minh safe-area/iPadOS. |
| Điều hướng qua animation thống nhất | Chưa chứng minh | Nút/phím/swipe/jump đi qua các đường xử lý khác nhau. |
| Commit tiến độ sau animation | Chưa đạt | `onFlip` cập nhật `currentPage` trước khi có state machine complete/cancel; debounce không tương đương commit event. |
| Private PDF + Range Requests | Đã có boundary | Endpoint kiểm tra session/quyền và hỗ trợ byte range; server không biết khái niệm physical PDF page. |
| JBIG2/decode recovery | Chưa đủ | Có cấu hình worker assets nhưng lỗi page/document hiện chưa có retry, fallback hoặc isolation rõ ràng. |

## Các phản biện cần xử lý

### 1. Định nghĩa lại cache — Major

Cần xác định cache đang giữ gì:

- `PDFPageProxy` đã lấy từ PDF.js;
- rendered bitmap/canvas ở một scale và device-pixel-ratio cụ thể;
- hay chỉ là danh sách page number cần render.

`pdfDocProxy.getPage(page)` chỉ khởi tạo/lấy page proxy, không đảm bảo decode và render đã xong. Vì vậy không được gọi đó là “trang đã cache sẵn” nếu chưa có trạng thái `loading`, `ready`, `failed`, `evicted`.

Nên chốt invariant:

- Single mode giữ tối đa 10 physical pages trước và 10 physical pages sau trang hiện tại, ngoài trang đang hiển thị nếu cần.
- Spread mode cache theo physical page, không theo spread index.
- Khi vượt giới hạn, eviction phải gọi cleanup thích hợp và hủy render task/request không còn cần.
- Đổi zoom, layout, DPR hoặc sách phải xác định cache cũ có bị invalidated hay không.
- Rời reader/unmount phải dispose document/page/render task/canvas.

Cũng cần phân biệt preload cache với rendered-page cache; hai mục tiêu này có chi phí và tiêu chí kiểm thử khác nhau.

### 2. Commit trang và tiến độ — Critical

Tiêu chí “chỉ commit trang và tiến độ sau khi animation hoàn tất” chưa khớp code hiện tại. `handleFlipEvent` cập nhật `currentPage` ngay khi nhận `onFlip`; hook tiến độ sau đó debounce 650 ms. Debounce không bảo đảm animation đã complete, không xử lý cancel và không chống được thao tác chồng.

Nên mô tả state machine tối thiểu:

```text
idle -> dragging -> animating -> committed
                         \-> cancelled
```

Quy tắc đề xuất:

- Mọi input tạo một transition có `transitionId`.
- Trong `animating`, khóa transition mới hoặc xếp hàng một cách có kiểm soát.
- Chỉ callback complete mới cập nhật `currentPage` và phát sinh progress write.
- Cancel/rollback không ghi tiến độ.
- Response/request cũ không được cập nhật state sau transition mới.

### 3. Một animation cho mọi input — Major

Nút và phím gọi `flipPrev`/`flipNext`, swipe gọi cùng helper nhưng jump dùng `turnToPage`, còn zoom khác 1 có thể đi thẳng tới `setCurrentPage`. Vì vậy chưa chứng minh được ArrowLeft/ArrowRight, nút, drag, swipe và jump có cùng animation/commit semantics.

Cần bổ sung ma trận input → animation → complete/cancel event → persistence. Nếu jump hoặc zoom là ngoại lệ, ghi rõ ngoại lệ thay vì yêu cầu mọi luồng “cùng loại animation”.

### 4. Quy tắc spread và giữ vị trí đọc — Major

Cần chốt:

- spread bắt đầu từ trang lẻ hay cho phép trang chẵn ở bên trái;
- vai trò của trang 1/cover;
- single → spread giữ trang trái, trang phải hay trang gần nhất;
- spread → single chọn trang nào;
- jump tới trang chẵn trong spread hiển thị ra sao;
- `currentPage`/progress đại diện cho trang trái, phải hay trang người dùng vừa đọc.

Nếu không chốt, resize/rotate có thể giữ số trang nhưng thay đổi nội dung đang ở vị trí đọc.

### 5. Fullscreen mobile — Major

Native Fullscreen API và fallback `isFullscreen` không tự đáp ứng O3. Nếu fullscreen mobile ẩn toolbar thì phải có exit control nhỏ, vùng chạm đủ lớn, `aria-label` và focus behavior riêng. Cần test cả:

- API không tồn tại;
- `requestFullscreen()` bị reject;
- `fullscreenchange` và Escape;
- xoay thiết bị trong fullscreen;
- safe-area inset;
- Safari/iPadOS không cho kiểm soát browser chrome.

Nên phân biệt rõ native fullscreen với app-level fallback chiếm viewport khả dụng; fallback không thể cam kết ẩn thanh địa chỉ.

### 6. JBIG2 và lỗi decode — Critical đối với lỗi đang gặp

Kế hoạch chưa có acceptance cho lỗi `Jbig2Error: JBig2 failed to initialize`, `Dependent image isn't ready yet` và `Unable to decode image`.

Cần xác định:

- lỗi một page có làm trắng toàn bộ reader không;
- có retry page và placeholder hay không;
- có fallback decoder/worker hay chỉ thông báo không hỗ trợ;
- worker asset version có khớp PDF.js version không;
- có timeout, cancel và log mã lỗi để chẩn đoán không.

Test PDF thông thường không chứng minh được fix JBIG2; phải có fixture PDF chứa JBIG2 thật hoặc kiểm thử browser phù hợp.

### 7. Range Requests không phải page cache — Major

Endpoint file hiện hỗ trợ session/quyền, `206`, `Accept-Ranges` và byte range. Đây là boundary phân phối file, không phải cache theo trang. PDF.js quyết định byte range dựa trên cấu trúc PDF; server không thể cam kết một range tương ứng một page.

Tài liệu nên nói rõ client preload qua PDF.js, server chỉ phục vụ byte ranges riêng tư; đồng thời yêu cầu hủy request khi đổi sách/rời reader và không preload toàn bộ PDF ngoài ý muốn.

### 8. Chống ghi lùi progress — Major

`clientUpdatedAt`, conflict `409` và `force` là nền tảng tốt, nhưng cần invariant server rõ ràng:

- request cũ đến sau request mới có bị từ chối không;
- timestamp client hay version server là nguồn sự thật;
- hai request cùng timestamp xử lý thế nào;
- `force` có được phép ghi lùi không;
- `sendBeacon` có thể chạy sau request đang chờ không;
- response cũ có thể cập nhật `latestSyncedPageRef` sau response mới không.

Đề xuất: chỉ thay thế phiên bản server khi base version khớp, hoặc sau thao tác force được người dùng xác nhận; response cũ phải bị bỏ qua.

### 9. License và khảo sát plugin — Major

Có thể học hành vi quan sát được của plugin để thiết kế prototype, nhưng không suy luận quyền sao chép code, asset, naming structure đặc thù hay dependency nội bộ từ license plugin. Mỗi dependency mới cần license/version/transitive-license review và bundle review độc lập.

## Đề xuất cấu trúc lại tài liệu

Tách thành bốn phần:

1. **Locked product outcomes:** hành vi người dùng bắt buộc.
2. **Non-goals:** không kiểm soát browser chrome, không cache toàn bộ PDF, không đảm bảo format mà decoder không hỗ trợ.
3. **Technical invariants:** transition state machine, cache physical-page, cleanup, optimistic concurrency.
4. **Feasibility and verification:** prototype và test nào chứng minh được outcome nào.

Nên có feasibility gate trước khi khóa engine/acceptance:

- single page và spread;
- drag complete/cancel;
- cache ready/eviction/cleanup;
- PDF lớn và memory pressure;
- JBIG2/decode failure;
- native/fallback fullscreen;
- ordering của progress writes.

## Kết luận và phạm vi thay đổi

- `docs/new-flip.md` phù hợp làm đầu vào planning sau khi bổ sung các định nghĩa trên.
- Chưa nên coi các mục O1–O4 là bằng chứng implementation đã đạt.
- Unit test cho `computeRenderedPagesSet` chỉ chứng minh tập số trang; không chứng minh canvas đã decode, animation đã commit hay memory đã được giải phóng.
- Không sửa runtime/backend trong lần phản biện này.

**Evidence đã đối chiếu:** `docs/new-flip.md` (SHA `sha256:25b8b5d72ad76ec27e64224c64a82e7134895cd2c0af93f94cb601fe2e9050ff`), `components/PdfFlipReader.js`, `components/ReaderToolbar.js`, `components/pdf-client-utils.js`, `lib/reader-metrics.js`, `app/api/books/[id]/file/route.js`, `app/api/books/[id]/progress/route.js`, `lib/storage.js`.
