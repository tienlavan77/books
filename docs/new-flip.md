# Kế hoạch kỹ thuật: Reader lật trang 3D cho `books`

> Đây là ghi chú kỹ thuật phục vụ planning và phân rã delivery; không phải canonical Architecture Plan, không thay thế approval/revision của Node và chưa tự dispatch SE.

## 1. Locked product outcomes

### O1 — Mọi thao tác chuyển trang có lật 3D và commit nhất quán

- Chuột kéo mép/góc, vuốt cảm ứng, nút trước/sau và `ArrowLeft`/`ArrowRight` đều đi qua cùng transition controller; không đổi trang tức thời đối với thao tác lật tuần tự.
- Transition có các trạng thái: `idle → dragging → animating → committed` hoặc `dragging/animating → cancelled`.
- Mỗi transition có `transitionId`; khi đang `animating`, input mới bị khóa hoặc được xếp hàng có giới hạn.
- Vượt ngưỡng kéo thì hoàn tất; chưa đủ ngưỡng hoặc lỗi thì hoàn tác.
- Chỉ sự kiện `committed` mới cập nhật trang hiển thị và phát sinh ghi tiến độ. `cancelled` không ghi tiến độ.
- Jump trực tiếp tới trang, thay đổi zoom và đổi layout là các thao tác riêng; phải giữ vị trí đọc theo quy tắc O2 và không được giả danh là animation lật tuần tự.

### O2 — Quy tắc single/spread và cache vật lý rõ ràng

- Mobile/màn hình dọc hiển thị một trang; màn hình lớn/ngang hiển thị spread hai trang.
- Spread bắt đầu từ quy tắc được implementation ghi rõ, bao gồm cover/trang 1 và trường hợp trang cuối lẻ.
- Khi single ↔ spread hoặc xoay màn hình, neo theo physical page đang đọc; không tự ghi tiến độ chỉ vì resize.
- `currentPage` và `progressPercent` đại diện cho physical page neo của reader, không phải spread index.
- Cache phân biệt `loading`, `ready`, `failed`, `evicted`; `getPage()`/preload chỉ là page-proxy cache, không được coi là canvas đã decode/render.
- Rendered-page cache tính theo physical page, có giới hạn, eviction và cleanup/hủy task khi vượt giới hạn, đổi zoom/DPR/layout/sách hoặc unmount.
- Rời reader phải dispose document/page/render task/canvas phù hợp; không preload toàn bộ PDF.

### O3 — Fullscreen mobile tối giản và có fallback minh bạch

- Native fullscreen, nếu được trình duyệt cho phép, dùng vùng đọc toàn viewport khả dụng với `100dvh` và safe-area.
- Khi fullscreen mobile, ẩn toàn bộ toolbar; chỉ giữ nút thoát nhỏ ở góc với `aria-label`, focus behavior và vùng chạm đủ lớn.
- Xử lý `fullscreenchange`, Escape, `requestFullscreen()` bị reject và xoay thiết bị.
- Nếu Fullscreen API không khả dụng, dùng app-level fallback chiếm viewport khả dụng và khôi phục toolbar/trang khi thoát.
- Không cam kết ẩn browser chrome trên Safari/iPadOS; đây là giới hạn trình duyệt.

### O4 — PDF riêng tư, tiến độ đồng bộ và lỗi decode không phá hỏng reader

- Giữ session/quyền truy cập, endpoint PDF riêng tư, `206 Partial Content`, `Content-Range`, `Accept-Ranges`, MariaDB/Prisma và filesystem `storage/` hiện tại.
- Progress write chỉ phát sinh sau `committed`; request cũ/response cũ không được ghi đè state mới. Quy tắc base-version/server-version, xử lý xung đột và quyền `force` phải được kiểm chứng trước implementation.
- Lỗi decode ở một physical page phải có trạng thái `failed`, placeholder/retry hoặc thông báo cục bộ; không làm trắng toàn bộ reader.
- Worker/decoder asset phải khớp phiên bản PDF.js; phải có timeout/cancel/log mã lỗi cho lỗi JBIG2 và lỗi dependent image.
- Có fixture hoặc quy trình kiểm thử cho PDF chứa JBIG2 thật; PDF thông thường không đủ chứng minh acceptance này.

## 2. Non-goals và giới hạn

- Không đưa PHP, shortcode, admin code WordPress hoặc nguyên plugin `3d-flipbook-dflip-lite` vào production.
- Không sao chép `dflip.js`, asset, naming structure hoặc dependency nội bộ khi chưa có đánh giá license/bundle độc lập.
- Không coi HTTP Range Requests là page cache; server chỉ phục vụ byte range riêng tư, PDF.js chịu trách nhiệm tải dữ liệu.
- Không cam kết ẩn thanh địa chỉ/browser chrome trên Safari/iPhone/iPad.
- Không cam kết hỗ trợ mọi PDF decoder/codec; lỗi định dạng không hỗ trợ phải được cô lập và hiển thị có kiểm soát.
- Không cache toàn bộ PDF hoặc giữ canvas của toàn bộ tài liệu trong bộ nhớ.

## 3. Bằng chứng khảo sát

