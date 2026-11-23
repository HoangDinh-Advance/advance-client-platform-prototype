/*
 * Mock backend cho bản demo: kho trạng thái (localStorage) + các handler theo spec §5 + EPAY giả lập.
 * Giao diện KHÔNG gọi file này trực tiếp, chỉ đi qua assets/api.js.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'advance-client-platform-demo/v10';
  // Ngày "hôm nay" của bản demo được cố định để dữ liệu mẫu ở spec §2 luôn đúng (đến hạn, quá hạn).
  var DEMO_TODAY = '2026-11-12';
  // Trích nợ tự động qua EPAY: tắt từ 17/11. Đổi thành true thì mọi màn và API liên quan trở lại.
  var AUTO_DEBIT_ENABLED = false;
  var DEMO_EMAIL = 'ketoan.mauanphuc@gmail.com';
  var DEFAULT_RRP_RATE_PCT = 3.19; // mức chiết khấu 30 ngày đã gồm VAT (2,90% chưa VAT) khi khách không có biểu phí riêng

  // Khách hàng test, nạp từ assets/clients.js nếu có: đăng nhập bằng MST của họ thì thấy tên và biểu phí của họ.
  function demoClients() { return root.ADVANCE_DEMO_CLIENTS || []; }
  function packagesFor(state, product, defaults) {
    var fees = state.customer.fees;
    if (!fees) return defaults.map(function (p) { return { tenorDays: p.tenorDays, feeRateMilli: p.feeRateMilli }; });
    return (fees[product] || []).map(function (t) { return { tenorDays: t[0], feeRateMilli: t[1] }; });
  }
  // Hóa đơn (đầu ra và đầu vào) quá số ngày này kể từ ngày hóa đơn thì không chọn được.
  var MAX_INVOICE_AGE_DAYS = 90;

  var BANKS = [
    { code: '970426', short: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam', otpLength: 6 },
    { code: '970422', short: 'MB Bank', name: 'Ngân hàng TMCP Quân Đội', otpLength: 8 },
    { code: '970436', short: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam', otpLength: 6 }
  ];
  // Gói Invoice Financing: kỳ hạn + mức phí đã gồm VAT 10%, tính theo phần vạn (165 = 1,65%). Số mẫu tự đặt.
  // Gói phí mặc định khi khách không có biểu phí riêng: kỳ hạn + mức phí đã gồm VAT, tính theo phần nghìn của phần trăm (1650 = 1,65%).
  var IF_PACKAGES = [
    { tenorDays: 30, feeRateMilli: 1650 },
    { tenorDays: 60, feeRateMilli: 3300 },
    { tenorDays: 90, feeRateMilli: 4950 }
  ];
  function ifFee(amount, feeRateMilli) { return Math.floor((amount * feeRateMilli + 50000) / 100000); }
  // Gói Payroll Financing và bảng lương mẫu. Bản demo không đọc nội dung tệp tải lên:
  // tệp nào cũng trả về bảng lương mẫu này. Số mẫu tự đặt.
  var PF_PACKAGES = [
    { tenorDays: 30, feeRateMilli: 1650 },
    { tenorDays: 60, feeRateMilli: 3300 }
  ];
  var PAYROLL_SAMPLE = (function () {
    var names = ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu', 'Phạm Quốc Dũng', 'Hoàng Thị Giang', 'Vũ Đức Hải', 'Đặng Thu Hà',
      'Bùi Anh Khoa', 'Đỗ Thị Lan', 'Ngô Văn Long', 'Dương Thị Mai', 'Lý Hoàng Nam', 'Phan Thị Ngọc', 'Trịnh Văn Phúc', 'Đinh Thị Quỳnh',
      'Hồ Minh Sơn', 'Mai Thị Tâm', 'Tạ Quang Thái', 'Cao Thị Thảo', 'Lâm Văn Toàn', 'Châu Thị Trang', 'Kiều Minh Tuấn', 'La Thị Uyên',
      'Quách Văn Vinh', 'Tô Thị Yến'];
    var banks = ['Vietcombank', 'MSB', 'MB Bank', 'Techcombank', 'BIDV'];
    return names.map(function (name, i) {
      return { no: i + 1, name: name, bankName: banks[i % banks.length], accountNo: '****' + String(1000 + (i * 739) % 9000),
        amount: 12000000 + ((i * 37) % 11) * 1500000 };
    });
  })();
  var PAYROLL_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
  var OTP_TRIES = 3;
  var OTP_MAX_SENDS = 5;
  var RATE_WITH_AUTH = 90;
  var RATE_WITHOUT_AUTH = 80;

  /* ------------------------------------------------------------------ dữ liệu mẫu (spec §2) */
  function seed() {
    return {
      version: 1,
      session: { loggedIn: false },
      // Kết nối tài khoản hóa đơn điện tử (cổng thuế). Mua bán nợ và Tài trợ hóa đơn chỉ mở khi đã kết nối.
      hddt: { connected: false, account: null, connectedAt: null, lastSyncAt: null },
      demo: { registerResult: 'ok', otpSeconds: 120, debitResult: 'ok' },
      seq: { sale: 0, ifReq: 0, pfReq: 0, pfFile: 0, cancel: 0, auth: 1, order: 0, loan: 3 },
      customer: {
        name: 'Công ty TNHH Mẫu An Phúc',
        shortName: 'ANPHUC',
        taxCode: '0100000001',
        // Đăng nhập: email của khách hàng + MST, xác thực bằng OTP gửi tới email này.
        email: DEMO_EMAIL,
        agreementNo: 'ANPHUC/ADVANCE/HĐMBN-01',
        phone: '0901234567'
      },
      limits: {
        // Đã dùng gồm cả hai khoản mẫu thêm để minh họa trễ hạn và đến hạn trong tuần (xem loans).
        PF: { granted: 2000000000, used: 860000000 },
        IF: { granted: 3000000000, used: 1400000000 },
        RP: { granted: 5000000000, used: 500000000 }
      },
      loans: [
        { id: 'DEMO-PF-0001', product: 'PF', buyerTaxCode: null, invoiceNo: null, dueDate: '2026-11-12', dpd: 0, outstanding: 710000000,
          schedule: [{ dueDate: '2026-11-12', amount: 710000000, collected: 0 }] },
        // Đã trả một phần: số tiền tài trợ 1.500.000.000 = đã trả 300.000.000 + còn lại 1.200.000.000.
        { id: 'DEMO-IF-0002', product: 'IF', buyerTaxCode: null, invoiceNo: null, dueDate: '2026-11-20', dpd: 0, outstanding: 1200000000,
          schedule: [{ dueDate: '2026-11-20', amount: 1500000000, collected: 300000000 }] },
        { id: 'DEMO-RRP-0003', product: 'RP', buyerTaxCode: '0309876543', invoiceNo: '00000398', dueDate: '2026-12-03', dpd: 0, outstanding: 500000000,
          schedule: [{ dueDate: '2026-12-03', amount: 500000000, collected: 0 }] },
        // Hai khoản mẫu tự đặt để Lịch thanh toán có đủ ba kiểu tô nổi: trễ hạn 7 ngày và đến hạn trong tuần này.
        { id: 'DEMO-IF-1004', product: 'IF', buyerTaxCode: null, invoiceNo: null, dueDate: '2026-11-05', dpd: 7, outstanding: 200000000,
          schedule: [{ dueDate: '2026-11-05', amount: 200000000, collected: 0 }] },
        { id: 'DEMO-PF-1005', product: 'PF', buyerTaxCode: null, invoiceNo: null, dueDate: '2026-11-14', dpd: 0, outstanding: 150000000,
          schedule: [{ dueDate: '2026-11-14', amount: 150000000, collected: 0 }] },
        // Các khoản đã thanh toán xong, cho tab Đã thanh toán (dữ liệu mẫu tự đặt).
        { id: 'DEMO-PF-1001', product: 'PF', buyerTaxCode: null, invoiceNo: null, dueDate: '2026-10-12', dpd: 0, outstanding: 0,
          schedule: [{ dueDate: '2026-10-12', amount: 650000000, collected: 650000000, paidAt: '2026-10-12' }] },
        { id: 'DEMO-IF-1002', product: 'IF', buyerTaxCode: null, invoiceNo: null, dueDate: '2026-10-20', dpd: 0, outstanding: 0,
          schedule: [{ dueDate: '2026-10-20', amount: 900000000, collected: 900000000, paidAt: '2026-10-19' }] },
        { id: 'DEMO-RRP-1003', product: 'RP', buyerTaxCode: '0312345678', invoiceNo: '00000371', dueDate: '2026-10-30', dpd: 0, outstanding: 0,
          schedule: [{ dueDate: '2026-10-30', amount: 400000000, collected: 400000000, paidAt: '2026-10-30' }] }
      ],
      // Buyer whitelist, lấy từ Credit information. Transaction account lưu theo từng Bên thanh toán.
      // paymentTermDays: kỳ hạn thanh toán của hợp đồng mua bán, dùng tính ngày đến hạn dự kiến (số mẫu tự đặt).
      buyers: [
        { taxCode: '0312345678', name: 'Công ty TNHH Sonpro', bankCode: '970426', accountNo: '03101012345678', txnStatus: 'Opened', paymentTermDays: 120 },
        { taxCode: '0309876543', name: 'Công ty CP Minh Long', bankCode: '970436', accountNo: '0071000123456', txnStatus: 'Opened', paymentTermDays: 136 },
        { taxCode: '0311122233', name: 'Công ty TNHH Hưng Thịnh', bankCode: null, accountNo: null, txnStatus: 'Committed (email)', paymentTermDays: 120 }
      ],
      // Nhà cung cấp được chấp thuận cho Invoice Financing: spec §2 không có, dữ liệu mẫu tự đặt.
      suppliers: [
        { taxCode: '0301234567', name: 'Công ty TNHH Thương mại Mẫu An Minh' },
        { taxCode: '0400123456', name: 'Công ty TNHH Mẫu Sông Lam' }
      ],
      auths: [
        { id: 'AUTH-0001', buyerTaxCode: '0309876543', status: 'ACTIVE', agreementNo: 'ANPHUC/ADVANCE/HĐMBN-01',
          bankCode: '970436', accountNo: '0071000123456', accountName: 'CONG TY TNHH MAU AN PHUC', phone: '0901234567',
          email: '', address: '', registeredAt: '2026-10-05T10:24:00', epayRegistrationId: 'VCB-DD-5b7e2a90',
          cancelRejectReason: null, otp: null }
      ],
      invoices: [
        // Hóa đơn đầu ra đã quá 90 ngày tính tới 12/11/2026, để thấy hóa đơn không bán được (mẫu tự đặt).
        inv('out', '00000405', 'Công ty TNHH Sonpro', '0312345678', '2026-08-05', 545454545, 600000000, 'UNSOLD'),
        inv('out', '00000412', 'Công ty TNHH Sonpro', '0312345678', '2026-08-15', 1090909091, 1200000000, 'UNSOLD'),
        inv('out', '00000418', 'Công ty TNHH Sonpro', '0312345678', '2026-08-16', 909090909, 1000000000, 'UNSOLD'),
        inv('out', '00000425', 'Công ty TNHH Sonpro', '0312345678', '2026-08-20', 727272727, 800000000, 'UNSOLD'),
        inv('out', '00000431', 'Công ty CP Minh Long', '0309876543', '2026-09-02', 454545455, 500000000, 'UNSOLD'),
        inv('out', '00000437', 'Công ty TNHH Hưng Thịnh', '0311122233', '2026-09-10', 272727273, 300000000, 'UNSOLD'),
        inv('out', '00000440', 'Công ty TNHH Thái Bình', '0315556667', '2026-09-15', 181818182, 200000000, 'UNSOLD'),
        inv('out', '00000398', 'Công ty CP Minh Long', '0309876543', '2026-07-20', 636363636, 700000000, 'SOLD'),
        // Hóa đơn đầu vào cho màn Invoice Financing: spec §2 không có, dữ liệu mẫu tự đặt.
        // Hóa đơn đã quá 90 ngày tính tới 12/11/2026, để thấy hóa đơn bị khóa.
        inv('in', '7996', 'Công ty TNHH Thương mại Mẫu An Minh', '0301234567', '2026-08-07', 220000000, 242000000, 'NEW'),
        inv('in', '8000', 'Công ty TNHH Thương mại Mẫu An Minh', '0301234567', '2026-10-06', 400000000, 440000000, 'NEW'),
        inv('in', '8001', 'Công ty TNHH Thương mại Mẫu An Minh', '0301234567', '2026-10-14', 250000000, 275000000, 'NEW'),
        inv('in', '8002', 'Công ty TNHH Mẫu Sông Lam', '0400123456', '2026-10-21', 180000000, 198000000, 'NEW'),
        inv('in', '8003', 'Công ty TNHH Mẫu Sông Lam', '0400123456', '2026-10-28', 120000000, 132000000, 'NEW'),
        inv('in', '8004', 'Công ty TNHH Thương mại Mẫu An Minh', '0301234567', '2026-11-04', 300000000, 330000000, 'NEW'),
        // Nhà cung cấp ngoài danh sách được chấp thuận, để thấy hóa đơn bị khóa.
        inv('in', '8005', 'Công ty TNHH Mẫu Đại Phát', '0305556668', '2026-11-09', 150000000, 165000000, 'NEW')
      ],
      saleRequests: [],
      ifRequests: [],
      payrollFiles: [],
      pfRequests: [],
      cancelRequests: [],
      debitOrders: []
    };
  }

  function inv(direction, number, partyName, partyTaxCode, issueDate, amountExVat, amountIncVat, status) {
    return { id: direction + '-' + number, direction: direction, number: number, partyName: partyName, partyTaxCode: partyTaxCode,
      issueDate: issueDate, amountExVat: amountExVat, amountIncVat: amountIncVat, status: status };
  }

  /* ------------------------------------------------------------------ kho trạng thái */
  var memoryFallback = null;
  var listeners = [];

  function storage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }

  function load() {
    var raw = null;
    try { var s = storage(); raw = s ? s.getItem(STORAGE_KEY) : memoryFallback; } catch (e) { raw = memoryFallback; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) return parsed;
      } catch (e) { /* dữ liệu hỏng: dùng lại bộ mẫu */ }
    }
    return seed();
  }

  function save(state) {
    var raw = JSON.stringify(state);
    memoryFallback = raw;
    try { var s = storage(); if (s) s.setItem(STORAGE_KEY, raw); } catch (e) { /* vẫn chạy được trong bộ nhớ */ }
    notify();
  }

  function notify() {
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* listener lỗi không chặn mock */ } });
  }

  if (root.addEventListener) {
    // Tab khác (cổng khách hàng <-> B2B) vừa ghi trạng thái.
    root.addEventListener('storage', function (event) { if (event.key === STORAGE_KEY || event.key === null) notify(); });
  }

  /* ------------------------------------------------------------------ tiện ích */
  function two(n) { return String(n).padStart(2, '0'); }
  function nowMs() { return Date.now(); }
  function nowStamp() {
    var d = new Date();
    return DEMO_TODAY + 'T' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  }
  function ok(data) { return { status: 200, data: data }; }
  function fail(status, code, message, extra) {
    var body = { code: code, message: message };
    if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    return { status: status, data: body };
  }
  function bankBy(code) { return BANKS.find(function (b) { return b.code === code; }) || null; }
  function buyerBy(state, taxCode) { return state.buyers.find(function (b) { return b.taxCode === taxCode; }) || null; }
  function latestAuth(state, taxCode) {
    var list = state.auths.filter(function (a) { return a.buyerTaxCode === taxCode; });
    return list.length ? list[list.length - 1] : null;
  }
  function authStatus(state, buyer) {
    if (!AUTO_DEBIT_ENABLED) return 'NONE';
    if (buyer.txnStatus !== 'Opened') return 'NOT_ELIGIBLE';
    var auth = latestAuth(state, buyer.taxCode);
    return auth ? auth.status : 'NONE';
  }
  // Ủy quyền còn hiệu lực tại EPAY cho tới khi Advance duyệt hủy, nên CANCEL_PENDING vẫn tính là còn hiệu lực.
  function authInEffect(status) { return status === 'ACTIVE' || status === 'CANCEL_PENDING'; }
  function rateFor(status) { return authInEffect(status) ? RATE_WITH_AUTH : RATE_WITHOUT_AUTH; }
  // (3) = (1) x (2), làm tròn nửa lên đến đồng, theo từng hóa đơn.
  // RRP-SPEC §3b: due_i = ngày hóa đơn i + kỳ hạn hợp đồng mua bán của Bên thanh toán.
  function addDays(iso, days) {
    var d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + days));
    return d.toISOString().slice(0, 10);
  }
  function dayNumber(iso) { return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000; }
  function invoiceAge(invoice) { return dayNumber(DEMO_TODAY) - dayNumber(invoice.issueDate); }
  function overAge(invoice) { return invoiceAge(invoice) > MAX_INVOICE_AGE_DAYS; }
  function maxPurchase(amountExVat, ratePercent) { return Math.floor((amountExVat * ratePercent + 50) / 100); }
  function available(limit) { return limit.granted - limit.used; }
  function norm(value) { return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toUpperCase(); }
  function digits(value) { return String(value == null ? '' : value).replace(/\D/g, ''); }
  function maskPhone(p) { return p ? p.slice(0, 3) + ' ••• •' + p.slice(-3) : ''; }
  function nextId(state, key, prefix) {
    state.seq[key] += 1;
    return prefix + String(state.seq[key]).padStart(4, '0');
  }

  /* ------------------------------------------------------------------ EPAY giả lập (B2B -> EPAY) */
  var EPAY_REGISTER_ERRORS = {
    '18': { field: null, message: 'Mã số doanh nghiệp không khớp' },
    '19': { field: 'accountName', message: 'Tên chủ tài khoản không khớp' },
    '20': { field: 'phone', message: 'Số điện thoại không khớp' },
    '24': { field: 'accountNo', message: 'Tài khoản không hợp lệ hoặc bị khóa' },
    '99': { field: null, message: 'Hệ thống đang bận' }
  };
  var epay = {
    register: function (state) {
      var result = state.demo.registerResult;
      if (result !== 'ok') return { errorCode: result };
      return { errorCode: '00' };
    },
    confirmOtp: function (auth, otp) {
      // Quy ước demo: nhập đủ số ký tự bất kỳ là đúng, toàn số 0 là sai.
      return { errorCode: /^0+$/.test(otp) ? '09' : '00' };
    },
    cancel: function () { return { errorCode: '00' }; },
    registrationId: function (bankCode) {
      var prefix = bankCode === '970422' ? 'MB' : bankCode === '970436' ? 'VCB' : 'MSB';
      return prefix + '-DD-' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    }
  };

  /* Lệnh trích nợ: kết quả về sau ~3 giây (thay cho IPN). Chạy ở đầu mỗi request và theo nhịp tick. */
  function settleOrders(state) {
    var changed = false;
    state.debitOrders.forEach(function (order) {
      if (order.status !== 'PROCESSING' || order.resolveAt > nowMs()) return;
      applyDebitResult(state, order, order.plannedResult);
      changed = true;
    });
    return changed;
  }

  function applyDebitResult(state, order, result) {
    if (result === 'none') { order.status = 'NO_RESULT'; return; }
    if (result === 'balance') { order.status = 'INSUFFICIENT_BALANCE'; return; }
    if (result === 'limit') { order.status = 'OVER_LIMIT'; return; }
    order.status = 'SUCCESS';
    var loan = state.loans.find(function (l) { return l.id === order.loanId; });
    if (!loan) return;
    var amount = Math.min(order.amount, loan.outstanding);
    loan.outstanding -= amount;
    var left = amount;
    loan.schedule.forEach(function (line) {
      var take = Math.min(left, line.amount - line.collected);
      line.collected += take;
      if (take > 0 && line.collected >= line.amount && !line.paidAt) line.paidAt = DEMO_TODAY;
      left -= take;
    });
    state.limits[loan.product].used = Math.max(0, state.limits[loan.product].used - amount);
  }

  /* ------------------------------------------------------------------ view models */
  function buyerView(state, buyer) {
    var status = authStatus(state, buyer);
    var auth = AUTO_DEBIT_ENABLED ? latestAuth(state, buyer.taxCode) : null;
    var bank = bankBy(buyer.bankCode);
    return {
      taxCode: buyer.taxCode,
      name: buyer.name,
      txnStatus: buyer.txnStatus,
      transactionAccount: buyer.accountNo ? { bankCode: buyer.bankCode, bankName: bank ? bank.short : '', accountNo: buyer.accountNo } : null,
      authStatus: status,
      authId: auth ? auth.id : null,
      rate: rateFor(status),
      cancelRejectReason: auth && auth.status === 'ACTIVE' ? auth.cancelRejectReason : null,
      authorization: auth ? authView(state, auth) : null
    };
  }

  function authView(state, auth) {
    var buyer = buyerBy(state, auth.buyerTaxCode);
    var bank = bankBy(auth.bankCode);
    return {
      id: auth.id, status: auth.status,
      clientName: state.customer.name, clientTaxCode: state.customer.taxCode,
      buyerName: buyer ? buyer.name : '', buyerTaxCode: auth.buyerTaxCode,
      agreementNo: auth.agreementNo, bankCode: auth.bankCode, bankName: bank ? bank.short : '',
      accountNo: auth.accountNo, accountName: auth.accountName, phone: auth.phone,
      registeredAt: auth.registeredAt, epayRegistrationId: auth.epayRegistrationId
    };
  }

  function nextDue(loan) {
    var line = loan.schedule.find(function (l) { return l.amount - l.collected > 0; });
    return line ? line.dueDate : loan.dueDate;
  }

  // Advance duyệt yêu cầu bán nợ -> sinh giao dịch Mua bán nợ. Principal amount = Giá Mua nợ.
  // Phân bổ theo RRP-SPEC §1: hóa đơn đến hạn sớm nhất trước, mỗi hóa đơn không quá (3) của nó.
  function createRpLoan(state, request) {
    var buyer = buyerBy(state, request.buyerTaxCode);
    var invoices = request.invoiceIds.map(function (id) { return state.invoices.find(function (i) { return i.id === id; }); })
      .filter(Boolean)
      .map(function (i) { return { inv: i, due: addDays(i.issueDate, buyer.paymentTermDays) }; })
      .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
    var left = request.requestedPurchasedAmount;
    var lines = [];
    invoices.forEach(function (x) {
      var take = Math.min(left, maxPurchase(x.inv.amountExVat, request.appliedRate));
      if (take > 0) lines.push({ dueDate: x.due, amount: take, collected: 0, invoiceNo: x.inv.number });
      left -= take;
    });
    state.seq.loan = (state.seq.loan || 3) + 1;
    var loan = {
      id: 'DEMO-RRP-' + String(state.seq.loan).padStart(4, '0'), product: 'RP', buyerTaxCode: buyer.taxCode,
      invoiceNo: invoices.map(function (x) { return x.inv.number; }).join(', '),
      dueDate: lines[0].dueDate, dpd: 0, outstanding: request.requestedPurchasedAmount,
      schedule: lines, saleRequestId: request.id
    };
    state.loans.push(loan);
    request.loanId = loan.id;
    return loan;
  }

  function loanView(state, loan) {
    var buyer = loan.buyerTaxCode ? buyerBy(state, loan.buyerTaxCode) : null;
    return {
      id: loan.id, product: loan.product,
      clientName: state.customer.name, clientTaxCode: state.customer.taxCode,
      buyerName: buyer ? buyer.name : null, buyerTaxCode: loan.buyerTaxCode, invoiceNo: loan.invoiceNo,
      dueDate: nextDue(loan), dpd: loan.dpd, outstanding: loan.outstanding,
      // Mua bán nợ: Principal amount của B2B chính là Giá Mua nợ, cũng là số tiền giải ngân.
      principalAmount: loan.schedule.reduce(function (sum, l) { return sum + l.amount; }, 0)
    };
  }

  function cancelRequestView(state, request) {
    var auth = state.auths.find(function (a) { return a.id === request.authId; });
    var view = auth ? authView(state, auth) : {};
    return {
      id: request.id, status: request.status, reason: request.reason, requestedAt: request.requestedAt,
      rejectReason: request.rejectReason, decidedAt: request.decidedAt, authId: request.authId,
      clientName: view.clientName, buyerName: view.buyerName, buyerTaxCode: view.buyerTaxCode,
      bankName: view.bankName, accountNo: view.accountNo, epayRegistrationId: view.epayRegistrationId
    };
  }

  function orderView(order) {
    return { id: order.id, loanId: order.loanId, sentAt: order.sentAt, amount: order.amount, note: order.note, status: order.status };
  }

  function saleRequestView(state, request) {
    var buyer = buyerBy(state, request.buyerTaxCode);
    return {
      id: request.id, submittedAt: request.submittedAt, buyerTaxCode: request.buyerTaxCode, buyerName: buyer ? buyer.name : '',
      invoiceCount: request.invoiceIds.length, invoiceIds: request.invoiceIds.slice(),
      requestedPurchasedAmount: request.requestedPurchasedAmount, appliedRate: request.appliedRate, status: request.status,
      loanId: request.loanId || null, expectedDiscount: request.expectedDiscount == null ? null : request.expectedDiscount
    };
  }

  function ifRequestView(state, request) {
    var invoices = request.invoiceIds.map(function (id) { return state.invoices.find(function (i) { return i.id === id; }); }).filter(Boolean);
    var suppliers = [];
    invoices.forEach(function (i) { if (suppliers.indexOf(i.partyName) < 0) suppliers.push(i.partyName); });
    return {
      id: request.id, submittedAt: request.submittedAt, supplierNames: suppliers, invoiceCount: request.invoiceIds.length,
      invoiceIds: request.invoiceIds.slice(), totalAmount: invoices.reduce(function (sum, i) { return sum + i.amountIncVat; }, 0),
      tenorDays: request.tenorDays || null, feeRateMilli: request.feeRateMilli || null,
      expectedFee: request.expectedFee == null ? null : request.expectedFee, status: request.status
    };
  }

  /* ------------------------------------------------------------------ kiểm tra lớp B2B cho đăng ký ủy quyền */
  function verifyAgainstB2B(state, body) {
    var buyer = buyerBy(state, body.buyerTaxCode);
    var mismatches = [];
    if (!buyer || buyer.txnStatus !== 'Opened') return { ok: false, mismatches: ['buyerTaxCode'] };
    if (norm(body.agreementNo) !== norm(state.customer.agreementNo)) mismatches.push('agreementNo');
    if (body.bankCode !== buyer.bankCode) mismatches.push('bankCode');
    if (digits(body.accountNo) !== buyer.accountNo) mismatches.push('accountNo');
    if (digits(body.phone) !== state.customer.phone) mismatches.push('phone');
    return { ok: mismatches.length === 0, mismatches: mismatches };
  }

  /* ------------------------------------------------------------------ handlers */
  var routes = [];
  function route(method, pattern, handler, options) {
    var names = [];
    var source = pattern.replace(/\{(\w+)\}/g, function (_, name) { names.push(name); return '([^/]+)'; });
    routes.push({ method: method, regex: new RegExp('^' + source + '$'), names: names, handler: handler, pub: !!(options && options.pub) });
  }

  // ---- Cổng -> B2B
  // Đăng nhập: email + MST, rồi xác thực mã OTP gửi tới email đó. Bản demo không gửi email thật.
  var LOGIN_OTP_LENGTH = 6;
  function maskEmail(email) {
    var at = email.indexOf('@');
    return email.slice(0, Math.min(2, at)) + '***' + email.slice(at);
  }
  function loginOtpView(state) {
    var otp = state.session.loginOtp;
    return {
      length: otp.length, triesLeft: otp.triesLeft, sendsLeft: OTP_MAX_SENDS - otp.sends,
      expiresInSeconds: Math.max(0, Math.ceil((otp.expiresAt - nowMs()) / 1000)),
      emailMasked: maskEmail((otp.customer && otp.customer.email) || state.customer.email || DEMO_EMAIL)
    };
  }

  route('POST', '/portal/auth/login', function (state, req) {
    var body = req.body || {};
    var email = String(body.email || '').trim().toLowerCase();
    var taxCode = digits(body.taxCode);
    // Bản demo không có email đăng ký của khách: nhận mọi email đúng định dạng, MST phải là khách mẫu hoặc khách test.
    var sample = seed().customer;
    var client = demoClients().find(function (c) { return c.taxCode === taxCode; });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (taxCode !== sample.taxCode && !client)) {
      return fail(401, 'INVALID_CREDENTIALS', 'Email hoặc mã số thuế không đúng');
    }
    var customer = client
      ? Object.assign({}, sample, { name: client.name, shortName: client.shortName, taxCode: client.taxCode, fees: client.fees, rrpRatePct: client.rrpRatePct })
      : sample;
    customer.email = email;
    state.session.loggedIn = false;
    state.session.loginOtp = { length: LOGIN_OTP_LENGTH, triesLeft: OTP_TRIES, sends: 1, expiresAt: nowMs() + state.demo.otpSeconds * 1000, customer: customer };
    return ok({ status: 'OTP_REQUIRED', otp: loginOtpView(state) });
  }, { pub: true });

  route('POST', '/portal/auth/login/otp', function (state, req) {
    var pending = state.session.loginOtp;
    if (!pending) return fail(404, 'LOGIN_NOT_STARTED', 'Chưa có lượt đăng nhập đang chờ OTP.');
    if (pending.expiresAt <= nowMs()) return fail(422, 'OTP_EXPIRED', 'Mã OTP đã hết hạn.');
    var otp = digits((req.body || {}).otp);
    if (otp.length !== pending.length || /^0+$/.test(otp)) {
      pending.triesLeft -= 1;
      if (pending.triesLeft <= 0) {
        state.session.loginOtp = null;
        return fail(422, 'OTP_LOCKED', 'Nhập sai OTP quá số lần cho phép.');
      }
      return fail(422, 'OTP_INVALID', 'Mã OTP không đúng.', { triesLeft: pending.triesLeft });
    }
    // Khách khác đăng nhập: dữ liệu demo về như ban đầu để không lẫn với lượt của khách trước.
    if (pending.customer.taxCode !== state.customer.taxCode) {
      var settings = state.demo;
      var fresh = seed();
      Object.keys(state).forEach(function (key) { delete state[key]; });
      Object.assign(state, fresh, { demo: settings });
    }
    state.customer = pending.customer;
    state.session.loginOtp = null;
    state.session.loggedIn = true;
    return ok({ name: state.customer.name, taxCode: state.customer.taxCode });
  }, { pub: true });

  route('POST', '/portal/auth/login/otp/resend', function (state) {
    var pending = state.session.loginOtp;
    if (!pending) return fail(404, 'LOGIN_NOT_STARTED', 'Chưa có lượt đăng nhập đang chờ OTP.');
    if (pending.sends >= OTP_MAX_SENDS) return fail(422, 'OTP_SEND_LIMIT', 'Đã quá số lần gửi OTP.');
    pending.sends += 1;
    pending.triesLeft = OTP_TRIES;
    pending.expiresAt = nowMs() + state.demo.otpSeconds * 1000;
    return ok({ status: 'OTP_REQUIRED', otp: loginOtpView(state) });
  }, { pub: true });

  // ---- Kết nối hóa đơn điện tử. Bản demo không gọi cổng thuế: chỉ nhận tài khoản mẫu bên dưới.
  var DEMO_HDDT = { password: 'demo-pass' };
  function hddtView(state) {
    var h = state.hddt || {};
    return { connected: !!h.connected, account: h.account || null, connectedAt: h.connectedAt || null, lastSyncAt: h.lastSyncAt || null };
  }
  function needHddt(state) {
    return state.hddt && state.hddt.connected ? null : fail(409, 'HDDT_NOT_CONNECTED', 'Chưa kết nối tài khoản hóa đơn điện tử.');
  }

  route('GET', '/portal/me/hddt', function (state) { return ok(hddtView(state)); });

  route('POST', '/portal/me/hddt/connect', function (state, req) {
    var body = req.body || {};
    var username = String(body.username || '').trim();
    if (!username || !body.password) return fail(422, 'FIELDS_REQUIRED', 'Nhập đủ tài khoản và mật khẩu.');
    if (!/^\d{10}(\d{3})?(-U\d{3})?$/i.test(username)) return fail(422, 'USERNAME_FORMAT', 'Tài khoản HĐĐT phải là mã số thuế hoặc tài khoản con dạng MST-U001.');
    if (username.split('-')[0] !== state.customer.taxCode) return fail(422, 'HDDT_NOT_OWN', 'Tài khoản HĐĐT không thuộc doanh nghiệp đang đăng nhập.');
    if (body.password !== DEMO_HDDT.password) return fail(401, 'HDDT_INVALID_CREDENTIALS', 'Tài khoản hoặc mật khẩu hóa đơn điện tử không đúng.');
    var stamp = nowStamp();
    state.hddt = { connected: true, account: username.toUpperCase(), connectedAt: stamp, lastSyncAt: stamp };
    return ok(hddtView(state));
  });

  route('POST', '/portal/me/hddt/disconnect', function (state) {
    state.hddt = { connected: false, account: null, connectedAt: null, lastSyncAt: null };
    return ok(hddtView(state));
  });

  route('POST', '/portal/auth/logout', function (state) {
    state.session.loggedIn = false;
    return ok({});
  }, { pub: true });

  route('GET', '/portal/me', function (state) {
    return ok({ name: state.customer.name, taxCode: state.customer.taxCode });
  });

  route('GET', '/portal/me/overview', function (state) {
    var limits = ['PF', 'IF', 'RP'].map(function (product) {
      var limit = state.limits[product];
      return { product: product, granted: limit.granted, used: limit.used, available: available(limit) };
    });
    // Mỗi hóa đơn của giao dịch Mua bán nợ có ngày đến hạn riêng, nên mỗi dòng lịch chưa thu là một dòng.
    // Số tiền tài trợ = số tiền đã trả + số tiền đến hạn còn lại. Dòng đã trả hết sang danh sách Đã thanh toán.
    var todayNo = dayNumber(DEMO_TODAY);
    var weekStart = todayNo - ((todayNo + 3) % 7); // thứ Hai của tuần này
    var schedule = [];
    var paid = [];
    state.loans.forEach(function (loan) {
      var buyer = loan.buyerTaxCode ? buyerBy(state, loan.buyerTaxCode) : null;
      loan.schedule.forEach(function (line) {
        var row = {
          loanId: loan.id, product: loan.product,
          buyerName: buyer ? buyer.name : null, invoiceNo: line.invoiceNo || loan.invoiceNo,
          payer: buyer ? 'BUYER' : 'CUSTOMER', payerName: buyer ? buyer.name : null,
          dueDate: line.dueDate, financedAmount: line.amount, paidAmount: line.collected
        };
        if (line.amount - line.collected > 0) {
          var dueNo = dayNumber(line.dueDate);
          row.dpd = Math.max(0, todayNo - dueNo);
          row.amountDue = line.amount - line.collected;
          // Chỉ ba loại được tô nổi: trễ hạn, đến hạn hôm nay, đến hạn trong tuần này (thứ Hai đến Chủ nhật).
          row.dueStatus = dueNo < todayNo ? 'OVERDUE' : dueNo === todayNo ? 'TODAY' : dueNo <= weekStart + 6 ? 'THIS_WEEK' : null;
          schedule.push(row);
        } else {
          row.paidDate = line.paidAt || null;
          paid.push(row);
        }
      });
    });
    paid.sort(function (a, b) { return (b.paidDate || '') < (a.paidDate || '') ? -1 : 1; });
    return ok({
      today: DEMO_TODAY, limits: limits, schedule: schedule, paid: paid,
      // Thông tin thanh toán của Advance: một tài khoản nhận khoản thanh toán gốc, một tài khoản nhận phí.
      // Nội dung chuyển khoản theo tên viết tắt của khách hàng. Số tài khoản là số mẫu.
      paymentAccounts: [
        { purpose: 'PRINCIPAL', accountName: 'CÔNG TY TNHH ADVANCE VIETNAM', bankName: 'Ngân hàng TMCP Hàng Hải Việt Nam (MSB)',
          accountNo: '0123456789', transferContent: (state.customer.shortName || 'ANPHUC') + ' thanh toan' },
        { purpose: 'FEE', accountName: 'CÔNG TY TNHH ADVANCE VIETNAM', bankName: 'Ngân hàng TNHH MTV Woori Việt Nam',
          accountNo: '9876543210', transferContent: (state.customer.shortName || 'ANPHUC') + ' thanh toan phi' }
      ]
    });
  });

  route('GET', '/portal/me/rp/buyers', function (state) {
    return ok({
      agreementNo: state.customer.agreementNo,
      customer: { name: state.customer.name, taxCode: state.customer.taxCode },
      limit: { granted: state.limits.RP.granted, used: state.limits.RP.used, available: available(state.limits.RP) },
      banks: BANKS.map(function (b) { return { code: b.code, short: b.short, name: b.name }; }),
      buyers: state.buyers.map(function (b) { return buyerView(state, b); })
    });
  });

  route('POST', '/portal/me/rp/debit-auth/verify', function (state, req) {
    return ok(verifyAgainstB2B(state, req.body || {}));
  });

  route('POST', '/portal/me/rp/debit-auth', function (state, req) {
    var body = req.body || {};
    var buyer = buyerBy(state, body.buyerTaxCode);
    var status = buyer ? authStatus(state, buyer) : null;
    // PENDING_OTP dở dang được đăng ký lại; các trạng thái khác không đăng ký được.
    if (!buyer || (status !== 'NONE' && status !== 'PENDING_OTP')) {
      return fail(409, 'AUTH_NOT_ALLOWED', 'Bên thanh toán này không ở trạng thái đăng ký được.');
    }
    if (!body.agreed) return fail(422, 'TERMS_NOT_ACCEPTED', 'Chưa đồng ý Điều kiện và Điều khoản.');
    var check = verifyAgainstB2B(state, body);
    if (!check.ok) return fail(422, 'B2B_MISMATCH', 'Thông tin không khớp dữ liệu B2B.', { mismatches: check.mismatches });

    var result = epay.register(state);
    if (result.errorCode !== '00') {
      var info = EPAY_REGISTER_ERRORS[result.errorCode] || { field: null, message: 'EPAY từ chối' };
      return fail(422, 'EPAY_ERROR', info.message, { epayCode: result.errorCode, field: info.field });
    }

    state.auths = state.auths.filter(function (a) { return !(a.buyerTaxCode === buyer.taxCode && a.status === 'PENDING_OTP'); });
    var bank = bankBy(body.bankCode);
    var auth = {
      id: nextId(state, 'auth', 'AUTH-'), buyerTaxCode: buyer.taxCode, status: 'PENDING_OTP',
      agreementNo: state.customer.agreementNo, bankCode: body.bankCode, accountNo: digits(body.accountNo),
      accountName: String(body.accountName || '').trim(), phone: digits(body.phone),
      email: String(body.email || '').trim(), address: String(body.address || '').trim(),
      registeredAt: null, epayRegistrationId: null, cancelRejectReason: null,
      otp: { length: bank.otpLength, triesLeft: OTP_TRIES, sends: 1, expiresAt: nowMs() + state.demo.otpSeconds * 1000 }
    };
    state.auths.push(auth);
    return ok({ authId: auth.id, status: 'PENDING_OTP', otp: otpView(auth) });
  });

  function otpView(auth) {
    return {
      length: auth.otp.length, triesLeft: auth.otp.triesLeft,
      expiresInSeconds: Math.max(0, Math.ceil((auth.otp.expiresAt - nowMs()) / 1000)),
      bankName: (bankBy(auth.bankCode) || {}).short, phoneMasked: maskPhone(auth.phone)
    };
  }

  function pendingAuth(state, authId) {
    var auth = state.auths.find(function (a) { return a.id === authId; });
    return auth && auth.status === 'PENDING_OTP' ? auth : null;
  }

  route('POST', '/portal/me/rp/debit-auth/{authId}/otp', function (state, req) {
    var auth = pendingAuth(state, req.params.authId);
    if (!auth) return fail(404, 'AUTH_NOT_FOUND', 'Không tìm thấy lượt đăng ký đang chờ OTP.');
    if (auth.otp.expiresAt <= nowMs()) return fail(422, 'OTP_EXPIRED', 'Mã OTP đã hết hạn.');
    var otp = digits((req.body || {}).otp);
    if (otp.length !== auth.otp.length) return fail(422, 'OTP_INVALID', 'Mã OTP không đúng.', { triesLeft: auth.otp.triesLeft });
    if (epay.confirmOtp(auth, otp).errorCode !== '00') {
      auth.otp.triesLeft -= 1;
      if (auth.otp.triesLeft <= 0) {
        // Hết lượt nhập: bỏ lượt đăng ký, Bên thanh toán quay về "Chưa đăng ký".
        state.auths = state.auths.filter(function (a) { return a.id !== auth.id; });
        return fail(422, 'OTP_LOCKED', 'Nhập sai OTP quá số lần cho phép.');
      }
      return fail(422, 'OTP_INVALID', 'Mã OTP không đúng.', { triesLeft: auth.otp.triesLeft });
    }
    auth.status = 'ACTIVE';
    auth.otp = null;
    auth.registeredAt = nowStamp();
    auth.epayRegistrationId = epay.registrationId(auth.bankCode);
    return ok({ authId: auth.id, status: 'ACTIVE', buyer: buyerView(state, buyerBy(state, auth.buyerTaxCode)) });
  });

  route('POST', '/portal/me/rp/debit-auth/{authId}/otp/resend', function (state, req) {
    var auth = pendingAuth(state, req.params.authId);
    if (!auth) return fail(404, 'AUTH_NOT_FOUND', 'Không tìm thấy lượt đăng ký đang chờ OTP.');
    if (auth.otp.sends >= OTP_MAX_SENDS) return fail(422, 'OTP_SEND_LIMIT', 'Đã quá số lần gửi OTP trong ngày.');
    auth.otp.sends += 1;
    auth.otp.triesLeft = OTP_TRIES;
    auth.otp.expiresAt = nowMs() + state.demo.otpSeconds * 1000;
    return ok({ authId: auth.id, status: 'PENDING_OTP', otp: otpView(auth) });
  });

  route('POST', '/portal/me/rp/debit-auth/{authId}/cancel-requests', function (state, req) {
    var auth = state.auths.find(function (a) { return a.id === req.params.authId; });
    if (!auth || auth.status !== 'ACTIVE') return fail(409, 'AUTH_NOT_ACTIVE', 'Ủy quyền không ở trạng thái Đang hiệu lực.');
    auth.status = 'CANCEL_PENDING';
    auth.cancelRejectReason = null;
    var request = {
      id: nextId(state, 'cancel', 'CR-'), authId: auth.id, buyerTaxCode: auth.buyerTaxCode,
      reason: String((req.body || {}).reason || '').trim(), requestedAt: nowStamp(), status: 'PENDING', rejectReason: null, decidedAt: null
    };
    state.cancelRequests.unshift(request);
    return ok({ id: request.id, status: 'CANCEL_PENDING' });
  });

  route('GET', '/portal/me/invoices', function (state, req) {
    if (needHddt(state)) return needHddt(state);
    var q = req.query;
    var direction = q.direction === 'in' ? 'in' : 'out';
    var items = state.invoices.filter(function (i) {
      if (i.direction !== direction) return false;
      if (q.from && i.issueDate < q.from) return false;
      if (q.to && i.issueDate > q.to) return false;
      if (q.buyer && i.partyTaxCode !== q.buyer) return false;
      return true;
    }).sort(function (a, b) { return a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : 0; });
    return ok({ items: items.map(function (i) {
      var view = Object.assign({}, i);
      view.ageDays = invoiceAge(i);
      view.overAge = overAge(i);
      if (direction === 'out') {
        var buyer = buyerBy(state, i.partyTaxCode);
        view.expectedDueDate = buyer && buyer.paymentTermDays ? addDays(i.issueDate, buyer.paymentTermDays) : null;
      }
      return view;
    }) });
  });

  // Kiểm tra một yêu cầu bán nợ, dùng chung cho tính chiết khấu dự kiến và gửi yêu cầu.
  function checkSale(state, body) {
    if (needHddt(state)) return { error: needHddt(state) };
    var ids = Array.isArray(body.invoiceIds) ? body.invoiceIds : [];
    var buyer = buyerBy(state, body.buyerTaxCode);
    if (!buyer) return { error: fail(422, 'BUYER_NOT_WHITELISTED', 'Bên thanh toán không thuộc danh sách được chấp nhận.') };
    var status = authStatus(state, buyer);
    if (status === 'CANCEL_PENDING') return { error: fail(422, 'AUTH_CANCEL_PENDING', 'Bên thanh toán đang chờ Advance duyệt hủy ủy quyền.') };
    var invoices = ids.map(function (id) { return state.invoices.find(function (i) { return i.id === id && i.direction === 'out'; }); });
    if (!ids.length || invoices.some(function (i) { return !i; })) return { error: fail(422, 'INVOICE_NOT_FOUND', 'Không tìm thấy hóa đơn.') };
    if (invoices.some(function (i) { return i.partyTaxCode !== buyer.taxCode; })) return { error: fail(422, 'MULTIPLE_BUYERS', 'Mỗi yêu cầu chỉ gồm hóa đơn của một Bên thanh toán.') };
    if (invoices.some(function (i) { return i.status !== 'UNSOLD'; })) return { error: fail(422, 'INVOICE_NOT_UNSOLD', 'Có hóa đơn đã bán hoặc đang chờ duyệt.') };
    if (invoices.some(overAge)) return { error: fail(422, 'INVOICE_TOO_OLD', 'Có hóa đơn đã quá ' + MAX_INVOICE_AGE_DAYS + ' ngày.') };
    var rate = rateFor(status);
    if (Number(body.appliedRate) !== rate) return { error: fail(422, 'RATE_MISMATCH', 'Tỷ lệ mua nợ không khớp trạng thái ủy quyền.', { rate: rate }) };
    var maxTotal = invoices.reduce(function (sum, i) { return sum + maxPurchase(i.amountExVat, rate); }, 0);
    var amount = Number(body.requestedPurchasedAmount);
    if (!Number.isInteger(amount) || amount <= 0) return { error: fail(422, 'AMOUNT_INVALID', 'Giá Mua nợ đề nghị không hợp lệ.') };
    if (amount > maxTotal) return { error: fail(422, 'AMOUNT_OVER_MAX', 'Giá Mua nợ đề nghị vượt quá tổng (3).', { max: maxTotal }) };
    if (amount > available(state.limits.RP)) return { error: fail(422, 'AMOUNT_OVER_LIMIT', 'Giá Mua nợ đề nghị vượt quá hạn mức còn lại.', { available: available(state.limits.RP) }) };
    return { buyer: buyer, invoices: invoices, ids: ids, rate: rate, maxTotal: maxTotal, amount: amount };
  }

  // Khoản chiết khấu dự kiến theo RRP-SPEC §1: phân bổ Giá Mua nợ cho hóa đơn đến hạn sớm nhất trước (không quá (3)),
  // chiết khấu chưa VAT = pur_i x mức 30 ngày chưa VAT x tenor_i / 30, VAT 10%, làm tròn nửa lên từng hóa đơn.
  // Ngày mua nợ tạm lấy là hôm nay; số chính thức do Advance chốt trên Phụ lục giao dịch.
  function saleDiscount(sale, state) {
    // Mức 30 ngày đã gồm VAT, theo phần trăm có 2 chữ số lẻ (319 = 3,19%); chưa VAT = mức / 1,1.
    var rate = Math.round((state.customer.rrpRatePct || DEFAULT_RRP_RATE_PCT) * 100);
    var todayNo = dayNumber(DEMO_TODAY);
    var left = sale.amount;
    var lines = sale.invoices.map(function (i) { return { inv: i, due: addDays(i.issueDate, sale.buyer.paymentTermDays) }; })
      .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; })
      .map(function (x) {
        var purchased = Math.min(left, maxPurchase(x.inv.amountExVat, sale.rate));
        left -= purchased;
        var tenor = Math.max(0, dayNumber(x.due) - todayNo);
        var exVat = Math.floor((2 * purchased * rate * tenor + 330000) / 660000);
        var vat = Math.floor((exVat + 5) / 10);
        return { invoiceNo: x.inv.number, dueDate: x.due, tenorDays: tenor, purchasedAmount: purchased, discountExVat: exVat, vat: vat, discount: exVat + vat };
      });
    return {
      lines: lines,
      discountExVat: lines.reduce(function (s, l) { return s + l.discountExVat; }, 0),
      vat: lines.reduce(function (s, l) { return s + l.vat; }, 0),
      discount: lines.reduce(function (s, l) { return s + l.discount; }, 0)
    };
  }

  route('POST', '/portal/me/rp/sale-requests/quote', function (state, req) {
    var sale = checkSale(state, req.body || {});
    if (sale.error) return sale.error;
    var quote = saleDiscount(sale, state);
    return ok({ requestedPurchasedAmount: sale.amount, expectedDiscount: quote.discount, expectedDiscountExVat: quote.discountExVat, expectedVat: quote.vat, lines: quote.lines });
  });

  route('POST', '/portal/me/rp/sale-requests', function (state, req) {
    var sale = checkSale(state, req.body || {});
    if (sale.error) return sale.error;
    var buyer = sale.buyer, invoices = sale.invoices, ids = sale.ids, rate = sale.rate, maxTotal = sale.maxTotal, amount = sale.amount;

    var request = {
      id: nextId(state, 'sale', 'YCBN-'), buyerTaxCode: buyer.taxCode, invoiceIds: ids.slice(),
      appliedRate: rate, requestedPurchasedAmount: amount, maxPurchasedAmount: maxTotal, submittedAt: nowStamp(), status: 'SUBMITTED',
      expectedDiscount: saleDiscount(sale, state).discount
    };
    invoices.forEach(function (i) { i.status = 'REQUESTED'; });
    state.saleRequests.unshift(request);
    return ok(saleRequestView(state, request));
  });

  route('GET', '/portal/me/rp/sale-requests', function (state) {
    return ok({ items: state.saleRequests.map(function (r) { return saleRequestView(state, r); }) });
  });

  route('GET', '/portal/me/if/suppliers', function (state) {
    return ok({ suppliers: state.suppliers.map(function (s) { return { taxCode: s.taxCode, name: s.name }; }) });
  });

  route('GET', '/portal/me/if/packages', function (state) {
    return ok({ packages: packagesFor(state, 'IF', IF_PACKAGES) });
  });

  route('POST', '/portal/me/if/requests', function (state, req) {
    if (needHddt(state)) return needHddt(state);
    var ids = Array.isArray((req.body || {}).invoiceIds) ? req.body.invoiceIds : [];
    var pack = packagesFor(state, 'IF', IF_PACKAGES).find(function (p) { return p.tenorDays === Number((req.body || {}).tenorDays); });
    if (!pack) return fail(422, 'PACKAGE_INVALID', 'Gói không hợp lệ.');
    var invoices = ids.map(function (id) { return state.invoices.find(function (i) { return i.id === id && i.direction === 'in'; }); });
    if (!ids.length || invoices.some(function (i) { return !i; })) return fail(422, 'INVOICE_NOT_FOUND', 'Không tìm thấy hóa đơn.');
    if (invoices.some(function (i) { return !state.suppliers.some(function (s) { return s.taxCode === i.partyTaxCode; }); })) {
      return fail(422, 'SUPPLIER_NOT_APPROVED', 'Có hóa đơn của nhà cung cấp chưa được chấp thuận.');
    }
    if (invoices.some(function (i) { return i.status !== 'NEW'; })) return fail(422, 'INVOICE_ALREADY_REQUESTED', 'Có hóa đơn đã gửi yêu cầu.');
    if (invoices.some(overAge)) return fail(422, 'INVOICE_TOO_OLD', 'Có hóa đơn đã quá ' + MAX_INVOICE_AGE_DAYS + ' ngày.');
    var total = invoices.reduce(function (sum, i) { return sum + i.amountIncVat; }, 0);
    var request = {
      id: nextId(state, 'ifReq', 'YCIF-'), invoiceIds: ids.slice(), tenorDays: pack.tenorDays, feeRateMilli: pack.feeRateMilli,
      expectedFee: ifFee(total, pack.feeRateMilli), submittedAt: nowStamp(), status: 'SUBMITTED'
    };
    invoices.forEach(function (i) { i.status = 'REQUESTED'; });
    state.ifRequests.unshift(request);
    return ok({ id: request.id, status: request.status, invoiceCount: ids.length, tenorDays: request.tenorDays, feeRateMilli: request.feeRateMilli, expectedFee: request.expectedFee });
  });

  route('GET', '/portal/me/if/requests', function (state) {
    return ok({ items: state.ifRequests.map(function (r) { return ifRequestView(state, r); }) });
  });

  // ---- Payroll Financing: tạo yêu cầu chi lương -> tải bảng lương -> gửi yêu cầu
  function payrollFileView(file) {
    return {
      fileId: file.id, fileName: file.fileName, employeeCount: PAYROLL_SAMPLE.length, totalAmount: file.totalAmount,
      preview: PAYROLL_SAMPLE.slice(0, 5), moreCount: PAYROLL_SAMPLE.length - 5
    };
  }

  route('GET', '/portal/me/pf/packages', function (state) {
    return ok({ packages: packagesFor(state, 'PF', PF_PACKAGES) });
  });

  route('POST', '/portal/me/pf/payroll-files', function (state, req) {
    var name = String((req.body || {}).fileName || '').trim();
    var lower = name.toLowerCase();
    if (!name || !PAYROLL_EXTENSIONS.some(function (ext) { return lower.slice(-ext.length) === ext; })) {
      return fail(422, 'FILE_TYPE_INVALID', 'Bảng lương phải là tệp .xlsx, .xls hoặc .csv.');
    }
    var file = {
      id: nextId(state, 'pfFile', 'BL-'), fileName: name, uploadedAt: nowStamp(), used: false,
      totalAmount: PAYROLL_SAMPLE.reduce(function (sum, row) { return sum + row.amount; }, 0)
    };
    state.payrollFiles.push(file);
    return ok(payrollFileView(file));
  });

  route('POST', '/portal/me/pf/requests', function (state, req) {
    var body = req.body || {};
    var file = state.payrollFiles.find(function (f) { return f.id === body.fileId; });
    if (!file) return fail(422, 'PAYROLL_FILE_NOT_FOUND', 'Chưa có bảng lương.');
    if (file.used) return fail(422, 'PAYROLL_FILE_ALREADY_USED', 'Bảng lương này đã được gửi.');
    var pack = packagesFor(state, 'PF', PF_PACKAGES).find(function (p) { return p.tenorDays === Number(body.tenorDays); });
    if (!pack) return fail(422, 'PACKAGE_INVALID', 'Gói không hợp lệ.');
    if (file.totalAmount > available(state.limits.PF)) {
      return fail(422, 'AMOUNT_OVER_LIMIT', 'Tổng số tiền chi lương vượt quá hạn mức còn lại.', { available: available(state.limits.PF) });
    }
    var request = {
      id: nextId(state, 'pfReq', 'YCPF-'), fileId: file.id, fileName: file.fileName, employeeCount: PAYROLL_SAMPLE.length,
      totalAmount: file.totalAmount, tenorDays: pack.tenorDays, feeRateMilli: pack.feeRateMilli,
      expectedFee: ifFee(file.totalAmount, pack.feeRateMilli), submittedAt: nowStamp(), status: 'SUBMITTED'
    };
    file.used = true;
    state.pfRequests.unshift(request);
    return ok(Object.assign({}, request));
  });

  route('GET', '/portal/me/pf/requests', function (state) {
    return ok({ items: state.pfRequests.map(function (r) { return Object.assign({}, r); }) });
  });

  // ---- B2B nội bộ
  function debitContext(state, loan) {
    var auth = loan.buyerTaxCode ? latestAuth(state, loan.buyerTaxCode) : null;
    var usable = auth && authInEffect(auth.status) ? auth : null;
    var orders = state.debitOrders.filter(function (o) { return o.loanId === loan.id; });
    var blocking = orders.find(function (o) { return o.status === 'PROCESSING' || o.status === 'NO_RESULT'; }) || null;
    var nextLine = loan.schedule.find(function (l) { return l.amount - l.collected > 0; }) || null;
    return { auth: usable, orders: orders, blocking: blocking, nextLine: nextLine };
  }

  route('GET', '/b2b/loans', function (state) {
    return ok({ items: state.loans.filter(function (l) { return l.product === 'RP'; }).map(function (l) { return loanView(state, l); }) });
  }, { pub: true });

  route('GET', '/b2b/loans/{loanId}', function (state, req) {
    var loan = state.loans.find(function (l) { return l.id === req.params.loanId; });
    if (!loan) return fail(404, 'LOAN_NOT_FOUND', 'Không tìm thấy giao dịch.');
    var ctx = debitContext(state, loan);
    var view = loanView(state, loan);
    view.schedule = loan.schedule.map(function (l) { return { dueDate: l.dueDate, invoiceNo: l.invoiceNo || loan.invoiceNo, amount: l.amount, collected: l.collected }; });
    view.authorization = ctx.auth ? authView(state, ctx.auth) : null;
    view.suggestedAmount = ctx.nextLine ? ctx.nextLine.amount - ctx.nextLine.collected : 0;
    view.sendLocked = !!ctx.blocking;
    view.orders = ctx.orders.map(orderView);
    if (!AUTO_DEBIT_ENABLED) { view.authorization = null; view.orders = []; view.sendLocked = false; }
    return ok(view);
  }, { pub: true });

  route('POST', '/b2b/loans/{loanId}/debit-orders', function (state, req) {
    var loan = state.loans.find(function (l) { return l.id === req.params.loanId; });
    if (!loan) return fail(404, 'LOAN_NOT_FOUND', 'Không tìm thấy giao dịch.');
    var ctx = debitContext(state, loan);
    if (!ctx.auth) return fail(409, 'NO_ACTIVE_AUTHORIZATION', 'Chưa có ủy quyền trích nợ đang hiệu lực.');
    if (ctx.blocking) return fail(409, 'ORDER_IN_PROGRESS', 'Đang có lệnh trích nợ chưa xử lý xong hoặc chưa nhận được kết quả.');
    var amount = Number((req.body || {}).amount);
    var note = String((req.body || {}).note || '').trim();
    if (!Number.isInteger(amount) || amount <= 0) return fail(422, 'AMOUNT_INVALID', 'Số tiền phải lớn hơn 0.');
    if (amount > loan.outstanding) return fail(422, 'AMOUNT_OVER_OUTSTANDING', 'Số tiền vượt quá số còn phải thu.', { outstanding: loan.outstanding });
    if (note.length > 100) return fail(422, 'NOTE_TOO_LONG', 'Ghi chú tối đa 100 ký tự.');
    state.seq.order += 1;
    var d = new Date();
    var order = {
      id: 'ADVANCE_' + DEMO_TODAY.replace(/-/g, '') + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds()) + String(state.seq.order).padStart(2, '0'),
      loanId: loan.id, authId: ctx.auth.id, amount: amount, note: note, sentAt: nowStamp(),
      status: 'PROCESSING', plannedResult: state.demo.debitResult, resolveAt: nowMs() + 3000
    };
    state.debitOrders.unshift(order);
    return ok(orderView(order));
  }, { pub: true });

  route('GET', '/b2b/debit-orders/{orderId}/status', function (state, req) {
    var order = state.debitOrders.find(function (o) { return o.id === req.params.orderId; });
    if (!order) return fail(404, 'ORDER_NOT_FOUND', 'Không tìm thấy lệnh trích nợ.');
    if (order.status === 'NO_RESULT') {
      // Tra cứu EPAY: lấy kết quả theo thiết lập demo hiện tại; "Không nhận được kết quả" thì coi như thành công.
      var result = state.demo.debitResult === 'none' ? 'ok' : state.demo.debitResult;
      applyDebitResult(state, order, result);
    }
    return ok(orderView(order));
  }, { pub: true });

  route('GET', '/b2b/debit-auth', function (state) {
    return ok({ items: state.auths.map(function (a) { return authView(state, a); }) });
  }, { pub: true });

  route('GET', '/b2b/debit-auth/cancel-requests', function (state) {
    return ok({ items: state.cancelRequests.map(function (r) { return cancelRequestView(state, r); }) });
  }, { pub: true });

  route('GET', '/b2b/debit-auth/cancel-requests/{id}', function (state, req) {
    var request = state.cancelRequests.find(function (r) { return r.id === req.params.id; });
    if (!request) return fail(404, 'REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu hủy.');
    var view = cancelRequestView(state, request);
    view.outstandingLoans = state.loans.filter(function (l) { return l.buyerTaxCode === request.buyerTaxCode && l.outstanding > 0; })
      .map(function (l) { return { id: l.id, outstanding: l.outstanding, dueDate: nextDue(l), invoiceNo: l.invoiceNo }; });
    return ok(view);
  }, { pub: true });

  function decideCancel(state, id, approve, reason) {
    var request = state.cancelRequests.find(function (r) { return r.id === id; });
    if (!request) return fail(404, 'REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu hủy.');
    if (request.status !== 'PENDING') return fail(409, 'REQUEST_ALREADY_DECIDED', 'Yêu cầu này đã được xử lý.');
    var auth = state.auths.find(function (a) { return a.id === request.authId; });
    if (approve) {
      var result = epay.cancel(auth);
      if (result.errorCode !== '00') return fail(502, 'EPAY_ERROR', 'EPAY chưa hủy được ủy quyền.', { epayCode: result.errorCode });
      request.status = 'APPROVED';
      auth.status = 'CANCELLED';
    } else {
      var text = String(reason || '').trim();
      if (!text) return fail(422, 'REASON_REQUIRED', 'Cần nhập lý do khi từ chối.');
      request.status = 'REJECTED';
      request.rejectReason = text;
      auth.status = 'ACTIVE';
      auth.cancelRejectReason = text;
    }
    request.decidedAt = nowStamp();
    return ok(cancelRequestView(state, request));
  }

  route('POST', '/b2b/debit-auth/cancel-requests/{id}/approve', function (state, req) {
    return decideCancel(state, req.params.id, true);
  }, { pub: true });

  route('POST', '/b2b/debit-auth/cancel-requests/{id}/reject', function (state, req) {
    return decideCancel(state, req.params.id, false, (req.body || {}).reason);
  }, { pub: true });

  // ---- Chỉ dùng cho bảng điều khiển demo
  route('GET', '/demo/state', function (state) {
    return ok({
      today: DEMO_TODAY,
      loggedIn: state.session.loggedIn,
      settings: Object.assign({}, state.demo),
      features: { autoDebit: AUTO_DEBIT_ENABLED },
      pendingCancelRequests: !AUTO_DEBIT_ENABLED ? [] : state.cancelRequests.filter(function (r) { return r.status === 'PENDING'; }).map(function (r) { return cancelRequestView(state, r); }),
      pendingSaleRequests: state.saleRequests.filter(function (r) { return r.status === 'SUBMITTED'; }).map(function (r) { return saleRequestView(state, r); }),
      hints: {
        agreementNo: state.customer.agreementNo, phone: state.customer.phone,
        accounts: state.buyers.filter(function (b) { return b.accountNo; }).map(function (b) {
          return { buyerName: b.name, bankName: (bankBy(b.bankCode) || {}).short, accountNo: b.accountNo };
        })
      }
    });
  }, { pub: true });

  route('PUT', '/demo/settings', function (state, req) {
    var body = req.body || {};
    if (['ok', '18', '19', '20', '24', '99'].indexOf(body.registerResult) >= 0) state.demo.registerResult = body.registerResult;
    if ([120, 15].indexOf(Number(body.otpSeconds)) >= 0) state.demo.otpSeconds = Number(body.otpSeconds);
    if (['ok', 'balance', 'limit', 'none'].indexOf(body.debitResult) >= 0) state.demo.debitResult = body.debitResult;
    return ok(Object.assign({}, state.demo));
  }, { pub: true });

  route('POST', '/demo/sale-requests/{id}/approve', function (state, req) {
    var request = state.saleRequests.find(function (r) { return r.id === req.params.id; });
    if (!request || request.status !== 'SUBMITTED') return fail(409, 'REQUEST_ALREADY_DECIDED', 'Yêu cầu đã được xử lý.');
    request.status = 'APPROVED';
    state.invoices.forEach(function (i) { if (request.invoiceIds.indexOf(i.id) >= 0) i.status = 'SOLD'; });
    state.limits.RP.used += request.requestedPurchasedAmount;
    createRpLoan(state, request);
    return ok(saleRequestView(state, request));
  }, { pub: true });

  route('POST', '/demo/sale-requests/{id}/reject', function (state, req) {
    var request = state.saleRequests.find(function (r) { return r.id === req.params.id; });
    if (!request || request.status !== 'SUBMITTED') return fail(409, 'REQUEST_ALREADY_DECIDED', 'Yêu cầu đã được xử lý.');
    request.status = 'REJECTED';
    state.invoices.forEach(function (i) { if (request.invoiceIds.indexOf(i.id) >= 0) i.status = 'UNSOLD'; });
    return ok(saleRequestView(state, request));
  }, { pub: true });

  /* ------------------------------------------------------------------ cổng vào */
  function handle(method, path, body) {
    var parts = String(path).split('?');
    var pathname = parts[0];
    var query = {};
    (parts[1] || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });

    if (!AUTO_DEBIT_ENABLED && /\/debit-auth|\/debit-orders/.test(pathname)) {
      return fail(404, 'FEATURE_DISABLED', 'Chức năng trích nợ tự động đang tắt.');
    }

    if (method === 'POST' && pathname === '/demo/reset') {
      save(seed());
      return ok({});
    }

    var state = load();
    var before = JSON.stringify(state);
    settleOrders(state);
    var response = fail(404, 'NOT_FOUND', 'Endpoint không tồn tại: ' + method + ' ' + pathname);
    for (var i = 0; i < routes.length; i += 1) {
      var r = routes[i];
      if (r.method !== method) continue;
      var match = r.regex.exec(pathname);
      if (!match) continue;
      if (!r.pub && pathname.indexOf('/portal/') === 0 && !state.session.loggedIn) {
        response = fail(401, 'UNAUTHENTICATED', 'Chưa đăng nhập.');
        break;
      }
      var params = {};
      r.names.forEach(function (name, index) { params[name] = decodeURIComponent(match[index + 1]); });
      response = r.handler(state, { params: params, query: query, body: body });
      break;
    }
    if (JSON.stringify(state) !== before) save(state);
    return response;
  }

  /* Nhịp chạy nền: chốt lệnh trích nợ đã tới hạn trả kết quả. Trả về true nếu có thay đổi. */
  function tick() {
    var state = load();
    if (settleOrders(state)) { save(state); return true; }
    return false;
  }

  root.MockServer = {
    handle: handle,
    tick: tick,
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    setAutoDebit: function (enabled) { AUTO_DEBIT_ENABLED = !!enabled; },
    DEMO_TODAY: DEMO_TODAY
  };
})(typeof window !== 'undefined' ? window : globalThis);
