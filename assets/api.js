/*
 * Lớp API duy nhất của prototype. Giao diện chỉ gọi các hàm trong `api`.
 * Khi nối API thật: thay hàm `transport` bằng fetch tới backend, giữ nguyên tên endpoint và payload (spec §5).
 */
(function (root) {
  'use strict';

  function ApiError(status, body) {
    this.name = 'ApiError';
    this.status = status;
    this.code = (body && body.code) || 'UNKNOWN';
    this.message = (body && body.message) || 'Lỗi không xác định';
    this.data = body || {};
  }
  ApiError.prototype = Object.create(Error.prototype);

  var LATENCY_MS = 350;
  var SLOW = { 'POST /portal/me/rp/debit-auth': 1200, 'POST /portal/me/pf/payroll-files': 1000, 'POST /portal/me/rp/sale-requests/quote': 150, 'POST /portal/me/hddt/connect': 1800 };

  /* Mock transport. Bản thật: return fetch(BASE_URL + path, { method, headers, body: JSON.stringify(body) }) ... */
  function transport(method, path, body) {
    var delay = SLOW[method + ' ' + path.split('?')[0]] || (method === 'GET' ? 180 : LATENCY_MS);
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        var response = root.MockServer.handle(method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
        if (response.status >= 200 && response.status < 300) resolve(response.data);
        else reject(new ApiError(response.status, response.data));
      }, api.latency === 0 ? 0 : delay);
    });
  }

  function query(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }
  var enc = encodeURIComponent;

  var api = {
    latency: null,
    ApiError: ApiError,

    /* ---------- Cổng -> B2B ---------- */
    login: function (email, taxCode) { return transport('POST', '/portal/auth/login', { email: email, taxCode: taxCode }); },
    confirmLoginOtp: function (otp) { return transport('POST', '/portal/auth/login/otp', { otp: otp }); },
    resendLoginOtp: function () { return transport('POST', '/portal/auth/login/otp/resend'); },
    logout: function () { return transport('POST', '/portal/auth/logout'); },
    getMe: function () { return transport('GET', '/portal/me'); },
    getOverview: function () { return transport('GET', '/portal/me/overview'); },
    getBuyers: function () { return transport('GET', '/portal/me/rp/buyers'); },
    verifyDebitAuth: function (form) {
      return transport('POST', '/portal/me/rp/debit-auth/verify', {
        buyerTaxCode: form.buyerTaxCode, agreementNo: form.agreementNo, bankCode: form.bankCode, accountNo: form.accountNo, phone: form.phone
      });
    },
    registerDebitAuth: function (form) { return transport('POST', '/portal/me/rp/debit-auth', form); },
    confirmDebitAuthOtp: function (authId, otp) { return transport('POST', '/portal/me/rp/debit-auth/' + enc(authId) + '/otp', { otp: otp }); },
    resendDebitAuthOtp: function (authId) { return transport('POST', '/portal/me/rp/debit-auth/' + enc(authId) + '/otp/resend'); },
    requestDebitAuthCancel: function (authId, reason) {
      return transport('POST', '/portal/me/rp/debit-auth/' + enc(authId) + '/cancel-requests', reason ? { reason: reason } : {});
    },
    getInvoices: function (params) { return transport('GET', '/portal/me/invoices' + query(params)); },
    quoteSaleRequest: function (payload) { return transport('POST', '/portal/me/rp/sale-requests/quote', payload); },
    createSaleRequest: function (payload) { return transport('POST', '/portal/me/rp/sale-requests', payload); },
    getSaleRequests: function () { return transport('GET', '/portal/me/rp/sale-requests'); },
    getIfSuppliers: function () { return transport('GET', '/portal/me/if/suppliers'); },
    getHddt: function () { return transport('GET', '/portal/me/hddt'); },
    connectHddt: function (username, password) { return transport('POST', '/portal/me/hddt/connect', { username: username, password: password }); },
    disconnectHddt: function () { return transport('POST', '/portal/me/hddt/disconnect'); },
    getPfPackages: function () { return transport('GET', '/portal/me/pf/packages'); },
    uploadPayrollFile: function (file) { return transport('POST', '/portal/me/pf/payroll-files', { fileName: file.fileName, fileSize: file.fileSize }); },
    createPfRequest: function (fileId, tenorDays) { return transport('POST', '/portal/me/pf/requests', { fileId: fileId, tenorDays: tenorDays }); },
    getPfRequests: function () { return transport('GET', '/portal/me/pf/requests'); },
    getIfRequests: function () { return transport('GET', '/portal/me/if/requests'); },
    getIfPackages: function () { return transport('GET', '/portal/me/if/packages'); },
    createIfRequest: function (invoiceIds, tenorDays) { return transport('POST', '/portal/me/if/requests', { invoiceIds: invoiceIds, tenorDays: tenorDays }); },

    /* ---------- B2B nội bộ ---------- */
    b2b: {
      getLoans: function () { return transport('GET', '/b2b/loans'); },
      getLoan: function (loanId) { return transport('GET', '/b2b/loans/' + enc(loanId)); },
      sendDebitOrder: function (loanId, amount, note) { return transport('POST', '/b2b/loans/' + enc(loanId) + '/debit-orders', { amount: amount, note: note }); },
      checkDebitOrderStatus: function (orderId) { return transport('GET', '/b2b/debit-orders/' + enc(orderId) + '/status'); },
      getAuthorizations: function () { return transport('GET', '/b2b/debit-auth'); },
      getCancelRequests: function () { return transport('GET', '/b2b/debit-auth/cancel-requests'); },
      getCancelRequest: function (id) { return transport('GET', '/b2b/debit-auth/cancel-requests/' + enc(id)); },
      approveCancelRequest: function (id) { return transport('POST', '/b2b/debit-auth/cancel-requests/' + enc(id) + '/approve'); },
      rejectCancelRequest: function (id, reason) { return transport('POST', '/b2b/debit-auth/cancel-requests/' + enc(id) + '/reject', { reason: reason }); }
    },

    /* ---------- Chỉ dùng cho bảng điều khiển demo (không có ở bản thật) ---------- */
    demo: {
      getState: function () { return transport('GET', '/demo/state'); },
      updateSettings: function (settings) { return transport('PUT', '/demo/settings', settings); },
      reset: function () { return transport('POST', '/demo/reset'); },
      approveSaleRequest: function (id) { return transport('POST', '/demo/sale-requests/' + enc(id) + '/approve'); },
      rejectSaleRequest: function (id) { return transport('POST', '/demo/sale-requests/' + enc(id) + '/reject'); }
    },

    /* Dữ liệu đổi ở tab khác hoặc có kết quả lệnh trích nợ mới. Bản thật: thay bằng polling / websocket. */
    onChange: function (listener) { return root.MockServer.subscribe(listener); },
    startBackgroundSync: function () { return setInterval(function () { root.MockServer.tick(); }, 1000); }
  };

  root.api = api;
})(typeof window !== 'undefined' ? window : globalThis);
