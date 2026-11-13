# Feasibility prototype report: reader lật trang

## Phạm vi

Prototype này kiểm tra các hợp đồng thuần JavaScript trong `docs/new-flip.md`, không nối vào production reader và không thay đổi backend:

- transition controller với `transitionId`, khóa transition đang chạy, queue tối đa một input, commit/cancel;
- rendered physical-page cache với cửa sổ trước/sau, trạng thái và cleanup khi eviction/dispose;
- spread mapping có cover trang 1 riêng, spread vật lý từ `(2,3)`;
- native fullscreen success và app-level fallback khi API bị reject/không có;
- decode recovery cục bộ theo page, retry hữu hạn và lỗi JBIG2-like không làm ảnh hưởng page khác.

## Artifact và verification

- Prototype/test policy: `tests/reader-feasibility-prototype.test.mjs`
- Browser adapter/test: `tests/reader-browser-feasibility.mjs`, `tests/reader-browser-feasibility.test.mjs`.
- Prototype policy và browser adapter vẫn nằm ngoài production import graph; production reader hiện đã dùng `lib/reader-transition.js` cho navigation tuần tự.
- Browser probe kiểm tra drag threshold và cancel; adapter gọi `flipNext`/`flipPrev`, chỉ commit khi completion callback trả đúng physical page; queue tối đa một input; cancel gọi `stop`; rendered resource abort và cleanup đúng một lần.
- Verification owner đã xác nhận: 13 test pass, 0 fail. Đây là bằng chứng cho các test đã chạy; chưa phải browser matrix hoặc JBIG2 fixture thật.

## Kết quả kỹ thuật

### Transition

Mô hình controller khả thi nếu `react-pageflip` được adapter hóa để phát đủ callback start/complete/cancel. `onFlip` đơn lẻ không đủ chứng minh commit semantics; production cần adapter ghi nhận completion tương ứng với `transitionId` và bỏ response/event cũ. Browser probe mới mô phỏng được phần imperative API: drag hợp lệ phân loại thành next/previous, drag dưới ngưỡng hoặc quá thời gian bị cancel, completion sai physical page không commit, và input thứ ba bị từ chối khi đã có một input chờ.

### Cache

Cửa sổ vật lý dễ xác định: với single mode, `current - 10 ... current ... current + 10`; spread thêm physical page đang mở. Rendered cache cần metadata scale/DPR/layout và resource cleanup. Prototype chứng minh policy; browser resource probe chứng minh được hợp đồng abort/cleanup idempotent, nhưng chưa chứng minh PDF.js canvas thực tế đã decode/render hoặc đo memory pressure.

### Spread

Prototype chọn quy tắc rõ ràng: cover page 1 đứng riêng; các spread tiếp theo bắt đầu tại trang chẵn `(2,3), (4,5)…`; trang cuối lẻ đứng một mình. Đây là quyết định cần owner/implementation giữ nhất quán khi jump, resize và rotate.

### Fullscreen

Native success và rejection có thể được bao bọc bởi một adapter. App fallback chỉ chiếm viewport khả dụng; không thể ẩn browser chrome. Browser test vẫn cần kiểm tra `fullscreenchange`, Escape, safe-area, `100dvh` và iPhone/iPad Safari.

### Decode

Page-local state `loading → ready` hoặc `loading → failed → retry` là khả thi. Fixture hiện tại chưa phải PDF JBIG2 thật; prototype chỉ kiểm tra error isolation/retry contract, không chứng minh decoder JBIG2 hoặc worker asset compatibility.

## Giới hạn và việc cần làm trước production

1. Viết adapter/prototype browser thật cho callback của `react-pageflip`, drag threshold và cancel.
2. Đo rendered canvas/bitmap memory với PDF lớn; xác minh `PDFPageProxy.cleanup()`, render-task cancel và document destroy khi unmount/đổi sách.
3. Chốt spread anchor với owner, đặc biệt cover, jump trang chẵn và single↔spread.
4. Chạy matrix fullscreen trên Chromium/Android/iPhone/iPad; kiểm tra native reject và orientation.
5. Bổ sung PDF fixture chứa JBIG2 thật hoặc quy trình test có artifact được xác minh; kiểm tra worker/decoder version.
6. Kiểm thử progress ordering ở server với request trễ, response cũ, hai thiết bị và `force`; prototype này chưa thay đổi concurrency contract.

## Trạng thái delivery hiện tại

- Đã tích hợp transition controller production vào navigation tuần tự trong `components/PdfFlipReader.js`; jump trực tiếp vẫn tách khỏi animation.
- Đã thêm hủy transition và gọi `pdfDocument.destroy()` khi reader unmount.
- Đã thêm sequence guard cho progress response để response cũ không ghi lùi client state trong `components/ReaderToolbar.js`; server-side atomic compare-and-swap vẫn chưa được chứng minh.
- Đã bổ sung Escape, nút thoát fullscreen có focus/aria-label, `100dvh`, safe-area và ẩn toolbar mobile trong `app/reader.css`.
- Đã thay loader dynamic vô hạn bằng loader client có timeout/import-error state trong `components/ReaderClientWrapper.js`; iOS WebKit 12 trở xuống được nhận diện và báo không tương thích thay vì treo ở màn hình khởi tạo.
- Đã thêm test capability `tests/reader-client-loader.test.mjs` cho user-agent iOS 12.5.7.

Prototype cho thấy các policy controller/cache/spread/fullscreen/decode có thể mô hình hóa độc lập và không cần sao chép vendor code. Verification hiện có 13 test pass, 0 fail theo owner report; test capability mới cần được cộng vào lần chạy kế tiếp. iOS 12.5.7 hiện có fallback thông báo rõ ràng, không phải PDF reader đầy đủ. Chưa đủ bằng chứng cho rendered canvas cache thật, browser matrix, JBIG2 fixture thật hoặc server-side atomic concurrency; các phần đó vẫn là việc tiếp theo trước khi tuyên bố đạt O1–O4.
