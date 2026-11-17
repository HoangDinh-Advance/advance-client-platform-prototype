/* Phần 1: Client platform (tiếng Việt). Mỗi màn là một view: load() gọi api, render() trả HTML, actions xử lý sự kiện. */
(function () {
  'use strict';

  var App = window.App;
  var api = window.api;
  var html = App.html;
  var fmt = App.fmt;
  var vn = fmt.vn;

  var PRODUCT = { PF: 'Tài trợ lương', IF: 'Tài trợ hóa đơn', RP: 'Mua bán nợ' };
  var INVOICE_STATUS = {
    UNSOLD: { label: 'Chưa bán', cls: '' },
    REQUESTED: { label: 'Đang chờ duyệt', cls: 'tag-warn' },
    SOLD: { label: 'Đã bán', cls: 'tag-sold' }
  };
  var SALE_REQUEST_STATUS = {
    SUBMITTED: { label: 'Đã gửi, chờ Advance xem xét', cls: 'tag-warn' },
    APPROVED: { label: 'Đã duyệt', cls: 'tag-ok' },
    REJECTED: { label: 'Từ chối', cls: 'tag-danger' }
  };
  var DEFAULT_FROM = '2026-07-01';

  function loadingCard() { return html`<div class="card loading">Đang tải…</div>`; }
  function checkIcon() {
    return html`<div class="success-mark"><svg width="31" height="31" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></div>`;
  }
  // (3) = (1) x (2), làm tròn nửa lên đến đồng, theo từng hóa đơn.
  function maxPurchase(amountExVat, ratePercent) { return Math.floor((amountExVat * ratePercent + 50) / 100); }
  function accountText(account) { return account ? account.bankName + ' · ' + account.accountNo : '(chưa có)'; }

  /* ================================================================== S1. Đăng nhập */
  // Bước 1: email + MST. Bước 2: mã OTP gửi tới email đó (bản demo điền sẵn 123456, không gửi email thật).
  var loginTimer = null;
  function stopLoginTimer() { if (loginTimer) { clearInterval(loginTimer); loginTimer = null; } }
  function loginRemaining(otp) { return Math.max(0, Math.ceil((otp.deadline - Date.now()) / 1000)); }
  function loginClock(remaining) { return String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0'); }
  function setLoginOtp(view, result, info) {
    view.state.step = 'otp';
    view.state.busy = false;
    view.state.error = '';
    view.state.otp = {
      length: result.otp.length, triesLeft: result.otp.triesLeft, emailMasked: result.otp.emailMasked,
      deadline: Date.now() + result.otp.expiresInSeconds * 1000, info: info || ''
    };
  }

  var login = App.views['dang-nhap'] = {
    mode: 'login',
    state: { step: 'form', error: '', busy: false, otp: null },
    enter: function () { stopLoginTimer(); this.state = { step: 'form', error: '', busy: false, otp: null }; },
    leave: function () { stopLoginTimer(); },
    afterPaint: function () {
      var st = this.state;
      if (st.step !== 'otp' || !st.otp) { stopLoginTimer(); return; }
      if (loginTimer) return;
      loginTimer = setInterval(function () {
        if (App.view !== login || login.state.step !== 'otp' || !login.state.otp) { stopLoginTimer(); return; }
        var remaining = loginRemaining(login.state.otp);
        var count = document.getElementById('login-otp-count');
        if (count) count.textContent = loginClock(remaining);
        var expiredNow = remaining === 0;
        var running = document.getElementById('login-otp-running');
        if (running && running.hidden !== expiredNow) App.paint();
      }, 500);
    },
    render: function () {
      var st = this.state;
      if (st.step === 'otp') {
        var otp = st.otp;
        var remaining = loginRemaining(otp);
        var expired = remaining === 0;
        return html`<div class="card login-card">
          <h1>Xác thực OTP</h1>
          <form data-submit="login-otp" novalidate autocomplete="off">
            <p class="login-lead">Mã OTP gồm ${otp.length} số đã được gửi tới email ${otp.emailMasked}.</p>
            <div class="field">
              <label class="field-label" for="login-otp">Mã OTP</label>
              <input class="input input-otp" id="login-otp" data-keep="otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${otp.length}" value="123456" ${st.busy ? App.raw('disabled') : ''}>
            </div>
            <div class="otp-meta login-otp-meta">
              <span id="login-otp-running" ${expired ? App.raw('hidden') : ''}>Mã hết hạn sau <strong id="login-otp-count">${loginClock(remaining)}</strong></span>
              <span class="expired" ${expired ? '' : App.raw('hidden')}>Mã OTP đã hết hạn.</span>
              <span>Còn <strong>${otp.triesLeft}</strong> lần nhập</span>
            </div>
            <p class="form-message" role="alert">${st.error}</p>
            <p class="form-info" role="status">${otp.info}</p>
            <button type="submit" class="btn btn-primary btn-block" ${st.busy || expired ? App.raw('disabled') : ''}>${st.busy ? 'Đang xác thực…' : 'Xác nhận'}</button>
          </form>
          <div class="login-links">
            <button type="button" class="text-button" data-act="login-resend" ${st.busy ? App.raw('disabled') : ''}>Gửi lại mã</button>
            <button type="button" class="text-button" data-act="login-back" ${st.busy ? App.raw('disabled') : ''}>Quay lại</button>
          </div>
        </div>`;
      }
      return html`<div class="card login-card">
        <h1>Đăng nhập</h1>
        <form data-submit="login" novalidate autocomplete="off">
          <div class="field">
            <label class="field-label" for="login-email">Email</label>
            <input class="input" id="login-email" data-keep="1" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" value="ketoan.mauanphuc@gmail.com" ${st.busy ? App.raw('disabled') : ''}>
          </div>
          <div class="field">
            <label class="field-label" for="login-tax">Mã số thuế</label>
            <input class="input" id="login-tax" data-keep="1" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" value="0100000001" ${st.busy ? App.raw('disabled') : ''}>
          </div>
          <p class="form-message" role="alert">${st.error}</p>
          <button type="submit" class="btn btn-primary btn-block" ${st.busy ? App.raw('disabled') : ''}>${st.busy ? 'Đang gửi mã OTP…' : 'Tiếp tục'}</button>
        </form>
      </div>`;
    },
    actions: {
      login: function () {
        var email = document.getElementById('login-email').value;
        var taxCode = document.getElementById('login-tax').value;
        login.state.busy = true;
        login.state.error = '';
        App.paint();
        api.login(email, taxCode).then(function (result) {
          setLoginOtp(login, result, '');
          App.paint();
          var el = document.getElementById('login-otp');
          if (el) el.focus();
        }).catch(function (error) {
          login.state.busy = false;
          login.state.error = error.code === 'INVALID_CREDENTIALS' ? 'Email hoặc mã số thuế không đúng' : error.message;
          App.paint();
        });
      },
      'login-otp': function () {
        var st = login.state;
        var code = fmt.digits(document.getElementById('login-otp').value);
        if (code.length !== st.otp.length) {
          st.error = 'Vui lòng nhập đủ ' + st.otp.length + ' số của mã OTP.';
          st.otp.info = '';
          App.paint();
          return;
        }
        st.busy = true;
        st.error = '';
        st.otp.info = '';
        App.paint();
        api.confirmLoginOtp(code).then(function (me) {
          stopLoginTimer();
          App.me = me;
          App.go('tong-quan');
        }).catch(function (error) {
          st.busy = false;
          if (error.code === 'OTP_INVALID') {
            st.otp.triesLeft = error.data.triesLeft;
            st.error = 'Mã OTP không đúng.';
          } else if (error.code === 'OTP_EXPIRED') {
            st.error = 'Mã OTP đã hết hạn. Vui lòng bấm Gửi lại mã.';
          } else if (error.code === 'OTP_LOCKED' || error.code === 'LOGIN_NOT_STARTED') {
            stopLoginTimer();
            login.state = { step: 'form', busy: false, otp: null,
              error: error.code === 'OTP_LOCKED' ? 'Nhập sai OTP quá 3 lần. Vui lòng đăng nhập lại.' : 'Vui lòng đăng nhập lại.' };
          } else {
            st.error = error.message;
          }
          App.paint();
        });
      },
      'login-resend': function () {
        var st = login.state;
        st.busy = true;
        st.error = '';
        App.paint();
        api.resendLoginOtp().then(function (result) {
          setLoginOtp(login, result, 'Đã gửi lại mã OTP.');
          App.paint();
        }).catch(function (error) {
          st.busy = false;
          st.error = error.code === 'OTP_SEND_LIMIT' ? 'Đã quá số lần gửi OTP (tối đa 5 lần).' : error.message;
          App.paint();
        });
      },
      'login-back': function () { stopLoginTimer(); login.state = { step: 'form', error: '', busy: false, otp: null }; App.paint(); }
    }
  };

  /* ================================================================== S2. Tổng quan */
  var overview = App.views['tong-quan'] = {
    mode: 'portal', nav: 'tong-quan',
    state: { tab: 'due' },
    reset: function () { this.state = { tab: 'due' }; },
    load: function () { return api.getOverview(); },
    actions: {
      'ov-tab': function (el) { overview.state.tab = el.getAttribute('data-tab'); App.paint(); }
    },
    render: function () {
      var d = this.data;
      var tab = this.state.tab;
      if (!d) return html`<div class="page-head"><h1>Tổng quan</h1></div>${loadingCard()}`;

      var cards = d.limits.map(function (limit) {
        var pct = limit.granted > 0 ? Math.min(100, Math.round(limit.used / limit.granted * 100)) : 0;
        return html`<div class="metric">
          <div class="metric-label">${PRODUCT[limit.product]}</div>
          <div class="metric-caption">Hạn mức còn lại</div>
          <div class="metric-value">${vn(limit.available)} <small>VND</small></div>
          <div class="progress" role="img" aria-label="Đã dùng ${vn(limit.used)} / ${vn(limit.granted)} VND"><span style="width: ${pct}%"></span></div>
          <dl class="limit-facts">
            <div><dt>Đã dùng</dt><dd>${vn(limit.used)}</dd></div>
            <div><dt>Hạn mức được cấp</dt><dd>${vn(limit.granted)}</dd></div>
          </dl>
        </div>`;
      });

      // Bên thanh toán + hóa đơn: Mua bán nợ là Bên thanh toán của hóa đơn, các sản phẩm khác là chính khách hàng.
      function party(r) { return r.payer === 'BUYER' ? r.buyerName + ' · ' + r.invoiceNo : 'Quý khách'; }

      var table;
      if (tab === 'paid') {
        var paidRows = d.paid.map(function (r) {
          return html`<tr>
            <td class="mono strong nowrap">${r.loanId}</td>
            <td><span class="tag tag-product">${PRODUCT[r.product]}</span></td>
            <td>${party(r)}</td>
            <td class="mono nowrap">${fmt.vnDate(r.dueDate)}</td>
            <td class="mono nowrap">${fmt.vnDate(r.paidDate)}</td>
            <td class="num">${vn(r.financedAmount)}</td>
            <td class="num strong">${vn(r.paidAmount)}</td>
          </tr>`;
        });
        table = html`<table class="data-table wrap-head" style="min-width: 760px">
          <thead><tr>
            <th>Mã giao dịch</th><th>Sản phẩm</th><th>Bên thanh toán / Hóa đơn</th><th>Ngày đến hạn</th><th>Ngày thanh toán</th>
            <th class="num">Số tiền tài trợ (VND)</th><th class="num">Số tiền đã trả (VND)</th>
          </tr></thead>
          <tbody>${paidRows.length ? paidRows : html`<tr><td colspan="7" class="empty-rows">Chưa có khoản nào đã thanh toán.</td></tr>`}</tbody>
        </table>`;
      } else {
        var DUE = {
          OVERDUE: { cls: 'is-overdue', tag: 'tag-danger', label: 'Trễ hạn' },
          TODAY: { cls: 'is-due-today', tag: 'tag-warn', label: 'Đến hạn hôm nay' },
          THIS_WEEK: { cls: 'is-due-week', tag: '', label: 'Trong tuần' }
        };
        var dueRows = d.schedule.slice().sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0; }).map(function (r) {
          var due = DUE[r.dueStatus];
          return html`<tr class="${due ? due.cls : ''}">
            <td class="mono strong nowrap">${r.loanId}</td>
            <td><span class="tag tag-product">${PRODUCT[r.product]}</span></td>
            <td>${party(r)}</td>
            <td class="mono nowrap">${fmt.vnDate(r.dueDate)}${due && html` <span class="tag ${due.tag}">${due.label}</span>`}</td>
            <td class="num ${r.dpd > 0 ? 'overdue' : ''}">${r.dpd}</td>
            <td class="num">${vn(r.financedAmount)}</td>
            <td class="num">${vn(r.paidAmount)}</td>
            <td class="num strong">${vn(r.amountDue)}</td>
          </tr>`;
        });
        table = html`<table class="data-table wrap-head" style="min-width: 820px">
          <thead><tr>
            <th>Mã giao dịch</th><th>Sản phẩm</th><th>Bên thanh toán / Hóa đơn</th>
            <th>Ngày đến hạn</th><th class="num">Số ngày quá hạn</th>
            <th class="num">Số tiền tài trợ (VND)</th><th class="num">Số tiền đã trả (VND)</th><th class="num">Số tiền đến hạn còn lại (VND)</th>
          </tr></thead>
          <tbody>${dueRows.length ? dueRows : html`<tr><td colspan="8" class="empty-rows">Không có khoản nào đến hạn.</td></tr>`}</tbody>
        </table>`;
      }

      var PAY_TITLE = { PRINCIPAL: 'Khoản thanh toán gốc', FEE: 'Phí dịch vụ' };
      return html`<div class="page-head"><h1>Tổng quan</h1></div>
        <section class="limit-grid" aria-label="Hạn mức theo sản phẩm">${cards}</section>
        <section class="card" aria-label="Lịch thanh toán">
          <div class="sale-tabs" role="tablist" aria-label="Lịch thanh toán">
            <button type="button" role="tab" class="sale-tab" data-act="ov-tab" data-tab="due" aria-selected="${tab === 'due' ? 'true' : 'false'}">Lịch thanh toán<span>${d.schedule.length}</span></button>
            <button type="button" role="tab" class="sale-tab" data-act="ov-tab" data-tab="paid" aria-selected="${tab === 'paid' ? 'true' : 'false'}">Đã thanh toán<span>${d.paid.length}</span></button>
          </div>
          <div class="table-wrap" id="schedule-wrap">${table}</div>
        </section>
        <section class="card card-pad" aria-labelledby="payinfo-title">
          <h2 class="card-title" id="payinfo-title">Thông tin thanh toán</h2>
          <div class="pay-grid">
            ${d.paymentAccounts.map(function (pay) {
              return html`<div class="box">
                <div class="box-title">${PAY_TITLE[pay.purpose]}</div>
                <dl class="facts">
                  <div><dt>Tên tài khoản</dt><dd>${pay.accountName}</dd></div>
                  <div><dt>Ngân hàng</dt><dd>${pay.bankName}</dd></div>
                  <div><dt>Số tài khoản</dt><dd class="mono">${pay.accountNo}</dd></div>
                  <div><dt>Nội dung chuyển khoản</dt><dd class="mono">${pay.transferContent}</dd></div>
                </dl>
              </div>`;
            })}
          </div>
        </section>`;
    }
  };

  /* ================================================================== S3. Mua bán nợ (S3.0 chọn luồng + S3.1 bán hóa đơn) */
  function freshRp() {
    return { tab: 'all', buyer: '', q: '', from: DEFAULT_FROM, to: '', selected: {}, sale: null };
  }

  var rp = App.views['mua-ban-no'] = {
    mode: 'portal', nav: 'mua-ban-no',
    state: freshRp(),
    reset: function () { this.state = freshRp(); },
    enter: function (params) {
      this.state.sale = null;
      if (params.buyer) {
        this.state.buyer = params.buyer;
        this.state.tab = 'all';
        this.state.q = '';
        this.state.selected = {};
      }
    },
    load: function () {
      var st = this.state;
      return Promise.all([
        api.getBuyers(),
        api.getInvoices({ direction: 'out', from: st.from, to: st.to, buyer: st.buyer }),
        api.getSaleRequests()
      ]).then(function (r) { return { rp: r[0], invoices: r[1].items, requests: r[2].items }; });
    },
    onData: function () {
      var st = this.state;
      var d = this.data;
      var byId = {};
      d.invoices.forEach(function (i) { byId[i.id] = i; });
      // Hóa đơn đã chọn nhưng không còn chọn được (vừa gửi, bị khóa, ra khỏi bộ lọc) thì bỏ chọn.
      Object.keys(st.selected).forEach(function (id) {
        var invoice = byId[id];
        if (!invoice || baseLock(invoice, d)) delete st.selected[id];
      });
      if (!App.uiPrefs().rpEntered && !hasUnregistered(d)) App.setUiPref('rpEntered', true);
    },
    hasBar: function () { return this.data && !showChooser(this.data) && selectedInvoices().length > 0; },
    render: function () {
      var d = this.data;
      if (!d) return html`<div class="page-head"><h1>Mua bán nợ</h1></div>${loadingCard()}`;
      if (showChooser(d)) return chooserHtml();
      return html`<div class="page-head"><h1>Mua bán nợ</h1></div>
        ${whitelistHtml(d)}
        ${invoicesHtml(d)}
        ${historyHtml(d)}`;
    },
    renderBar: function () {
      var d = this.data;
      if (!d || showChooser(d)) return '';
      var items = selectedInvoices();
      if (!items.length) return '';
      var buyer = buyerOf(d, items[0].partyTaxCode);
      var total = items.reduce(function (sum, i) { return sum + maxPurchase(i.amountExVat, buyer.rate); }, 0);
      return html`<section class="selection-bar" aria-label="Hóa đơn đã chọn">
        <div class="sel-info">
          <strong>Đã chọn ${items.length} hóa đơn</strong> · ${buyer.name}
          <button type="button" class="text-button" data-act="rp-clear" style="margin-left: 0.6rem">Bỏ chọn</button>
        </div>
        <div class="sel-right">
          <div class="sel-total"><span>Tổng (3) Giá Mua nợ tối đa</span><strong>${vn(total)} <small>VND</small></strong></div>
          <button type="button" class="btn btn-primary" data-act="rp-sell">Bán hóa đơn</button>
        </div>
      </section>`;
    },
    actions: {
      'rp-choose-register': function () {
        App.setUiPref('rpEntered', true);
        App.go('dang-ky-trich-no');
      },
      'rp-choose-skip': function () {
        App.setUiPref('rpEntered', true);
        App.paint();
      },
      'rp-register': function (el) { App.go('dang-ky-trich-no', { buyer: el.getAttribute('data-buyer') }); },
      'rp-cancel-auth': function (el) { App.go('huy-uy-quyen', { buyer: el.getAttribute('data-buyer') }); },
      'rp-tab': function (el) { rp.state.tab = el.getAttribute('data-tab'); App.paint(); },
      'rp-search': function (el) { rp.state.q = el.value; App.paint(); },
      'rp-filter': function (el) {
        rp.state[el.getAttribute('data-key')] = el.value;
        rp.state.selected = {};
        App.paint();
        App.refresh();
      },
      'rp-toggle': function (el) {
        var id = el.getAttribute('data-id');
        if (el.checked) rp.state.selected[id] = true; else delete rp.state.selected[id];
        App.paint();
      },
      'rp-locked': function (el, event) {
        if (event.target.tagName === 'INPUT' && !event.target.disabled) return;
        var reason = el.getAttribute('data-reason');
        if (reason) App.toast(reason);
      },
      'rp-clear': function () { rp.state.selected = {}; App.paint(); },
      'rp-sell': function () { openSale(); },
      'sale-amount': function (el) {
        var sale = rp.state.sale;
        App.formatMoneyInput(el, '.');
        sale.amount = fmt.money(el.value);
        sale.error = saleAmountError(sale);
        sale.serverError = '';
        var err = document.getElementById('sale-amount-err');
        err.textContent = sale.error;
        err.hidden = !sale.error;
        el.setAttribute('aria-invalid', sale.error ? 'true' : 'false');
        document.getElementById('sale-after').textContent = sale.error ? '—' : vn(sale.available - sale.amount) + ' VND';
        document.getElementById('sale-next').disabled = !!sale.error;
      },
      'sale-next': function () {
        var sale = rp.state.sale;
        sale.error = saleAmountError(sale);
        if (!sale.error) sale.step = 'confirm';
        App.paintDialog();
      },
      'sale-back': function () { rp.state.sale.step = 'detail'; rp.state.sale.serverError = ''; App.paintDialog(); },
      'sale-send': function () {
        var sale = rp.state.sale;
        sale.sending = true;
        sale.serverError = '';
        App.paintDialog();
        api.createSaleRequest({
          buyerTaxCode: sale.buyer.taxCode,
          invoiceIds: sale.rows.map(function (r) { return r.id; }),
          appliedRate: sale.rate,
          requestedPurchasedAmount: sale.amount
        }).then(function (result) {
          sale.sending = false;
          sale.step = 'done';
          sale.result = result;
          rp.state.selected = {};
          App.paintDialog();
          App.refresh();
        }).catch(function (error) {
          sale.sending = false;
          sale.serverError = SALE_ERRORS[error.code] || error.message;
          App.paintDialog();
          App.refresh();
        });
      },
      'sale-close': function () { rp.state.sale = null; App.closeDialog(); }
    }
  };

  var SALE_ERRORS = {
    INVOICE_NOT_UNSOLD: 'Có hóa đơn đã bán hoặc đang chờ duyệt. Vui lòng đóng cửa sổ và chọn lại hóa đơn.',
    INVOICE_TOO_OLD: 'Có hóa đơn đã quá 90 ngày kể từ ngày hóa đơn. Vui lòng đóng cửa sổ và chọn lại hóa đơn.',
    RATE_MISMATCH: 'Tỷ lệ mua nợ của Bên thanh toán đã thay đổi. Vui lòng đóng cửa sổ và chọn lại hóa đơn.',
    AUTH_CANCEL_PENDING: 'Bên thanh toán đang chờ Advance duyệt hủy ủy quyền trích nợ.',
    AMOUNT_OVER_MAX: 'Giá Mua nợ đề nghị vượt quá tổng (3) Giá Mua nợ tối đa.',
    AMOUNT_OVER_LIMIT: 'Giá Mua nợ đề nghị vượt quá hạn mức Mua bán nợ còn lại.'
  };

  function hasUnregistered(d) { return d.rp.buyers.some(function (b) { return b.authStatus === 'NONE'; }); }
  function showChooser(d) { return App.autoDebit() && !App.uiPrefs().rpEntered && hasUnregistered(d); }
  function buyerOf(d, taxCode) { return d.rp.buyers.find(function (b) { return b.taxCode === taxCode; }) || null; }
  function selectedInvoices() {
    var d = rp.data;
    if (!d) return [];
    return d.invoices.filter(function (i) { return rp.state.selected[i.id]; });
  }
  /* Lý do không chọn được, chưa tính quy tắc "một Bên thanh toán". */
  var OVER_AGE_TEXT = 'Hóa đơn đã quá 90 ngày kể từ ngày hóa đơn';
  function baseLock(invoice, d) {
    var buyer = buyerOf(d, invoice.partyTaxCode);
    if (!buyer) return { text: 'Bên mua chưa nằm trong danh sách được chấp nhận', show: true };
    if (invoice.status === 'SOLD') return { text: 'Hóa đơn đã bán', show: false };
    if (invoice.status === 'REQUESTED') return { text: 'Hóa đơn đang chờ duyệt', show: false };
    if (invoice.overAge) return { text: OVER_AGE_TEXT, show: true };
    if (buyer.authStatus === 'CANCEL_PENDING') return { text: 'Bên thanh toán đang chờ Advance duyệt hủy ủy quyền trích nợ', show: true };
    return null;
  }

  function chooserHtml() {
    return html`<div class="page-head"><h1>Mua bán nợ</h1></div>
      <div class="choice-grid">
        <section class="card choice" aria-labelledby="choice-register">
          <h2 id="choice-register">Đăng ký trích nợ tự động</h2>
          <div class="rate">Tỷ lệ mua nợ <strong>90%</strong> cho Bên thanh toán đã đăng ký.</div>
          <p>Advance được trích Tài khoản Giao dịch của Bên thanh toán đó khi đến hạn.</p>
          <button type="button" class="btn btn-primary" data-act="rp-choose-register">Đăng ký ngay</button>
        </section>
        <section class="card choice choice-plain" aria-labelledby="choice-skip">
          <h2 id="choice-skip">Bán nợ không đăng ký</h2>
          <div class="rate">Tỷ lệ mua nợ <strong>80%</strong></div>
          <button type="button" class="btn btn-outline" data-act="rp-choose-skip">Tiếp tục</button>
        </section>
      </div>`;
  }

  function whitelistHtml(d) {
    // Không có trích nợ tự động: chỉ còn danh sách và tỷ lệ mua nợ.
    if (!App.autoDebit()) {
      return html`<section class="card" aria-labelledby="whitelist-title">
        <div class="card-head"><h2 id="whitelist-title">Danh sách Bên thanh toán được chấp nhận</h2></div>
        <div class="table-wrap" id="whitelist-wrap">
          <table class="data-table" style="min-width: 520px">
            <thead><tr><th>Bên thanh toán</th><th>MST</th><th class="num">(2) Tỷ lệ mua nợ</th></tr></thead>
            <tbody>${d.rp.buyers.map(function (b) {
              return html`<tr><td><div class="cell-main">${b.name}</div></td><td class="mono">${b.taxCode}</td><td class="num strong">${b.rate}%</td></tr>`;
            })}</tbody>
          </table>
        </div>
      </section>`;
    }
    var rows = d.rp.buyers.map(function (b) {
      var action = '';
      if (b.authStatus === 'NONE' || b.authStatus === 'PENDING_OTP') {
        action = html`<button type="button" class="btn btn-outline btn-sm" data-act="rp-register" data-buyer="${b.taxCode}">Đăng ký trích nợ</button>`;
      } else if (b.authStatus === 'ACTIVE') {
        action = html`<button type="button" class="btn btn-danger-outline btn-sm" data-act="rp-cancel-auth" data-buyer="${b.taxCode}">Hủy ủy quyền</button>`;
      } else if (b.authStatus === 'NOT_ELIGIBLE') {
        action = html`<span class="secondary" style="font-size: 12px">Tài khoản Giao dịch chưa mở</span>`;
      } else if (b.authStatus === 'CANCEL_PENDING') {
        action = html`<span style="color: var(--warn)">Chờ Advance duyệt hủy</span>`;
      }
      return html`<tr>
        <td><div class="cell-main">${b.name}</div></td>
        <td class="mono">${b.taxCode}</td>
        <td class="mono">${accountText(b.transactionAccount)}</td>
        <td>${App.authTag(b.authStatus)}${b.cancelRejectReason && html`<span class="reason">Advance từ chối yêu cầu hủy. Lý do: ${b.cancelRejectReason}</span>`}</td>
        <td class="num strong">${b.rate}%</td>
        <td>${action}</td>
      </tr>`;
    });
    return html`<section class="card" aria-labelledby="whitelist-title">
      <div class="card-head"><h2 id="whitelist-title">Danh sách Bên thanh toán được chấp nhận</h2></div>
      <div class="table-wrap" id="whitelist-wrap">
        <table class="data-table" style="min-width: 820px">
          <thead><tr><th>Bên thanh toán</th><th>MST</th><th>Tài khoản Giao dịch</th><th>Ủy quyền trích nợ</th><th class="num">(2) Tỷ lệ mua nợ</th><th>Thao tác</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
  }

  function invoicesHtml(d) {
    var st = rp.state;
    var q = st.q.trim().toLowerCase();
    var base = d.invoices.filter(function (i) {
      return !q || i.number.toLowerCase().indexOf(q) >= 0 || i.partyName.toLowerCase().indexOf(q) >= 0;
    });
    var counts = {
      all: base.length,
      unsold: base.filter(function (i) { return i.status !== 'SOLD'; }).length,
      sold: base.filter(function (i) { return i.status === 'SOLD'; }).length
    };
    var items = base.filter(function (i) {
      return st.tab === 'all' || (st.tab === 'sold' ? i.status === 'SOLD' : i.status !== 'SOLD');
    });
    var chosen = selectedInvoices();
    var chosenBuyer = chosen.length ? chosen[0].partyTaxCode : null;

    var buyerOptions = {};
    d.rp.buyers.forEach(function (b) { buyerOptions[b.taxCode] = b.name; });
    d.invoices.forEach(function (i) { if (!buyerOptions[i.partyTaxCode]) buyerOptions[i.partyTaxCode] = i.partyName; });
    if (st.buyer && !buyerOptions[st.buyer]) buyerOptions[st.buyer] = st.buyer;

    var rows = items.map(function (i) {
      var lock = baseLock(i, d);
      if (!lock && chosenBuyer && chosenBuyer !== i.partyTaxCode) lock = { text: 'Mỗi yêu cầu chỉ gồm hóa đơn của một Bên thanh toán', show: false };
      var selected = !!st.selected[i.id];
      var status = INVOICE_STATUS[i.status];
      return html`<tr class="${selected ? 'is-selected' : ''} ${lock ? 'is-locked' : ''}">
        <td class="check-cell" data-act="rp-locked" data-reason="${lock ? lock.text : ''}">
          <input type="checkbox" id="chk-${i.id}" data-change="rp-toggle" data-id="${i.id}" aria-label="Chọn hóa đơn ${i.number}"
            title="${lock ? lock.text : 'Chọn hóa đơn'}" ${selected ? App.raw('checked') : ''} ${lock ? App.raw('disabled') : ''}>
        </td>
        <td><span class="inv-number">${i.number}</span></td>
        <td><div class="cell-main">${i.partyName}</div><span class="secondary">${i.partyTaxCode}</span>${lock && lock.show && html`<span class="reason">${lock.text}</span>`}</td>
        <td class="mono nowrap">${fmt.vnDate(i.issueDate)}</td>
        <td class="num">${vn(i.amountExVat)}</td>
        <td class="num strong">${vn(i.amountIncVat)}</td>
        <td><span class="tag ${status.cls}">${status.label}</span></td>
      </tr>`;
    });
    var empty = q || st.buyer ? 'Không có hóa đơn phù hợp với bộ lọc.' : 'Không có hóa đơn trong khoảng ngày đã chọn.';

    return html`<section class="card" aria-labelledby="invoices-title">
      <div class="card-head"><h2 id="invoices-title">Hóa đơn đầu ra</h2></div>
      <div class="sale-tabs" role="tablist" aria-label="Trạng thái bán">
        ${[['all', 'Tất cả'], ['unsold', 'Chưa bán'], ['sold', 'Đã bán']].map(function (tab) {
          return html`<button type="button" role="tab" class="sale-tab" data-act="rp-tab" data-tab="${tab[0]}" aria-selected="${st.tab === tab[0] ? 'true' : 'false'}">${tab[1]}<span>${counts[tab[0]]}</span></button>`;
        })}
      </div>
      <div class="filters">
        <input class="input input-sm search" id="rp-search" type="search" data-input="rp-search" aria-label="Tìm hóa đơn" placeholder="Tìm số hóa đơn, tên bên mua…" autocomplete="off" value="${st.q}">
        <select class="select" id="rp-buyer" data-change="rp-filter" data-key="buyer" aria-label="Lọc bên mua">
          <option value="">Tất cả bên mua</option>
          ${Object.keys(buyerOptions).map(function (taxCode) {
            return html`<option value="${taxCode}" ${st.buyer === taxCode ? App.raw('selected') : ''}>${buyerOptions[taxCode]}</option>`;
          })}
        </select>
        <div class="dates">
          <label for="rp-from">Từ ngày</label>
          <input class="input input-sm" id="rp-from" type="date" data-change="rp-filter" data-key="from" value="${st.from}">
          <label for="rp-to">Đến ngày</label>
          <input class="input input-sm" id="rp-to" type="date" data-change="rp-filter" data-key="to" value="${st.to}">
        </div>
      </div>
      ${chosen.length > 0 && html`<div class="notice-row"><p class="banner" role="status">Mỗi yêu cầu chỉ gồm hóa đơn của một Bên thanh toán. Bỏ chọn để đổi Bên thanh toán.</p></div>`}
      <div class="table-wrap" id="invoices-wrap">
        <table class="data-table" style="min-width: 800px">
          <thead><tr><th class="check-cell"><span hidden>Chọn</span></th><th>Số hóa đơn</th><th>Bên mua</th><th>Ngày lập</th><th class="num">Chưa VAT</th><th class="num">Gồm VAT</th><th>Trạng thái</th></tr></thead>
          <tbody>${rows.length ? rows : html`<tr><td colspan="7" class="empty-rows">${empty}</td></tr>`}</tbody>
        </table>
      </div>
      <div class="table-foot"><span>Hiển thị ${items.length} hóa đơn</span></div>
    </section>`;
  }

  function historyHtml(d) {
    var rows = d.requests.map(function (r) {
      var status = SALE_REQUEST_STATUS[r.status];
      return html`<tr>
        <td class="mono strong">${r.id}</td>
        <td class="mono nowrap">${fmt.vnDateTime(r.submittedAt)}</td>
        <td>${r.buyerName}</td>
        <td class="num">${r.invoiceCount}</td>
        <td class="num strong">${vn(r.requestedPurchasedAmount)}</td>
        <td class="num">${r.appliedRate}%</td>
        <td><span class="tag ${status.cls}">${status.label}</span></td>
      </tr>`;
    });
    return html`<section class="card" aria-labelledby="history-title">
      <div class="card-head"><h2 id="history-title">Lịch sử yêu cầu</h2></div>
      <div class="table-wrap" id="history-wrap">
        <table class="data-table" style="min-width: 760px">
          <thead><tr><th>Mã yêu cầu</th><th>Ngày gửi</th><th>Bên thanh toán</th><th class="num">Số hóa đơn</th><th class="num">Giá Mua nợ đề nghị</th><th class="num">Tỷ lệ</th><th>Trạng thái</th></tr></thead>
          <tbody>${rows.length ? rows : html`<tr><td colspan="7" class="empty-rows">Chưa có yêu cầu bán nợ nào.</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
  }

  /* ---------- Cửa sổ chi tiết bán hóa đơn ---------- */
  function openSale() {
    var d = rp.data;
    var items = selectedInvoices();
    if (!items.length) return;
    var buyer = buyerOf(d, items[0].partyTaxCode);
    var rows = items.slice().sort(function (a, b) { return a.issueDate < b.issueDate ? -1 : 1; }).map(function (i) {
      return { id: i.id, number: i.number, issueDate: i.issueDate, dueDate: i.expectedDueDate, amountExVat: i.amountExVat, max: maxPurchase(i.amountExVat, buyer.rate) };
    });
    var sumMax = rows.reduce(function (s, r) { return s + r.max; }, 0);
    var sale = rp.state.sale = {
      step: 'detail', buyer: buyer, rate: buyer.rate, rows: rows,
      sumEx: rows.reduce(function (s, r) { return s + r.amountExVat; }, 0), sumMax: sumMax,
      available: d.rp.limit.available, amount: sumMax, error: '', serverError: '', sending: false, result: null
    };
    sale.error = saleAmountError(sale);
    App.openDialog({ wide: true, render: saleDialogHtml, locked: function () { return rp.state.sale && rp.state.sale.sending; } });
  }

  function saleAmountError(sale) {
    if (!sale.amount) return 'Vui lòng nhập Giá Mua nợ đề nghị.';
    if (sale.amount > sale.sumMax) return 'Giá Mua nợ đề nghị không được vượt quá tổng (3) Giá Mua nợ tối đa (' + vn(sale.sumMax) + ' VND).';
    if (sale.amount > sale.available) return 'Giá Mua nợ đề nghị không được vượt quá hạn mức Mua bán nợ còn lại (' + vn(sale.available) + ' VND).';
    return '';
  }

  // Mỗi hóa đơn có ngày đến hạn riêng; màn xác nhận ghi một ngày hoặc khoảng sớm nhất – muộn nhất.
  function saleDueRange(sale) {
    var dates = sale.rows.map(function (r) { return r.dueDate; }).filter(Boolean).sort();
    if (!dates.length) return '—';
    var first = dates[0], last = dates[dates.length - 1];
    return first === last ? fmt.vnDate(first) : fmt.vnDate(first) + ' – ' + fmt.vnDate(last);
  }

  function saleDialogHtml() {
    var sale = rp.state.sale;
    if (!sale) return '';
    if (sale.step === 'done') {
      return html`<div class="modal-body center">
        ${checkIcon()}
        <h2 id="dialog-title">Đã gửi yêu cầu</h2>
        <p>Đã gửi yêu cầu bán nợ ${sale.result.id} tới Advance.</p>
        <button type="button" class="btn btn-primary btn-block" data-act="sale-close" data-autofocus>Đóng</button>
      </div>`;
    }
    if (sale.step === 'confirm') {
      return html`<div class="modal-body">
        <div class="eyebrow">Mua bán nợ</div>
        <h2 id="dialog-title">Xác nhận yêu cầu bán nợ</h2>
        <dl class="receipt">
          <div><dt>Bên thanh toán</dt><dd>${sale.buyer.name}</dd></div>
          <div><dt>Hóa đơn</dt><dd>${sale.rows.map(function (r) { return r.number; }).join(', ')}</dd></div>
          <div><dt>Ngày đến hạn dự kiến</dt><dd class="mono">${saleDueRange(sale)}</dd></div>
          <div><dt>Tổng (1) Giá trị Khoản nợ (chưa VAT)</dt><dd class="mono">${vn(sale.sumEx)} VND</dd></div>
          <div><dt>(2) Tỷ lệ mua nợ</dt><dd>${sale.rate}%</dd></div>
          <div><dt>Tổng (3) Giá Mua nợ tối đa</dt><dd class="mono">${vn(sale.sumMax)} VND</dd></div>
          <div class="receipt-total"><dt>Giá Mua nợ đề nghị</dt><dd class="mono">${vn(sale.amount)} VND</dd></div>
        </dl>
        <p>Khoản chiết khấu và Giá Thanh toán thực tế sẽ được Advance xác nhận trong Phụ lục giao dịch sau khi duyệt.</p>
        ${sale.serverError && html`<p class="banner banner-danger" role="alert">${sale.serverError}</p>`}
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-act="sale-back" ${sale.sending ? App.raw('disabled') : ''}>Quay lại</button>
          <button type="button" class="btn btn-primary" data-act="sale-send" data-autofocus ${sale.sending ? App.raw('disabled') : ''}>${sale.sending ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>
        </div>
      </div>`;
    }
    return html`<div class="modal-body">
      <div class="eyebrow">Mua bán nợ</div>
      <h2 id="dialog-title">Bán hóa đơn</h2>
      <dl class="facts box">
        <div><dt>Bên thanh toán</dt><dd>${sale.buyer.name}</dd></div>
        <div><dt>MST</dt><dd class="mono">${sale.buyer.taxCode}</dd></div>
        ${App.autoDebit() && html`<div><dt>Ủy quyền trích nợ</dt><dd>${App.authTag(sale.buyer.authStatus)}</dd></div>`}
        <div><dt>(2) Tỷ lệ mua nợ</dt><dd>${sale.rate}%</dd></div>
      </dl>
      <div class="sale-table table-wrap" id="sale-wrap">
        <table class="data-table" style="min-width: 680px">
          <thead><tr><th>Số HĐ</th><th>Ngày HĐ</th><th>Ngày đến hạn dự kiến</th><th class="num">(1) Giá trị Khoản nợ (chưa VAT)</th><th class="num">(2) Tỷ lệ mua nợ</th><th class="num">(3) Giá Mua nợ tối đa</th></tr></thead>
          <tbody>${sale.rows.map(function (r) {
            return html`<tr><td class="mono strong">${r.number}</td><td class="mono nowrap">${fmt.vnDate(r.issueDate)}</td><td class="mono nowrap">${r.dueDate ? fmt.vnDate(r.dueDate) : '—'}</td><td class="num">${vn(r.amountExVat)}</td><td class="num">${sale.rate}%</td><td class="num strong">${vn(r.max)}</td></tr>`;
          })}</tbody>
          <tfoot><tr><td colspan="3">Tổng</td><td class="num">${vn(sale.sumEx)}</td><td></td><td class="num">${vn(sale.sumMax)}</td></tr></tfoot>
        </table>
      </div>
      <div class="field amount-field">
        <label class="field-label" for="sale-amount">Giá Mua nợ đề nghị (VND)</label>
        <input class="input" id="sale-amount" data-autofocus data-keep="${sale.rows.length}-${sale.sumMax}" data-input="sale-amount" type="text" inputmode="numeric" autocomplete="off"
          value="${vn(sale.sumMax)}" aria-invalid="${sale.error ? 'true' : 'false'}" aria-describedby="sale-amount-err">
        <p class="err" id="sale-amount-err" role="alert" ${sale.error ? '' : App.raw('hidden')}>${sale.error}</p>
      </div>
      <div class="sale-lines">
        <div class="after">Hạn mức Mua bán nợ còn lại sau yêu cầu này: <strong id="sale-after">${sale.error ? '—' : vn(sale.available - sale.amount) + ' VND'}</strong></div>
        <div class="note">Khoản chiết khấu và Giá Thanh toán thực tế sẽ được Advance xác nhận trong Phụ lục giao dịch sau khi duyệt.</div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-act="sale-close">Đóng</button>
        <button type="button" class="btn btn-primary" id="sale-next" data-act="sale-next" ${sale.error ? App.raw('disabled') : ''}>Tiếp tục</button>
      </div>
    </div>`;
  }

  /* ================================================================== S3.2 Đăng ký ủy quyền trích nợ */
  var REG_B2B_ERRORS = {
    buyerTaxCode: 'Bên thanh toán này chưa đăng ký được ủy quyền trích nợ.',
    agreementNo: 'Mã hợp đồng không khớp với hợp đồng mua bán nợ của Quý khách tại Advance.',
    bankCode: 'Ngân hàng không phải ngân hàng của Tài khoản Giao dịch của Bên thanh toán đã chọn.',
    accountNo: 'Số tài khoản không phải Tài khoản Giao dịch của Bên thanh toán đã chọn.',
    phone: 'Số điện thoại không khớp với số điện thoại Quý khách đã đăng ký với Advance.'
  };
  var REG_EPAY_ERRORS = {
    '19': { field: 'accountName', text: 'Tên chủ tài khoản không khớp với tài khoản tại ngân hàng.' },
    '20': { field: 'phone', text: 'Số điện thoại không khớp với số đã đăng ký cho tài khoản này tại ngân hàng.' },
    '24': { field: 'accountNo', text: 'Tài khoản không hợp lệ hoặc đã bị khóa.' },
    '18': { field: null, text: 'Mã số doanh nghiệp không khớp với thông tin tại ngân hàng. Vui lòng liên hệ Advance để được hỗ trợ.' },
    '99': { field: null, text: 'Hệ thống ngân hàng đang bận. Vui lòng thử lại sau ít phút.' }
  };
  var REG_FIELD_IDS = { buyerTaxCode: 'reg-buyer', agreementNo: 'reg-agreement', bankCode: 'reg-bank', accountNo: 'reg-account', accountName: 'reg-name', phone: 'reg-phone', email: 'reg-email', agreed: 'reg-agree' };

  function freshReg() {
    return { step: 'form', form: null, wantBuyer: null, errors: {}, banner: '', sending: '', otp: null, doneBuyer: null };
  }

  var reg = App.views['dang-ky-trich-no'] = {
    mode: 'portal', nav: 'mua-ban-no',
    state: freshReg(),
    reset: function () { this.state = freshReg(); },
    enter: function (params) {
      this.state = freshReg();
      this.state.wantBuyer = params.buyer || null;
    },
    load: function () { return api.getBuyers(); },
    onData: function () {
      var st = this.state;
      if (st.form) return;
      var open = registrable(this.data);
      var first = open.find(function (b) { return b.taxCode === st.wantBuyer; }) || open[0] || null;
      // Bản demo điền sẵn thông tin đúng; sửa một trường để thử bước kiểm tra với dữ liệu B2B.
      st.form = {
        buyerTaxCode: first ? first.taxCode : '',
        agreementNo: this.data.agreementNo,
        bankCode: first && first.transactionAccount ? first.transactionAccount.bankCode : '',
        accountNo: first && first.transactionAccount ? first.transactionAccount.accountNo : '',
        accountName: 'CONG TY TNHH MAU AN PHUC',
        phone: '0901234567',
        email: '', address: '', agreed: false
      };
    },
    render: function () {
      var d = this.data;
      var st = this.state;
      var head = html`<div class="page-head"><h1>Đăng ký ủy quyền trích nợ</h1><a class="text-button back-link" href="#mua-ban-no">← Mua bán nợ</a></div>`;
      if (!d || !st.form) return html`${head}${loadingCard()}`;
      var step = st.step === 'form' ? 1 : st.step === 'otp' ? 2 : 3;
      var main = st.step === 'otp' ? otpHtml(st) : st.step === 'done' ? doneHtml(st) : formHtml(d, st);
      return html`${head}
        <div class="cols">
          <div class="col-main">${main}</div>
          <aside class="col-side card steps-card">
            <div class="steps-title">Các bước</div>
            <ol class="steps">
              ${['Thông tin đăng ký', 'Xác thực OTP', 'Hoàn tất'].map(function (label, index) {
                return html`<li class="${index + 1 <= step ? 'on' : ''}"><span class="step-number" aria-hidden="true">${index + 1}</span>${label}</li>`;
              })}
            </ol>
            <p class="side-note">Dịch vụ do VNPT EPAY cung cấp.</p>
          </aside>
        </div>`;
    },
    leave: function () { this.state.otp = null; },
    actions: {
      'reg-field': function (el) {
        var st = reg.state;
        var key = el.getAttribute('data-key');
        if (key === 'accountNo') el.value = fmt.digits(el.value).slice(0, 25);
        if (key === 'phone') el.value = fmt.digits(el.value).slice(0, 12);
        st.form[key] = el.value;
        clearFieldError(key);
      },
      'reg-buyer': function (el) {
        var st = reg.state;
        var buyer = reg.data.buyers.find(function (b) { return b.taxCode === el.value; });
        st.form.buyerTaxCode = el.value;
        if (buyer && buyer.transactionAccount) {
          st.form.bankCode = buyer.transactionAccount.bankCode;
          st.form.accountNo = buyer.transactionAccount.accountNo;
        }
        st.errors = {};
        st.banner = '';
        App.paint();
      },
      'reg-select': function (el) {
        reg.state.form[el.getAttribute('data-key')] = el.value;
        clearFieldError(el.getAttribute('data-key'));
      },
      'reg-agree': function (el) {
        // Phải mở Điều khoản và bấm "Tôi đồng ý" thì ô mới được tick.
        if (el.checked) {
          el.checked = false;
          openTnc();
        } else {
          reg.state.form.agreed = false;
        }
      },
      'tnc-open': function () { openTnc(); },
      'tnc-close': function () { closeTnc(); },
      'tnc-agree': function () {
        reg.state.form.agreed = true;
        delete reg.state.errors.agreed;
        closeTnc();
        App.paint();
        var box = document.getElementById('reg-agree');
        if (box) box.focus();
      },
      'reg-submit': function () { submitRegistration(); },
      'otp-input': function (el) {
        var otp = reg.state.otp;
        el.value = fmt.digits(el.value).slice(0, otp.length);
        otp.value = el.value;
        otp.error = '';
        otp.info = '';
        var err = document.getElementById('otp-error');
        if (err) err.hidden = true;
        var info = document.getElementById('otp-info');
        if (info) info.hidden = true;
        el.setAttribute('aria-invalid', 'false');
        tickOtp();
      },
      'otp-confirm': function () { confirmOtp(); },
      'otp-resend': function () {
        var otp = reg.state.otp;
        otp.busy = true;
        App.paint();
        api.resendDebitAuthOtp(otp.authId).then(function (result) {
          setOtp(result, 'Đã gửi lại mã OTP.');
          App.paint();
          focusOtp();
        }).catch(function (error) {
          otp.busy = false;
          if (error.code === 'OTP_SEND_LIMIT') otp.error = 'Đã quá số lần gửi OTP trong ngày (tối đa 5 lần).';
          else { backToForm('Lượt đăng ký không còn hiệu lực. Vui lòng đăng ký lại.'); return; }
          App.paint();
        });
      },
      'otp-back': function () { reg.state.step = 'form'; reg.state.otp = null; App.paint(); },
      'reg-sell-now': function () { App.go('mua-ban-no', { buyer: reg.state.doneBuyer.taxCode }); }
    }
  };

  function registrable(d) { return d.buyers.filter(function (b) { return b.authStatus === 'NONE' || b.authStatus === 'PENDING_OTP'; }); }
  function clearFieldError(key) {
    var st = reg.state;
    if (!st.errors[key]) return;
    delete st.errors[key];
    var err = document.getElementById('err-' + key);
    if (err) { err.textContent = ''; err.hidden = true; }
    var input = document.getElementById(REG_FIELD_IDS[key]);
    if (input) input.setAttribute('aria-invalid', 'false');
  }
  function fieldError(st, key) {
    return html`<p class="err" id="err-${key}" role="alert" ${st.errors[key] ? '' : App.raw('hidden')}>${st.errors[key] || ''}</p>`;
  }
  function invalid(st, key) { return st.errors[key] ? 'true' : 'false'; }

  function formHtml(d, st) {
    var f = st.form;
    var open = registrable(d);
    var busy = !!st.sending;
    var dis = busy ? App.raw('disabled') : '';
    if (!open.length) {
      return html`<div class="card form-card">
        <h2>Thông tin đăng ký</h2>
        <p class="banner" role="status">Không còn Bên thanh toán nào ở trạng thái Chưa đăng ký.</p>
        <div class="actions"><a class="btn btn-outline" href="#mua-ban-no">Quay lại</a></div>
      </div>`;
    }
    return html`<form class="card form-card" data-submit="reg-submit" novalidate autocomplete="off">
      <div><h2>Thông tin đăng ký</h2></div>
      ${st.banner && html`<p class="banner banner-danger" id="reg-banner" role="alert">${st.banner}</p>`}
      <div class="box">
        <div class="box-title">Thông tin khách hàng</div>
        <dl class="facts">
          <div><dt>Tên doanh nghiệp</dt><dd>${d.customer.name}</dd></div>
          <div><dt>Mã số doanh nghiệp</dt><dd class="mono">${d.customer.taxCode}</dd></div>
        </dl>
      </div>
      <div class="fields">
        <div class="field">
          <label class="field-label" for="reg-buyer">Bên thanh toán</label>
          <select class="input" id="reg-buyer" data-change="reg-buyer" aria-invalid="${invalid(st, 'buyerTaxCode')}" ${dis}>
            ${open.map(function (b) { return html`<option value="${b.taxCode}" ${f.buyerTaxCode === b.taxCode ? App.raw('selected') : ''}>${b.name}</option>`; })}
          </select>
          ${fieldError(st, 'buyerTaxCode')}
        </div>
        <div class="field">
          <label class="field-label" for="reg-agreement">Mã hợp đồng</label>
          <input class="input" id="reg-agreement" data-input="reg-field" data-key="agreementNo" type="text" autocomplete="off" maxlength="60" value="${f.agreementNo}" aria-invalid="${invalid(st, 'agreementNo')}" ${dis}>
          ${fieldError(st, 'agreementNo')}
        </div>
        <div class="field">
          <label class="field-label" for="reg-bank">Ngân hàng</label>
          <select class="input" id="reg-bank" data-change="reg-select" data-key="bankCode" aria-invalid="${invalid(st, 'bankCode')}" ${dis}>
            <option value="">Chọn ngân hàng</option>
            ${d.banks.map(function (b) { return html`<option value="${b.code}" ${f.bankCode === b.code ? App.raw('selected') : ''}>${b.short} - ${b.name}</option>`; })}
          </select>
          ${fieldError(st, 'bankCode')}
        </div>
        <div class="field">
          <label class="field-label" for="reg-account">Số tài khoản</label>
          <input class="input mono" id="reg-account" data-input="reg-field" data-key="accountNo" type="text" inputmode="numeric" autocomplete="off" value="${f.accountNo}" aria-invalid="${invalid(st, 'accountNo')}" ${dis}>
          ${fieldError(st, 'accountNo')}
        </div>
        <div class="field">
          <label class="field-label" for="reg-name">Tên chủ tài khoản</label>
          <input class="input" id="reg-name" data-input="reg-field" data-key="accountName" type="text" autocomplete="off" maxlength="100" value="${f.accountName}" aria-invalid="${invalid(st, 'accountName')}" ${dis}>
          <p class="hint">Nhập đúng như tên đã đăng ký tại ngân hàng.</p>
          ${fieldError(st, 'accountName')}
        </div>
        <div class="field">
          <label class="field-label" for="reg-phone">Số điện thoại đăng ký với ngân hàng</label>
          <input class="input mono" id="reg-phone" data-input="reg-field" data-key="phone" type="tel" inputmode="numeric" autocomplete="off" value="${f.phone}" aria-invalid="${invalid(st, 'phone')}" ${dis}>
          <p class="hint">Ngân hàng gửi mã OTP về số này.</p>
          ${fieldError(st, 'phone')}
        </div>
        <div class="field">
          <label class="field-label" for="reg-email">Email <span class="opt">(không bắt buộc)</span></label>
          <input class="input" id="reg-email" data-input="reg-field" data-key="email" type="email" autocomplete="off" maxlength="100" value="${f.email}" aria-invalid="${invalid(st, 'email')}" ${dis}>
          ${fieldError(st, 'email')}
        </div>
        <div class="field">
          <label class="field-label" for="reg-address">Địa chỉ <span class="opt">(không bắt buộc)</span></label>
          <input class="input" id="reg-address" data-input="reg-field" data-key="address" type="text" autocomplete="off" maxlength="300" value="${f.address}" ${dis}>
        </div>
      </div>
      <div>
        <div class="agree-row">
          <input id="reg-agree" type="checkbox" data-change="reg-agree" ${f.agreed ? App.raw('checked') : ''} ${dis}>
          <span><label for="reg-agree">Tôi đã đọc và đồng ý với</label> <button type="button" class="linklike" data-act="tnc-open">Điều kiện và Điều khoản sử dụng dịch vụ trích nợ tự động qua VNPT EPAY</button>.</span>
        </div>
        ${fieldError(st, 'agreed')}
      </div>
      <div class="actions">
        <button type="submit" class="btn btn-primary" id="reg-submit" ${dis}>${st.sending || 'Tiếp tục'}</button>
        <a class="text-button" href="#mua-ban-no">Quay lại</a>
      </div>
    </form>`;
  }

  function validateForm(f) {
    var e = {};
    if (!f.buyerTaxCode) e.buyerTaxCode = 'Vui lòng chọn Bên thanh toán.';
    if (!f.agreementNo.trim()) e.agreementNo = 'Vui lòng nhập mã hợp đồng.';
    if (!f.bankCode) e.bankCode = 'Vui lòng chọn ngân hàng.';
    if (!f.accountNo) e.accountNo = 'Vui lòng nhập số tài khoản.';
    if (!f.accountName.trim()) e.accountName = 'Vui lòng nhập tên chủ tài khoản.';
    if (!/^0\d{9}$/.test(f.phone)) e.phone = 'Số điện thoại gồm 10 số, bắt đầu bằng 0.';
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = 'Email không đúng định dạng.';
    if (!f.agreed) e.agreed = 'Vui lòng đọc và đồng ý với Điều khoản để tiếp tục.';
    return e;
  }

  function showFormErrors(errors, banner) {
    var st = reg.state;
    st.sending = '';
    st.errors = errors;
    st.banner = banner || '';
    App.paint();
    var firstKey = Object.keys(REG_FIELD_IDS).find(function (k) { return errors[k]; });
    var target = firstKey ? document.getElementById(REG_FIELD_IDS[firstKey]) : document.getElementById('reg-banner');
    if (target) { if (target.focus) target.focus(); target.scrollIntoView({ block: 'center', behavior: 'auto' }); }
  }

  function mismatchErrors(fields) {
    var errors = {};
    fields.forEach(function (field) { errors[field] = REG_B2B_ERRORS[field] || 'Thông tin không khớp.'; });
    return errors;
  }

  function submitRegistration() {
    var st = reg.state;
    if (st.sending) return;
    var f = st.form;
    var errors = validateForm(f);
    if (Object.keys(errors).length) { showFormErrors(errors); return; }

    st.errors = {};
    st.banner = '';
    st.sending = 'Đang kiểm tra thông tin…';
    App.paint();
    // Lớp 1: khớp dữ liệu B2B. Sai thì dừng, không gửi sang EPAY.
    api.verifyDebitAuth(f).then(function (check) {
      if (!check.ok) { showFormErrors(mismatchErrors(check.mismatches)); return null; }
      // Lớp 2: B2B gọi EPAY đăng ký.
      st.sending = 'Đang gửi yêu cầu…';
      App.paint();
      return api.registerDebitAuth(f).then(function (result) {
        st.sending = '';
        st.step = 'otp';
        setOtp(result, '');
        App.paint();
        focusOtp();
      });
    }).catch(function (error) {
      if (error.code === 'B2B_MISMATCH') { showFormErrors(mismatchErrors(error.data.mismatches || [])); return; }
      if (error.code === 'EPAY_ERROR') {
        var info = REG_EPAY_ERRORS[error.data.epayCode] || { field: null, text: 'EPAY từ chối yêu cầu (mã ' + error.data.epayCode + ').' };
        var fieldErrors = {};
        if (info.field) fieldErrors[info.field] = info.text;
        showFormErrors(fieldErrors, info.field ? '' : info.text);
        return;
      }
      showFormErrors({}, error.message);
    });
  }

  /* ---------- OTP ---------- */
  function setOtp(result, info) {
    reg.state.otp = {
      authId: result.authId, length: result.otp.length, triesLeft: result.otp.triesLeft,
      deadline: Date.now() + result.otp.expiresInSeconds * 1000,
      bankName: result.otp.bankName, phoneMasked: result.otp.phoneMasked,
      value: '', error: '', info: info, busy: false
    };
  }
  function focusOtp() { var el = document.getElementById('otp-code'); if (el) el.focus(); }
  function two(n) { return String(n).padStart(2, '0'); }
  function otpRemaining(otp) { return Math.max(0, Math.ceil((otp.deadline - Date.now()) / 1000)); }

  function otpHtml(st) {
    var otp = st.otp;
    var remaining = otpRemaining(otp);
    var expired = remaining === 0;
    return html`<form class="card form-card" data-submit="otp-confirm" novalidate autocomplete="off">
      <div>
        <h2>Xác thực OTP</h2>
        <p class="lead">${otp.bankName} đã gửi mã OTP gồm ${otp.length} số tới số điện thoại ${otp.phoneMasked}.</p>
      </div>
      <div class="field otp-field">
        <label class="field-label" for="otp-code">Mã OTP</label>
        <input class="input input-otp" id="otp-code" data-input="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${otp.length}" value="${otp.value}" aria-invalid="${otp.error ? 'true' : 'false'}" ${otp.busy ? App.raw('disabled') : ''}>
        <p class="err" id="otp-error" role="alert" ${otp.error ? '' : App.raw('hidden')}>${otp.error}</p>
        <p class="info" id="otp-info" role="status" ${otp.info ? '' : App.raw('hidden')}>${otp.info}</p>
      </div>
      <div class="otp-meta">
        <span id="otp-running" ${expired ? App.raw('hidden') : ''}>Mã hết hạn sau <strong id="otp-count">${two(Math.floor(remaining / 60))}:${two(remaining % 60)}</strong></span>
        <span class="expired" id="otp-expired" ${expired ? '' : App.raw('hidden')}>Mã OTP đã hết hạn.</span>
        <span>Còn <strong>${otp.triesLeft}</strong> lần nhập</span>
      </div>
      <div class="actions">
        <button type="submit" class="btn btn-primary" id="otp-confirm" ${otp.busy || expired || otp.value.length !== otp.length ? App.raw('disabled') : ''}>Xác nhận</button>
        <button type="button" class="btn btn-outline" data-act="otp-resend" ${otp.busy ? App.raw('disabled') : ''}>Gửi lại mã</button>
        <button type="button" class="text-button" data-act="otp-back" ${otp.busy ? App.raw('disabled') : ''}>Quay lại</button>
      </div>
    </form>`;
  }

  /* Cập nhật đồng hồ đếm ngược mà không vẽ lại cả trang. */
  function tickOtp() {
    var st = reg.state;
    if (App.view !== reg || st.step !== 'otp' || !st.otp) return;
    var count = document.getElementById('otp-count');
    if (!count) return;
    var remaining = otpRemaining(st.otp);
    var expired = remaining === 0;
    count.textContent = two(Math.floor(remaining / 60)) + ':' + two(remaining % 60);
    document.getElementById('otp-running').hidden = expired;
    document.getElementById('otp-expired').hidden = !expired;
    document.getElementById('otp-confirm').disabled = st.otp.busy || expired || st.otp.value.length !== st.otp.length;
  }
  setInterval(tickOtp, 500);

  function backToForm(banner) {
    var st = reg.state;
    st.step = 'form';
    st.otp = null;
    st.form.agreed = false;
    showFormErrors({}, banner);
  }

  function confirmOtp() {
    var st = reg.state;
    var otp = st.otp;
    if (otp.busy || otp.value.length !== otp.length || otpRemaining(otp) === 0) return;
    otp.busy = true;
    otp.info = '';
    App.paint();
    api.confirmDebitAuthOtp(otp.authId, otp.value).then(function (result) {
      st.step = 'done';
      st.otp = null;
      st.doneBuyer = result.buyer;
      App.paint();
    }).catch(function (error) {
      otp.busy = false;
      otp.value = '';
      if (error.code === 'OTP_INVALID') {
        otp.triesLeft = error.data.triesLeft;
        otp.error = 'Mã OTP không đúng. Vui lòng thử lại.';
      } else if (error.code === 'OTP_EXPIRED') {
        otp.deadline = 0;
        otp.error = 'Mã OTP đã hết hạn. Vui lòng bấm Gửi lại mã.';
      } else {
        // Hết lượt nhập (hoặc lượt đăng ký không còn): quay về bước 1.
        backToForm('Nhập sai mã OTP quá số lần cho phép. Vui lòng kiểm tra lại thông tin và đăng ký lại.');
        return;
      }
      App.paint();
      focusOtp();
    });
  }

  function doneHtml(st) {
    var b = st.doneBuyer;
    return html`<div class="card form-card">
      <div class="center">
        ${checkIcon()}
        <h2>Đăng ký thành công</h2>
        <p class="lead">Ủy quyền trích nợ cho Bên thanh toán ${b.name} đang hiệu lực. (2) Tỷ lệ mua nợ áp dụng: ${b.rate}%.</p>
      </div>
      <dl class="facts box">
        <div><dt>Bên thanh toán</dt><dd>${b.name}</dd></div>
        <div><dt>Tài khoản Giao dịch</dt><dd class="mono">${accountText(b.transactionAccount)}</dd></div>
        <div><dt>Ủy quyền trích nợ</dt><dd>${App.authTag(b.authStatus)}</dd></div>
        <div><dt>(2) Tỷ lệ mua nợ</dt><dd>${b.rate}%</dd></div>
      </dl>
      <div class="actions"><button type="button" class="btn btn-primary" data-act="reg-sell-now">Bán hóa đơn ngay</button></div>
    </div>`;
  }

  /* ---------- Điều khoản (nội dung nằm sẵn trong index.html) ---------- */
  function openTnc() {
    var tnc = document.getElementById('tnc');
    if (tnc.showModal) tnc.showModal(); else tnc.setAttribute('open', '');
    document.getElementById('tnc-body').scrollTop = 0;
  }
  function closeTnc() {
    var tnc = document.getElementById('tnc');
    if (tnc.open) { if (tnc.close) tnc.close(); else tnc.removeAttribute('open'); }
  }

  /* ================================================================== S3.3 Hủy ủy quyền trích nợ */
  var cancel = App.views['huy-uy-quyen'] = {
    mode: 'portal', nav: 'mua-ban-no',
    state: { buyer: null, sending: false },
    reset: function () { this.state = { buyer: null, sending: false }; },
    enter: function (params) { this.state = { buyer: params.buyer || null, sending: false }; },
    load: function () { return api.getBuyers(); },
    onData: function () {
      var st = this.state;
      var buyer = this.data.buyers.find(function (b) { return b.taxCode === st.buyer; });
      if ((!buyer || buyer.authStatus !== 'ACTIVE') && !st.sending) App.go('mua-ban-no');
    },
    render: function () {
      var d = this.data;
      var st = this.state;
      var head = html`<div class="page-head"><h1>Hủy ủy quyền trích nợ</h1><a class="text-button back-link" href="#mua-ban-no">← Mua bán nợ</a></div>`;
      var buyer = d ? d.buyers.find(function (b) { return b.taxCode === st.buyer; }) : null;
      if (!buyer || !buyer.authorization) return html`${head}${loadingCard()}`;
      var a = buyer.authorization;
      return html`${head}
        <form class="card form-card" data-submit="cancel-send" novalidate style="max-width: 760px">
          <div><h2>Xác nhận yêu cầu hủy</h2><p class="lead">Kiểm tra thông tin trước khi gửi yêu cầu hủy.</p></div>
          <dl class="facts box">
            <div><dt>Mã hợp đồng</dt><dd>${a.agreementNo}</dd></div>
            <div><dt>Bên thanh toán</dt><dd>${buyer.name}</dd></div>
            <div><dt>Ngân hàng</dt><dd>${a.bankName}</dd></div>
            <div><dt>Tài khoản</dt><dd class="mono">${a.accountNo}</dd></div>
            <div><dt>Chủ tài khoản</dt><dd>${a.accountName}</dd></div>
          </dl>
          <ul class="note-list">
            <li>Yêu cầu sẽ được Advance xem xét trước khi gửi tới EPAY.</li>
            <li>Sau khi hủy, các yêu cầu bán nợ mới với Bên thanh toán này áp dụng tỷ lệ 80%. Các giao dịch đã thực hiện không thay đổi.</li>
          </ul>
          <div class="field">
            <label class="field-label" for="cancel-reason">Lý do <span class="opt">(không bắt buộc)</span></label>
            <textarea class="input" id="cancel-reason" data-keep="1" maxlength="300" ${st.sending ? App.raw('disabled') : ''}></textarea>
          </div>
          <div class="actions">
            <button type="submit" class="btn btn-danger" ${st.sending ? App.raw('disabled') : ''}>${st.sending ? 'Đang gửi…' : 'Gửi yêu cầu hủy'}</button>
            <a class="btn btn-outline" href="#mua-ban-no">Giữ đăng ký</a>
          </div>
        </form>`;
    },
    actions: {
      'cancel-send': function () {
        var st = cancel.state;
        var buyer = cancel.data.buyers.find(function (b) { return b.taxCode === st.buyer; });
        var reason = document.getElementById('cancel-reason').value.trim();
        st.sending = true;
        App.paint();
        api.requestDebitAuthCancel(buyer.authId, reason).then(function () {
          App.toast('Đã gửi yêu cầu hủy ủy quyền trích nợ tới Advance.');
          App.go('mua-ban-no');
        }).catch(function (error) {
          st.sending = false;
          App.toast(error.message, true);
          App.refresh();
        });
      }
    }
  };

  /* ================================================================== S4. Tài trợ hóa đơn (sơ bộ) */
  function freshIf() { return { q: '', from: DEFAULT_FROM, to: '', selected: {}, confirm: null }; }
  var IF_STATUS = { NEW: { label: 'Hóa đơn mới', cls: '' }, REQUESTED: { label: 'Đã gửi yêu cầu', cls: 'tag-warn' } };

  var invf = App.views['invoice-financing'] = {
    mode: 'portal', nav: 'invoice-financing',
    state: freshIf(),
    reset: function () { this.state = freshIf(); },
    enter: function () { this.state.confirm = null; },
    load: function () {
      var st = this.state;
      return Promise.all([api.getInvoices({ direction: 'in', from: st.from, to: st.to }), api.getOverview(), api.getIfSuppliers(), api.getIfPackages(), api.getIfRequests()]).then(function (r) {
        return { invoices: r[0].items, limit: r[1].limits.find(function (l) { return l.product === 'IF'; }), suppliers: r[2].suppliers, packages: r[3].packages, requests: r[4].items };
      });
    },
    onData: function () {
      var st = this.state;
      var open = {};
      var d = this.data;
      d.invoices.forEach(function (i) { if (i.status === 'NEW' && supplierApproved(d, i) && !i.overAge) open[i.id] = true; });
      Object.keys(st.selected).forEach(function (id) { if (!open[id]) delete st.selected[id]; });
    },
    hasBar: function () { return ifSelected().length > 0; },
    render: function () {
      var d = this.data;
      var st = this.state;
      if (!d) return html`<div class="page-head"><h1>Tài trợ hóa đơn</h1></div>${loadingCard()}`;
      var q = st.q.trim().toLowerCase();
      var items = d.invoices.filter(function (i) {
        return !q || i.number.toLowerCase().indexOf(q) >= 0 || i.partyName.toLowerCase().indexOf(q) >= 0 || i.partyTaxCode.indexOf(q) >= 0;
      });
      var rows = items.map(function (i) {
        var selected = !!st.selected[i.id];
        var approved = supplierApproved(d, i);
        var tooOld = approved && i.status === 'NEW' && i.overAge;
        var locked = !approved || i.status !== 'NEW' || tooOld;
        var lockText = !approved ? IF_NOT_APPROVED : tooOld ? OVER_AGE_TEXT : 'Hóa đơn đã gửi yêu cầu';
        var status = IF_STATUS[i.status];
        return html`<tr class="${selected ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}">
          <td class="check-cell"><input type="checkbox" id="ifchk-${i.id}" data-change="if-toggle" data-id="${i.id}" aria-label="Chọn hóa đơn ${i.number}"
            title="${locked ? lockText : 'Chọn hóa đơn'}" ${selected ? App.raw('checked') : ''} ${locked ? App.raw('disabled') : ''}></td>
          <td><span class="inv-number">${i.number}</span></td>
          <td><div class="cell-main">${i.partyName}</div><span class="secondary">${i.partyTaxCode}</span>${(!approved || tooOld) && html`<span class="reason">${lockText}</span>`}</td>
          <td class="mono nowrap">${fmt.vnDate(i.issueDate)}</td>
          <td class="num strong">${vn(i.amountIncVat)}<span class="secondary">VND</span></td>
          <td><span class="tag ${status.cls}">${status.label}</span></td>
        </tr>`;
      });
      return html`<div class="page-head"><h1>Tài trợ hóa đơn</h1></div>
        <section class="card" aria-labelledby="if-suppliers-title">
          <div class="card-head"><h2 id="if-suppliers-title">Danh sách Nhà cung cấp được chấp thuận</h2></div>
          <div class="table-wrap" id="if-suppliers-wrap">
            <table class="data-table">
              <thead><tr><th>Nhà cung cấp</th><th>MST</th></tr></thead>
              <tbody>${d.suppliers.length ? d.suppliers.map(function (s) {
                return html`<tr><td><div class="cell-main">${s.name}</div></td><td class="mono">${s.taxCode}</td></tr>`;
              }) : html`<tr><td colspan="2" class="empty-rows">Chưa có nhà cung cấp nào được chấp thuận.</td></tr>`}</tbody>
            </table>
          </div>
        </section>
        <section class="card" aria-labelledby="if-title">
          <div class="card-head"><h2 id="if-title">Hóa đơn đầu vào</h2></div>
          <div class="filters">
            <input class="input input-sm search" id="if-search" type="search" data-input="if-search" aria-label="Tìm hóa đơn" placeholder="Tìm số hóa đơn, tên hoặc MST nhà cung cấp…" autocomplete="off" value="${st.q}">
            <div class="dates">
              <label for="if-from">Từ ngày</label>
              <input class="input input-sm" id="if-from" type="date" data-change="if-filter" data-key="from" value="${st.from}">
              <label for="if-to">Đến ngày</label>
              <input class="input input-sm" id="if-to" type="date" data-change="if-filter" data-key="to" value="${st.to}">
            </div>
          </div>
          <div class="table-wrap" id="if-wrap">
            <table class="data-table" style="min-width: 700px">
              <thead><tr><th class="check-cell"><span hidden>Chọn</span></th><th>Số hóa đơn</th><th>Nhà cung cấp</th><th>Ngày lập</th><th class="num">Tổng tiền</th><th>Trạng thái</th></tr></thead>
              <tbody>${rows.length ? rows : html`<tr><td colspan="6" class="empty-rows">${q ? 'Không có hóa đơn phù hợp với bộ lọc.' : 'Không có hóa đơn trong khoảng ngày đã chọn.'}</td></tr>`}</tbody>
            </table>
          </div>
          <div class="table-foot"><span>Hiển thị ${items.length} hóa đơn</span></div>
        </section>
        ${ifHistoryHtml(d)}`;
    },
    renderBar: function () {
      var items = ifSelected();
      if (!items.length) return '';
      var total = items.reduce(function (s, i) { return s + i.amountIncVat; }, 0);
      return html`<section class="selection-bar" aria-label="Hóa đơn đã chọn">
        <div class="sel-info"><strong>Đã chọn ${items.length} hóa đơn</strong>
          <button type="button" class="text-button" data-act="if-clear" style="margin-left: 0.6rem">Bỏ chọn</button></div>
        <div class="sel-right">
          <div class="sel-total"><span>Tổng giá trị hóa đơn</span><strong>${vn(total)} <small>VND</small></strong></div>
          <button type="button" class="btn btn-primary" data-act="if-open">Gửi yêu cầu tài trợ</button>
        </div>
      </section>`;
    },
    actions: {
      'if-search': function (el) { invf.state.q = el.value; App.paint(); },
      'if-filter': function (el) { invf.state[el.getAttribute('data-key')] = el.value; invf.state.selected = {}; App.paint(); App.refresh(); },
      'if-toggle': function (el) {
        var id = el.getAttribute('data-id');
        if (el.checked) invf.state.selected[id] = true; else delete invf.state.selected[id];
        App.paint();
      },
      'if-clear': function () { invf.state.selected = {}; App.paint(); },
      'if-open': function () {
        var items = ifSelected();
        invf.state.confirm = {
          step: 'confirm', items: items, total: items.reduce(function (s, i) { return s + i.amountIncVat; }, 0),
          available: invf.data.limit.available, packages: invf.data.packages, tenorDays: invf.data.packages[0].tenorDays,
          sending: false, error: '', result: null
        };
        App.openDialog({ render: ifDialogHtml, locked: function () { return invf.state.confirm && invf.state.confirm.sending; } });
      },
      'if-package': function (el) { invf.state.confirm.tenorDays = Number(el.value); App.paintDialog(); },
      'if-send': function () {
        var c = invf.state.confirm;
        c.sending = true;
        c.error = '';
        App.paintDialog();
        api.createIfRequest(c.items.map(function (i) { return i.id; }), c.tenorDays).then(function (result) {
          c.sending = false;
          c.step = 'done';
          c.result = result;
          invf.state.selected = {};
          App.paintDialog();
          App.refresh();
        }).catch(function (error) {
          c.sending = false;
          c.error = error.code === 'INVOICE_ALREADY_REQUESTED' ? 'Có hóa đơn đã gửi yêu cầu. Vui lòng đóng cửa sổ và chọn lại hóa đơn.'
            : error.code === 'INVOICE_TOO_OLD' ? 'Có hóa đơn đã quá 90 ngày kể từ ngày hóa đơn. Vui lòng đóng cửa sổ và chọn lại hóa đơn.'
            : error.code === 'SUPPLIER_NOT_APPROVED' ? 'Có hóa đơn của nhà cung cấp chưa nằm trong danh sách được chấp thuận. Vui lòng đóng cửa sổ và chọn lại hóa đơn.'
            : error.message;
          App.paintDialog();
          App.refresh();
        });
      },
      'if-close': function () { invf.state.confirm = null; App.closeDialog(); }
    }
  };

  var IF_NOT_APPROVED = 'Nhà cung cấp chưa nằm trong danh sách được chấp thuận';
  function supplierApproved(d, invoice) {
    return d.suppliers.some(function (s) { return s.taxCode === invoice.partyTaxCode; });
  }

  function ifHistoryHtml(d) {
    var rows = d.requests.map(function (r) {
      var status = SALE_REQUEST_STATUS[r.status];
      return html`<tr>
        <td class="mono strong">${r.id}</td>
        <td class="mono nowrap">${fmt.vnDateTime(r.submittedAt)}</td>
        <td>${r.supplierNames.map(function (name) { return html`<div>${name}</div>`; })}</td>
        <td class="num">${r.invoiceCount}</td>
        <td class="num strong">${vn(r.totalAmount)}</td>
        <td class="nowrap">${r.tenorDays ? r.tenorDays + ' Ngày' : '—'}</td>
        <td class="num">${r.expectedFee == null ? '—' : vn(r.expectedFee)}</td>
        <td><span class="tag ${status.cls}">${status.label}</span></td>
      </tr>`;
    });
    return html`<section class="card" aria-labelledby="if-history-title">
      <div class="card-head"><h2 id="if-history-title">Lịch sử yêu cầu</h2></div>
      <div class="table-wrap" id="if-history-wrap">
        <table class="data-table" style="min-width: 860px">
          <thead><tr><th>Mã yêu cầu</th><th>Ngày gửi</th><th>Nhà cung cấp</th><th class="num">Số hóa đơn</th><th class="num">Tổng giá trị hóa đơn</th><th>Gói</th><th class="num">Phí dịch vụ dự kiến</th><th>Trạng thái</th></tr></thead>
          <tbody>${rows.length ? rows : html`<tr><td colspan="8" class="empty-rows">Chưa có yêu cầu tài trợ nào.</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
  }

  function ifPackage(c) { return c.packages.find(function (p) { return p.tenorDays === c.tenorDays; }) || c.packages[0]; }
  // Phí = tổng giá trị hóa đơn × mức phí, làm tròn nửa lên đến đồng. feeRateBp tính theo phần vạn.
  function ifFee(amount, feeRateBp) { return Math.floor((amount * feeRateBp + 5000) / 10000); }
  function ifRateText(feeRateBp) { return String(feeRateBp / 100).replace('.', ',') + '%'; }

  function ifSelected() {
    if (!invf.data) return [];
    return invf.data.invoices.filter(function (i) { return invf.state.selected[i.id]; });
  }

  function ifDialogHtml() {
    var c = invf.state.confirm;
    if (!c) return '';
    if (c.step === 'done') {
      return html`<div class="modal-body center">
        ${checkIcon()}
        <h2 id="dialog-title">Đã gửi yêu cầu</h2>
        <p>Đã gửi yêu cầu tài trợ ${c.result.id} tới Advance.</p>
        <button type="button" class="btn btn-primary btn-block" data-act="if-close" data-autofocus>Đóng</button>
      </div>`;
    }
    return html`<div class="modal-body">
      <div class="eyebrow">Tài trợ hóa đơn</div>
      <h2 id="dialog-title">Xác nhận yêu cầu tài trợ</h2>
      <dl class="receipt">
        ${c.items.map(function (i) { return html`<div><dt>${i.number} · ${i.partyName}</dt><dd class="mono nowrap">${vn(i.amountIncVat)} VND</dd></div>`; })}
        <div class="receipt-total"><dt>Tổng (gồm VAT)</dt><dd class="mono nowrap">${vn(c.total)} VND</dd></div>
      </dl>
      <div class="field">
        <label class="field-label" for="if-package">Gói</label>
        <select class="input" id="if-package" data-change="if-package" ${c.sending ? App.raw('disabled') : ''}>
          ${c.packages.map(function (p) { return html`<option value="${p.tenorDays}" ${p.tenorDays === c.tenorDays ? App.raw('selected') : ''}>${p.tenorDays} Ngày</option>`; })}
        </select>
      </div>
      <dl class="receipt">
        <div><dt>Mức phí (đã gồm VAT 10%)</dt><dd class="mono">${ifRateText(ifPackage(c).feeRateBp)}</dd></div>
        <div class="receipt-total"><dt>Phí dịch vụ dự kiến (VND, đã bao gồm VAT)</dt><dd class="mono nowrap">${vn(ifFee(c.total, ifPackage(c).feeRateBp))} VND</dd></div>
      </dl>
      <p>Hạn mức Tài trợ hóa đơn còn lại: <strong class="mono">${vn(c.available)} VND</strong></p>
      ${c.error && html`<p class="banner banner-danger" role="alert">${c.error}</p>`}
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-act="if-close" ${c.sending ? App.raw('disabled') : ''}>Quay lại</button>
        <button type="button" class="btn btn-primary" data-act="if-send" data-autofocus ${c.sending ? App.raw('disabled') : ''}>${c.sending ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>
      </div>
    </div>`;
  }

  /* ================================================================== Tài trợ lương: tạo yêu cầu chi lương */
  var PF_ERRORS = {
    FILE_TYPE_INVALID: 'Bảng lương phải là tệp .xlsx, .xls hoặc .csv.',
    AMOUNT_OVER_LIMIT: 'Tổng số tiền chi lương vượt quá hạn mức Tài trợ lương còn lại.',
    PAYROLL_FILE_ALREADY_USED: 'Bảng lương này đã được gửi. Vui lòng đóng cửa sổ và tạo yêu cầu mới.'
  };

  var pf = App.views['payroll-financing'] = {
    mode: 'portal', nav: 'payroll-financing',
    state: { flow: null },
    reset: function () { this.state = { flow: null }; },
    enter: function () { this.state.flow = null; },
    load: function () {
      return Promise.all([api.getPfRequests(), api.getOverview(), api.getPfPackages()]).then(function (r) {
        return { requests: r[0].items, limit: r[1].limits.find(function (l) { return l.product === 'PF'; }), packages: r[2].packages };
      });
    },
    render: function () {
      var d = this.data;
      if (!d) return html`<div class="page-head"><h1>Tài trợ lương</h1></div>${loadingCard()}`;
      var rows = d.requests.map(function (r) {
        var status = SALE_REQUEST_STATUS[r.status];
        return html`<tr>
          <td class="mono strong">${r.id}</td>
          <td class="mono nowrap">${fmt.vnDateTime(r.submittedAt)}</td>
          <td>${r.fileName}</td>
          <td class="num">${r.employeeCount}</td>
          <td class="num strong">${vn(r.totalAmount)}</td>
          <td class="nowrap">${r.tenorDays} Ngày</td>
          <td class="num">${vn(r.expectedFee)}</td>
          <td><span class="tag ${status.cls}">${status.label}</span></td>
        </tr>`;
      });
      return html`<div class="page-head"><h1>Tài trợ lương</h1>
          <button type="button" class="btn btn-primary" data-act="pf-open">Tạo yêu cầu chi lương</button></div>
        <section class="card" aria-labelledby="pf-history-title">
          <div class="card-head"><h2 id="pf-history-title">Lịch sử yêu cầu</h2></div>
          <div class="table-wrap" id="pf-history-wrap">
            <table class="data-table" style="min-width: 860px">
              <thead><tr><th>Mã yêu cầu</th><th>Ngày gửi</th><th>Bảng lương</th><th class="num">Số nhân viên</th><th class="num">Tổng số tiền chi lương</th><th>Gói</th><th class="num">Phí dịch vụ dự kiến</th><th>Trạng thái</th></tr></thead>
              <tbody>${rows.length ? rows : html`<tr><td colspan="8" class="empty-rows">Chưa có yêu cầu chi lương nào.</td></tr>`}</tbody>
            </table>
          </div>
        </section>`;
    },
    actions: {
      'pf-open': function () {
        pf.state.flow = {
          step: 'upload', file: null, uploading: false, error: '', packages: pf.data.packages,
          tenorDays: pf.data.packages[0].tenorDays, available: pf.data.limit.available, sending: false, result: null
        };
        App.openDialog({ render: pfDialogHtml, locked: function () { var f = pf.state.flow; return f && (f.sending || f.uploading); } });
      },
      'pf-file': function (el) {
        var picked = el.files && el.files[0];
        if (picked) pfUpload({ fileName: picked.name, fileSize: picked.size });
      },
      'pf-sample': function () { pfUpload({ fileName: 'Bang-luong-thang-11-2026.xlsx', fileSize: 18432 }); },
      'pf-clear': function () { pf.state.flow.file = null; pf.state.flow.error = ''; App.paintDialog(); },
      'pf-next': function () {
        var f = pf.state.flow;
        f.error = f.file.totalAmount > f.available ? PF_ERRORS.AMOUNT_OVER_LIMIT : '';
        f.step = 'confirm';
        App.paintDialog();
      },
      'pf-back': function () { pf.state.flow.step = 'upload'; pf.state.flow.error = ''; App.paintDialog(); },
      'pf-package': function (el) { pf.state.flow.tenorDays = Number(el.value); App.paintDialog(); },
      'pf-send': function () {
        var f = pf.state.flow;
        f.sending = true;
        f.error = '';
        App.paintDialog();
        api.createPfRequest(f.file.fileId, f.tenorDays).then(function (result) {
          f.sending = false;
          f.step = 'done';
          f.result = result;
          App.paintDialog();
          App.refresh();
        }).catch(function (error) {
          f.sending = false;
          f.error = PF_ERRORS[error.code] || error.message;
          App.paintDialog();
        });
      },
      'pf-close': function () { pf.state.flow = null; App.closeDialog(); }
    }
  };

  function pfUpload(meta) {
    var f = pf.state.flow;
    f.uploading = true;
    f.error = '';
    App.paintDialog();
    api.uploadPayrollFile(meta).then(function (file) {
      f.uploading = false;
      f.file = file;
      App.paintDialog();
    }).catch(function (error) {
      f.uploading = false;
      f.error = PF_ERRORS[error.code] || error.message;
      App.paintDialog();
    });
  }

  function pfDialogHtml() {
    var f = pf.state.flow;
    if (!f) return '';
    if (f.step === 'done') {
      return html`<div class="modal-body center">
        ${checkIcon()}
        <h2 id="dialog-title">Đã gửi yêu cầu</h2>
        <p>Đã gửi yêu cầu chi lương ${f.result.id} tới Advance.</p>
        <button type="button" class="btn btn-primary btn-block" data-act="pf-close" data-autofocus>Đóng</button>
      </div>`;
    }
    if (f.step === 'confirm') {
      var pack = ifPackage(f);
      return html`<div class="modal-body">
        <div class="eyebrow">Tài trợ lương</div>
        <h2 id="dialog-title">Xác nhận yêu cầu chi lương</h2>
        <dl class="receipt">
          <div><dt>Bảng lương</dt><dd>${f.file.fileName}</dd></div>
          <div><dt>Số nhân viên</dt><dd class="mono">${f.file.employeeCount}</dd></div>
          <div class="receipt-total"><dt>Tổng số tiền chi lương</dt><dd class="mono nowrap">${vn(f.file.totalAmount)} VND</dd></div>
        </dl>
        <div class="field">
          <label class="field-label" for="pf-package">Gói</label>
          <select class="input" id="pf-package" data-change="pf-package" ${f.sending ? App.raw('disabled') : ''}>
            ${f.packages.map(function (p) { return html`<option value="${p.tenorDays}" ${p.tenorDays === f.tenorDays ? App.raw('selected') : ''}>${p.tenorDays} Ngày</option>`; })}
          </select>
        </div>
        <dl class="receipt">
          <div><dt>Mức phí (đã gồm VAT 10%)</dt><dd class="mono">${ifRateText(pack.feeRateBp)}</dd></div>
          <div class="receipt-total"><dt>Phí dịch vụ dự kiến (VND, đã bao gồm VAT)</dt><dd class="mono nowrap">${vn(ifFee(f.file.totalAmount, pack.feeRateBp))} VND</dd></div>
        </dl>
        <p>Hạn mức Tài trợ lương còn lại: <strong class="mono">${vn(f.available)} VND</strong></p>
        ${f.error && html`<p class="banner banner-danger" role="alert">${f.error}</p>`}
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-act="pf-back" ${f.sending ? App.raw('disabled') : ''}>Quay lại</button>
          <button type="button" class="btn btn-primary" data-act="pf-send" data-autofocus ${f.sending || f.file.totalAmount > f.available ? App.raw('disabled') : ''}>${f.sending ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>
        </div>
      </div>`;
    }
    return html`<div class="modal-body">
      <div class="eyebrow">Tài trợ lương</div>
      <h2 id="dialog-title">Tạo yêu cầu chi lương</h2>
      ${f.file ? html`<dl class="facts box">
          <div><dt>Bảng lương</dt><dd>${f.file.fileName}</dd></div>
          <div><dt>Số nhân viên</dt><dd class="mono">${f.file.employeeCount}</dd></div>
          <div><dt>Tổng số tiền chi lương</dt><dd class="mono">${vn(f.file.totalAmount)} VND</dd></div>
        </dl>
        <div class="sale-table table-wrap" id="pf-preview-wrap">
          <table class="data-table" style="min-width: 440px">
            <thead><tr><th>STT</th><th>Họ và tên</th><th>Ngân hàng</th><th>Số tài khoản</th><th class="num">Số tiền (VND)</th></tr></thead>
            <tbody>${f.file.preview.map(function (row) {
              return html`<tr><td class="mono">${row.no}</td><td>${row.name}</td><td>${row.bankName}</td><td class="mono">${row.accountNo}</td><td class="num">${vn(row.amount)}</td></tr>`;
            })}</tbody>
            <tfoot><tr><td colspan="5">và ${f.file.moreCount} nhân viên khác</td></tr></tfoot>
          </table>
        </div>
        <button type="button" class="text-button" data-act="pf-clear">Chọn bảng lương khác</button>`
      : html`<div class="upload-box">
          <div class="upload-title">Tải lên bảng lương</div>
          <div class="upload-hint">${f.uploading ? 'Đang đọc bảng lương…' : 'Tệp .xlsx, .xls hoặc .csv'}</div>
          <div class="upload-actions">
            <label class="btn btn-primary file-pick ${f.uploading ? 'is-disabled' : ''}">Chọn tệp
              <input type="file" id="pf-file" accept=".xlsx,.xls,.csv" data-change="pf-file" ${f.uploading ? App.raw('disabled') : ''}></label>
            <button type="button" class="btn btn-outline" data-act="pf-sample" ${f.uploading ? App.raw('disabled') : ''}>Dùng bảng lương mẫu</button>
          </div>
        </div>`}
      ${f.error && html`<p class="banner banner-danger" role="alert">${f.error}</p>`}
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-act="pf-close" ${f.uploading ? App.raw('disabled') : ''}>Đóng</button>
        <button type="button" class="btn btn-primary" data-act="pf-next" ${f.file ? '' : App.raw('disabled')}>Tiếp tục</button>
      </div>
    </div>`;
  }
})();
