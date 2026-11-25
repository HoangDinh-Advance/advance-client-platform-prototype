# Advance Client Platform (bản demo)

Prototype tương tác cho cổng khách hàng của Advance Vietnam và hai chức năng nhỏ trên B2B, dựng theo `SPEC-client-portal-dev.md` (12/11/2026). Toàn bộ dữ liệu là dữ liệu mẫu, API là mock, không gọi hệ thống thật nào.

**Demo:** https://hoangdinh-advance.github.io/advance-client-platform-prototype/

## Chạy thử

Trang tĩnh thuần HTML/CSS/JS, không cần build.

- Trên máy: `python3 -m http.server 8791` trong thư mục này, rồi mở `http://127.0.0.1:8791/`.
- GitHub Pages: đẩy nguyên thư mục lên nhánh `main` của một repo, bật Pages ở thư mục gốc (đã có `.nojekyll`).

Đăng nhập chỉ bằng email: bất kỳ email nào của doanh nghiệp đã đăng ký với Advance trên B2B (chủ, kế toán, …), lưu dạng băm `emailHashes` trong `assets/clients.js`; khách mẫu dùng `ketoan.mauanphuc@gmail.com`. Mã OTP gửi tới email đó. Bản demo không gửi email thật: mã OTP điền sẵn `123456`, nhập đủ 6 số bất kỳ là đúng, toàn số 0 là sai.

Biểu phí (Gói của Tài trợ lương, Tài trợ hóa đơn và mức chiết khấu Mua bán nợ) đi theo khách đang đăng nhập. Danh sách 19 khách test và biểu phí của họ (biểu phí lấy từ B2B ngày 23/11/2026, email từ bản chụp B2B 23/10/2026 trên BigQuery) nằm ở `assets/clients.js`; khách mẫu `0100000001` dùng biểu phí mẫu, MST khác không đăng nhập được.

Vào **Mua bán nợ**, **Tài trợ hóa đơn** hoặc **Tài trợ lương** lần đầu sẽ gặp thêm lớp **Đăng nhập HĐĐT** (tài khoản / mã số thuế + mật khẩu hóa đơn điện tử), giống prototype cổng HĐĐT trước đây. Tài khoản là MST của doanh nghiệp đang đăng nhập, hiện sẵn; khách chỉ nhập mật khẩu Cổng hóa đơn điện tử (hoadondientu.gdt.gov.vn), bản demo là `123456`; bản demo không gọi cổng thuế và không giữ mật khẩu. Đăng nhập một lần dùng chung cho cả ba sản phẩm, giữ đến khi bấm Ngắt kết nối hoặc Đặt lại demo.

Màn đăng nhập của Tài trợ lương chỉ khác câu chữ (không nói tới lấy hóa đơn).

**Tài trợ lương** dùng file chi lương của B2B: `assets/File-chi-luong-mau.xlsx` là file `Disbursement_Template_VN.xlsx` của B2B điền sẵn 25 nhân viên mẫu. Khách tải file mẫu, điền rồi kéo thả (hoặc chọn) tệp .xlsx/.xls/.csv; trình duyệt đọc tệp bằng SheetJS và kiểm tra theo quy tắc của B2B: đủ cột `account_number`, `amount`, `channel_code`, `account_name`; mã ngân hàng có trong sheet VN Channel Code; số tiền từ 10.000 đến 200.000.000 VND mỗi người. Còn dòng lỗi thì không gửi được yêu cầu.

| Phần | Địa chỉ |
|---|---|
| Cổng khách hàng | `#tong-quan`, `#mua-ban-no`, `#dang-ky-trich-no`, `#huy-uy-quyen`, `#invoice-financing`, `#payroll-financing` |
| B2B (nội bộ Advance) | `#b2b-loans`, `#b2b-loan`, `#b2b-cancel-requests`, `#b2b-authorizations` |

Cổng và B2B dùng chung một kho trạng thái trong `localStorage`. Mở hai tab cạnh nhau thì thao tác bên này hiện ngay bên kia. Link sang B2B nằm trong khung **Thiết lập demo** ở đầu mỗi trang.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html` | Khung trang, hộp thoại, nguyên văn Điều kiện và Điều khoản EPAY |
| `assets/app.css` | Giao diện theo bridge invoice prototype (màu chủ đạo `#12634f`) |
| `assets/api.js` | **Lớp `api` duy nhất.** Giao diện chỉ gọi các hàm ở đây |
| `assets/mock-server.js` | Backend giả: dữ liệu mẫu spec §2, handler theo endpoint spec §5, EPAY giả lập |
| `assets/ui.js` | Khung trang, bảng Thiết lập demo, hộp thoại, điều hướng |
| `assets/portal.js` | S1 đến S4 của cổng khách hàng, và trang Payroll Financing |
| `assets/b2b.js` | B1 Auto-debit card, B2 Cancel requests, B3 Debit authorizations |

### Nối API thật

Chỉ sửa hàm `transport(method, path, body)` trong `assets/api.js` thành `fetch` tới backend. Tên endpoint và payload đã theo spec §5. Nhóm `api.demo.*` và `api.onChange` chỉ phục vụ bản demo, bỏ khi nối thật.

## Quy ước của bản demo