- `docs/3d-flipbook-dflip-lite/assets/js/dflip.js`: có các symbol `FlipBook3D`, `BookSheet3D`, `Page3D`, `arrowKeysAction`, `hideControls`, `onFlip`; đây là bằng chứng tham khảo hành vi, không phải quyết định tái sử dụng code.
- `docs/3d-flipbook-dflip-lite/3d-flipbook-dflip-lite.php`: plugin version `2.4.37`, khai báo `GPL2+`.
- `docs/3d-flipbook-dflip-lite/readme.txt`: khai báo `GPLv2 or later`; license của dependency/asset riêng vẫn chưa được suy ra.
- `docs/feedback-new-flip.md`: phản biện đã nêu các invariant cache, transition, spread, fullscreen, JBIG2, Range Requests và concurrency cần khóa.
- `components/PdfFlipReader.js`, `components/ReaderClientWrapper.js`, `components/ReaderToolbar.js`, `components/pdf-client-utils.js`, `lib/reader-metrics.js`: implementation reader hiện tại cần được SE đối chiếu.
- `app/api/books/[id]/file/route.js`, `app/api/books/[id]/progress/route.js`, `lib/storage.js`: boundary phân phối PDF, Range Requests, filesystem và progress hiện có.

## 4. Technical invariants

### Transition và persistence

Mọi thao tác tuần tự phải đi qua một controller duy nhất. Controller chịu trách nhiệm tạo `transitionId`, khóa/xếp hàng input, phát animation, xử lý complete/cancel và chỉ commit sau complete. Progress persistence nhận `committedPhysicalPage` cùng base/server version; response cũ phải bị bỏ qua. Debounce chỉ là tối ưu tần suất, không thay thế commit event hay concurrency control.

### Physical-page cache

Tách page-proxy/preload cache khỏi rendered bitmap/canvas cache. Mỗi entry có trạng thái và metadata scale/DPR/layout. Khi invalidated hoặc evicted phải hủy task/request còn hoạt động, cleanup canvas/bitmap và không giải phóng entry đang được animation sử dụng. Unmount/đổi sách phải dispose toàn bộ tài nguyên reader.

### Spread mapping

Implementation phải ghi rõ hàm mapping giữa physical page, spread và layout mode. Mapping phải xác định cover, trang lẻ/chẵn, trang cuối, jump tới trang chẵn và chuyển single/spread. Progress dùng physical page neo đã chốt, không dùng spread index.

### Decode recovery

Lỗi decode phải được cô lập theo page. Retry có giới hạn và có cancel/timeout; placeholder phải cho phép tiếp tục lật trang. Worker và decoder version phải được kiểm tra cùng dependency lockfile. Fixture JBIG2 phải được chạy trong verification riêng.

## 5. Feasibility gate dành cho SE

SE cần tạo prototype/read-only investigation trước khi khóa engine hoặc giao implementation:

1. Khảo sát reader hiện tại, PDF worker, Range Requests, progress API và lifecycle canvas.
2. Đối chiếu hành vi tham khảo với `FlipBook3D`, `BookSheet3D`, `Page3D`, `arrowKeysAction`, `hideControls`, `onFlip` mà không mặc định tái sử dụng vendor code.
3. Chứng minh bằng prototype rằng drag, swipe, nút và `ArrowLeft`/`ArrowRight` có animation/commit semantics phù hợp.
4. Kiểm tra single/spread mapping, cover, resize/rotate và jump tới trang chẵn.
5. Kiểm tra cache `loading/ready/failed/evicted`, eviction, cleanup, cancellation và memory pressure với PDF lớn.
6. Kiểm tra native/fallback fullscreen, safe-area, `100dvh`, Escape, reject và iPhone/iPad Safari.
7. Kiểm thử decode failure, gồm fixture JBIG2 nếu có thể, worker mismatch, retry, placeholder và isolation.
8. Kiểm thử ordering progress write với request trễ, response cũ, hai thiết bị và `force`.
9. Trả báo cáo lựa chọn kỹ thuật, file ảnh hưởng, license/bundle review, rủi ro, rollback và ma trận kiểm thử desktop/Android/iPhone/iPad.

## 6. Verification và acceptance evidence

- Ma trận input chứng minh thao tác tuần tự đều đi qua transition controller; evidence phải thể hiện animation complete/cancel và commit đúng một lần.
- Test mapping chứng minh single/spread, cover, trang cuối, jump, resize và rotate giữ physical page đúng.
- Test cache chứng minh giới hạn theo physical page, trạng thái ready/failed, eviction/cleanup và không giữ tài nguyên sau unmount.
- Test fullscreen chứng minh native success, native reject/API thiếu, `fullscreenchange`, Escape, safe-area và chỉ còn exit control trên mobile.
- Test progress chứng minh commit-only write, server/base version, conflict, force được kiểm soát và response cũ không ghi lùi.
- Test PDF chứng minh session/quyền, Range headers/206, hủy request khi rời reader và decode failure cục bộ.
- Build/lint/test của dự án phải chạy với JavaScript, không thêm `.ts`/`.tsx`.

## 7. Rủi ro, rollback và handoff

- Hiệu năng canvas/WebGL trên Safari: giới hạn cửa sổ, giảm độ phân giải hoặc fallback animation nhẹ; rollback chỉ lớp reader UI.
- Fullscreen khác nhau giữa trình duyệt: fallback app-level và thông báo đúng giới hạn browser chrome.
- License/API vendor không phù hợp: implementation riêng, không bundle vendor.
- JBIG2/decoder không ổn định: cô lập page, retry/placeholder và fallback có kiểm soát; không coi PDF thường là bằng chứng đủ.
- Animation chưa đạt độ chân thực: giữ reader hiện tại sau feature flag; không rollback backend/storage/progress.

Đây là đầu vào planning và feasibility, không phải ticket đã giao. Sau khi canonical plan được Node lưu và Owner duyệt đúng revision/SHA, Sprint Leader sẽ phân rã ticket; Node/Supervisor mới giao ticket feasibility cho SE.