- Ngày "hôm nay" cố định là **12/11/2026** để dữ liệu mẫu luôn đúng. Giờ phút lấy theo đồng hồ thật.
- Mã OTP: nhập đủ số ký tự bất kỳ là đúng, nhập toàn số 0 là sai. Tối đa 3 lần nhập, gửi lại tối đa 5 lần.
- Lệnh trích nợ trả kết quả sau 3 giây, theo lựa chọn ở Thiết lập demo.
- **Đặt lại demo** đưa dữ liệu về đúng spec §2 và quay về màn đăng nhập.
- Tỷ lệ (3) làm tròn nửa lên đến đồng theo từng hóa đơn rồi mới cộng: 3 hóa đơn Sonpro ra **2.454.545.454** ở 90% và **2.181.818.182** ở 80%.
- **Luật 90 ngày (thêm 13/11):** hóa đơn đầu ra và đầu vào quá 90 ngày kể từ ngày hóa đơn thì không chọn được, backend giả cũng từ chối. Hóa đơn 00000412 được đổi ngày từ 09/08/2026 (theo spec §2) sang 15/08/2026 để không vướng luật này và giữ kịch bản bán 3 hóa đơn Sonpro.
- **Duyệt yêu cầu bán nợ (thêm 16/11):** bấm "Advance duyệt" ở Thiết lập demo sinh giao dịch mới `DEMO-RRP-000n`, Principal amount = Giá Mua nợ đề nghị; giao dịch hiện ở Lịch thanh toán của khách (mỗi hóa đơn một dòng) và ở bảng Loans của B2B.
- **Ngày đến hạn dự kiến (thêm 13/11)** = ngày hóa đơn + kỳ hạn thanh toán của Bên thanh toán (`paymentTermDays` trong dữ liệu mẫu), theo RRP-SPEC §3b.
- **Gói và phí dự kiến của Invoice Financing (thêm 13/11):** màn xác nhận cho chọn Gói 30 / 60 / 90 Ngày và hiện phí dịch vụ dự kiến = tổng hóa đơn × mức phí (số mẫu 1,65% / 3,3% / 4,95%, đã gồm VAT).
- **Payroll Financing (thêm 17/11):** trang riêng với luồng Tạo yêu cầu chi lương → tải bảng lương → xác nhận Gói và phí dự kiến → gửi yêu cầu, kèm Lịch sử yêu cầu. Bản demo không đọc nội dung tệp: tệp nào (.xlsx, .xls, .csv) cũng trả về bảng lương mẫu 25 nhân viên, tổng 483.000.000 VND; tệp không rời khỏi trình duyệt.
- **Trích nợ tự động qua EPAY đang tắt (17/11):** các màn đăng ký và hủy ủy quyền, lựa chọn 90% / 80%, thẻ Trích nợ tự động, Yêu cầu hủy và Danh sách ủy quyền trên B2B không còn hiện; mọi Bên thanh toán dùng tỷ lệ mua nợ 80%. Tắt bằng một công tắc `AUTO_DEBIT_ENABLED` trong `assets/mock-server.js`; mã nguồn phần này vẫn còn, đổi thành `true` là bật lại.
- **Tổng quan (sửa 17/11):** thẻ hạn mức ghi "Hạn mức còn lại"; Lịch thanh toán là danh sách phẳng xếp theo ngày đến hạn, không còn dòng nhóm ngày, dòng Tổng hay cột Người trả; chỉ tô nổi ba loại: trễ hạn (đỏ), đến hạn hôm nay (vàng đậm), đến hạn trong tuần này (vàng nhạt); ba cột Số tiền tài trợ = Số tiền đã trả + Số tiền đến hạn còn lại; tab Đã thanh toán; cuối trang có Thông tin thanh toán gồm hai tài khoản (khoản thanh toán gốc và phí dịch vụ), nội dung chuyển khoản `<TÊN VIẾT TẮT> thanh toan` và `<TÊN VIẾT TẮT> thanh toan phi`.
- **Bán hóa đơn (sửa 17/11):** cột (1) ghi "Giá trị hóa đơn (chưa VAT)"; màn xác nhận là bảng ngang theo từng hóa đơn, có Giá Mua nợ đề nghị phân bổ và **Khoản chiết khấu dự kiến** (mức 30 ngày 2,90% chưa VAT, tính theo số ngày từ hôm nay tới ngày đến hạn của từng hóa đơn, VAT 10%, làm tròn nửa lên; công thức RRP-SPEC §1). Hóa đơn mẫu 00000405 (05/08/2026) minh họa luật không bán hóa đơn quá 90 ngày.
- **Toàn bộ giao diện bằng tiếng Việt (17/11):** kể cả phần B2B, số và ngày theo kiểu Việt (`1.090.909.091`, `dd/mm/yyyy`). Tên sản phẩm trên giao diện: Tài trợ lương (Payroll Financing), Tài trợ hóa đơn (Invoice Financing), Mua bán nợ; "Transaction account" hiện là Tài khoản Giao dịch.
- **Nhà cung cấp được chấp thuận (thêm 13/11):** màn Invoice Financing có danh sách này; hóa đơn của nhà cung cấp ngoài danh sách bị khóa.

## Đã kiểm tra

Ngày 12/11/2026, chạy trên Chrome qua `http.server`: 6 kịch bản nghiệm thu trong prompt và kịch bản B2B "Không nhận được kết quả" đều đạt; bề ngang 390px không bị cuộn ngang trang. Chưa thử trên Safari, Firefox hay điện thoại thật.

Ngày 13/11 và 16/11/2026, sau các mục thêm ở trên: chạy lại trên Chrome các màn Mua bán nợ, cửa sổ Bán hóa đơn, Invoice Financing, Tổng quan sau khi duyệt yêu cầu, và B2B Loans. Kịch bản nghiệm thu 3 và 4 ra đúng số trong prompt.

Các chỗ spec chưa nói rõ và cách bản build tạm xử lý được ghi trong `CAU-HOI.md`, tài liệu nội bộ, không nằm trong repo này.
