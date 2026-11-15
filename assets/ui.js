/* Khung giao diện dùng chung: template an toàn, định dạng, khung trang, bảng điều khiển demo, hộp thoại, điều hướng. */
(function () {
  'use strict';

  var api = window.api;
  var App = window.App = { views: {}, view: null, routeName: '', demo: null, demoOpen: false, dialog: null, navParams: null };
  var UI_KEY = 'advance-client-platform-demo/ui';

  /* ------------------------------------------------------------------ template */
  function Raw(s) { this.s = s; }
  Raw.prototype.toString = function () { return this.s; };
  function esc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function part(value) {
    if (value === null || value === undefined || value === false || value === true) return '';
    if (value instanceof Raw) return value.s;
    if (Array.isArray(value)) return value.map(part).join('');
    return esc(value);
  }
  function html(strings) {
    var out = '';
    for (var i = 0; i < strings.length; i += 1) {
      out += strings[i];
      if (i + 1 < arguments.length) out += part(arguments[i + 1]);
    }
    return new Raw(out);
  }
  function raw(s) { return new Raw(s); }

  /* ------------------------------------------------------------------ định dạng */
  var WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function group(n, sep) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, sep); }
  var fmt = {
    vn: function (n) { return group(n, '.'); },
    en: function (n) { return group(n, ','); },
    vnDate: function (iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; },
    vnDateTime: function (stamp) { return stamp ? fmt.vnDate(stamp) + ' ' + stamp.slice(11, 16) : '—'; },
    vnWeekday: function (iso) { return WEEKDAYS[new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).getDay()]; },
    enDate: function (iso) { return iso ? Number(iso.slice(8, 10)) + ' ' + MONTHS[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4) : '—'; },
    enDateTime: function (stamp) { return stamp ? fmt.enDate(stamp) + ', ' + stamp.slice(11, 16) : '—'; },
    digits: function (value) { return String(value == null ? '' : value).replace(/\D/g, ''); },
    money: function (value) { return Number(fmt.digits(value)) || 0; }
  };
  /* Ô nhập tiền: tự chèn dấu phân cách hàng nghìn khi gõ. */
  function formatMoneyInput(input, sep) {
    var n = fmt.money(input.value.slice(0, 20));
    input.value = n ? group(n, sep) : '';
  }

  /* ------------------------------------------------------------------ lưu lựa chọn giao diện */
  function uiPrefs() {
    try { return JSON.parse(window.localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function setUiPref(key, value) {
    var prefs = uiPrefs();
    prefs[key] = value;
    try { window.localStorage.setItem(UI_KEY, JSON.stringify(prefs)); } catch (e) { /* không lưu được thì bỏ qua */ }
  }
  function clearUiPrefs() {
    try { window.localStorage.removeItem(UI_KEY); } catch (e) { /* bỏ qua */ }
  }

  /* ------------------------------------------------------------------ nhãn trạng thái */
  var AUTH_STATUS = {
    NOT_ELIGIBLE: { vi: 'Chưa đủ điều kiện', en: 'Not eligible', cls: 'tag-sold' },
    NONE: { vi: 'Chưa đăng ký', en: 'Not registered', cls: '' },
    PENDING_OTP: { vi: 'Chờ xác thực OTP', en: 'Pending OTP', cls: 'tag-warn' },
    ACTIVE: { vi: 'Đang hiệu lực', en: 'Active', cls: 'tag-ok' },
    CANCEL_PENDING: { vi: 'Chờ Advance duyệt hủy', en: 'Cancel requested', cls: 'tag-warn' },
    CANCELLED: { vi: 'Đã hủy', en: 'Cancelled', cls: 'tag-sold' }
  };
  function authTag(status, lang) {
    var s = AUTH_STATUS[status] || { vi: status, en: status, cls: '' };
    return html`<span class="tag ${s.cls}">${s[lang || 'vi']}</span>`;
  }

  /* ------------------------------------------------------------------ toast */
  function toast(message, isError) {
    var box = document.getElementById('toasts');
    var item = document.createElement('div');
    item.className = 'toast-item' + (isError ? ' is-error' : '');
    item.setAttribute('role', isError ? 'alert' : 'status');
    item.textContent = message;
    box.appendChild(item);
    setTimeout(function () { item.remove(); }, 6000);
  }

  /* ------------------------------------------------------------------ khung trang */
  function brand(href) {
    return html`<a class="brand" href="#${href}" aria-label="Bridge Finance">
      <span class="brand-mark" aria-hidden="true">b</span>
      <span class="brand-name">bridge<small>FINANCE</small></span>
    </a>`;
  }

  function headerHtml() {
    var view = App.view;
    if (view.mode === 'b2b') {
      return html`<header class="app-header">
        <div class="brand-wrap">
          ${brand('b2b-loans')}
          <span class="b2b-tag">B2B</span>
          <span class="demo-controls"><span>Demo · Sample data</span><button type="button" class="text-button" data-act="demo-reset">Reset demo</button></span>
        </div>
      </header>`;
    }
    var me = App.demo && App.demo.loggedIn ? App.me : null;
    return html`<header class="app-header">
      <div class="brand-wrap">
        ${brand(view.mode === 'login' ? 'dang-nhap' : 'tong-quan')}
        <span class="demo-controls"><span>Bản demo · Dữ liệu mẫu</span><button type="button" class="text-button" data-act="demo-reset">Đặt lại demo</button></span>
      </div>
      ${view.mode === 'portal' && html`<div class="header-right">
        ${me && html`<div class="identity"><span>${me.name}</span><small>MST ${me.taxCode}</small></div>`}
        <button type="button" class="text-button" data-act="logout">Đăng xuất</button>
      </div>`}
    </header>`;
  }

  var PORTAL_NAV = [
    { route: 'tong-quan', label: 'Tổng quan' },
    { route: 'mua-ban-no', label: 'Mua bán nợ' },
    { route: 'invoice-financing', label: 'Invoice Financing' }
  ];

  function sidebarHtml() {
    var view = App.view;
    if (view.mode === 'portal') {
      return html`<aside class="sidebar"><nav aria-label="Chính">
        ${PORTAL_NAV.map(function (item) {
          return html`<a href="#${item.route}" aria-current="${view.nav === item.route ? 'page' : 'false'}">${item.label}</a>`;
        })}
      </nav></aside>`;
    }
    var pending = App.demo ? App.demo.pendingCancelRequests.length : 0;
    return html`<aside class="sidebar"><nav aria-label="Main">
      <a href="#b2b-loans" aria-current="${view.nav === 'b2b-loans' ? 'page' : 'false'}">Loans</a>
      <div class="nav-group">Debit authorization</div>
      <a href="#b2b-cancel-requests" aria-current="${view.nav === 'b2b-cancel-requests' ? 'page' : 'false'}">Cancel requests ${pending > 0 && html`<span class="count">${pending}</span>`}</a>
      <a href="#b2b-authorizations" aria-current="${view.nav === 'b2b-authorizations' ? 'page' : 'false'}">Authorizations</a>
    </nav></aside>`;
  }

  /* ------------------------------------------------------------------ bảng điều khiển demo (spec §6) */
  var DEMO_TEXT = {
    vi: {
      title: 'Thiết lập demo', show: 'Hiện', hide: 'Ẩn',
      register: 'Kết quả bước đăng ký', otp: 'Thời hạn OTP', debit: 'Kết quả lệnh trích nợ',
      registerOptions: [['ok', 'Thành công'], ['18', 'Mã 18 · Mã số doanh nghiệp không khớp'], ['19', 'Mã 19 · Tên chủ tài khoản không khớp'], ['20', 'Mã 20 · Số điện thoại không khớp'], ['24', 'Mã 24 · Tài khoản không hợp lệ'], ['99', 'Mã 99 · Hệ thống đang bận']],
      otpOptions: [['120', '2 phút'], ['15', '15 giây']],
      debitOptions: [['ok', 'Thành công'], ['balance', 'Không đủ số dư'], ['limit', 'Vượt hạn mức'], ['none', 'Không nhận được kết quả']],
      pending: 'Yêu cầu đang chờ Advance xử lý', none: 'Chưa có yêu cầu nào đang chờ.',
      cancelRequest: 'Yêu cầu hủy ủy quyền', saleRequest: 'Yêu cầu bán nợ',
      approve: 'Advance duyệt', reject: 'Advance từ chối', reason: 'Lý do từ chối (bắt buộc)', reasonMissing: 'Vui lòng nhập lý do từ chối.',
      otpRule: 'Mã OTP: nhập đủ số ký tự bất kỳ là đúng, nhập toàn số 0 là sai.',
      hintLead: 'Thông tin đăng ký đúng trên B2B:', hintAgreement: 'Mã hợp đồng', hintPhone: 'SĐT', hintAccount: 'Transaction account',
      reset: 'Đặt lại demo', other: 'Mở B2B (nội bộ Advance)', otherRoute: 'b2b-loans'
    },
    en: {
      title: 'Demo controls', show: 'Show', hide: 'Hide',
      register: 'Registration result', otp: 'OTP validity', debit: 'Debit order result',
      registerOptions: [['ok', 'Success'], ['18', 'Code 18 · Business code mismatch'], ['19', 'Code 19 · Account holder mismatch'], ['20', 'Code 20 · Phone mismatch'], ['24', 'Code 24 · Invalid account'], ['99', 'Code 99 · System busy']],
      otpOptions: [['120', '2 minutes'], ['15', '15 seconds']],
      debitOptions: [['ok', 'Success'], ['balance', 'Insufficient balance'], ['limit', 'Over limit'], ['none', 'No result']],
      pending: 'Requests waiting for Advance', none: 'No pending requests.',
      cancelRequest: 'Cancel request', saleRequest: 'Sale request',
      approve: 'Approve', reject: 'Reject', reason: 'Reject reason (required)', reasonMissing: 'Enter a reject reason.',
      otpRule: 'OTP: any code of the right length is accepted, all zeros is rejected.',
      hintLead: 'Registration details on B2B:', hintAgreement: 'Agreement number', hintPhone: 'Phone', hintAccount: 'Transaction account',
      reset: 'Reset demo', other: 'Open client portal', otherRoute: 'tong-quan'
    }
  };

  function options(list, selected) {
    return list.map(function (o) { return html`<option value="${o[0]}" ${String(selected) === o[0] ? raw('selected') : ''}>${o[1]}</option>`; });
  }

  function demoPanelHtml() {
    var demo = App.demo;
    var lang = App.view.mode === 'b2b' ? 'en' : 'vi';
    var t = DEMO_TEXT[lang];
    var num = lang === 'en' ? fmt.en : fmt.vn;
    if (!demo) return '';
    var body = '';
    if (App.demoOpen) {
      var requests = demo.pendingCancelRequests.map(function (r) {
        return html`<div class="demo-request">
          <span class="grow"><strong>${t.cancelRequest} ${r.id}</strong> · ${r.buyerName}</span>
          <input class="input" id="demo-reason-${r.id}" data-keep="1" type="text" maxlength="200" placeholder="${t.reason}" aria-label="${t.reason}">
          <button type="button" class="btn btn-primary btn-sm" data-act="demo-cancel-approve" data-id="${r.id}">${t.approve}</button>
          <button type="button" class="btn btn-outline btn-sm" data-act="demo-cancel-reject" data-id="${r.id}">${t.reject}</button>
        </div>`;
      }).concat(demo.pendingSaleRequests.map(function (r) {
        return html`<div class="demo-request">
          <span class="grow"><strong>${t.saleRequest} ${r.id}</strong> · ${r.buyerName} · ${num(r.requestedPurchasedAmount)} VND</span>
          <button type="button" class="btn btn-primary btn-sm" data-act="demo-sale-approve" data-id="${r.id}">${t.approve}</button>
          <button type="button" class="btn btn-outline btn-sm" data-act="demo-sale-reject" data-id="${r.id}">${t.reject}</button>
        </div>`;
      }));
      body = html`<div class="demo-body" id="demo-body">
        <div class="demo-row">
          <div class="demo-item"><label for="demo-register">${t.register}</label>
            <select class="select" id="demo-register" data-change="demo-setting" data-key="registerResult">${options(t.registerOptions, demo.settings.registerResult)}</select></div>
          <div class="demo-item"><label for="demo-otp">${t.otp}</label>
            <select class="select" id="demo-otp" data-change="demo-setting" data-key="otpSeconds">${options(t.otpOptions, demo.settings.otpSeconds)}</select></div>
          <div class="demo-item"><label for="demo-debit">${t.debit}</label>
            <select class="select" id="demo-debit" data-change="demo-setting" data-key="debitResult">${options(t.debitOptions, demo.settings.debitResult)}</select></div>
        </div>
        <div class="demo-list">
          <div class="demo-sub">${t.pending}</div>
          ${requests.length ? requests : html`<div class="demo-note">${t.none}</div>`}
        </div>
        <p class="demo-note">${t.otpRule} ${t.hintLead} ${t.hintAgreement} ${demo.hints.agreementNo} · ${t.hintPhone} ${demo.hints.phone} · ${demo.hints.accounts.map(function (a, i) {
          return html`${i ? ' · ' : ''}${t.hintAccount} ${a.buyerName}: ${a.bankName} ${a.accountNo}`;
        })}.</p>
        <div class="demo-foot">
          <button type="button" class="btn btn-outline btn-sm" data-act="demo-reset">${t.reset}</button>
          <a class="text-button" href="#${t.otherRoute}">${t.other}</a>
        </div>
      </div>`;
    }
    return html`<section class="demo-panel" aria-label="${t.title}">
      <button type="button" class="demo-toggle" data-act="demo-toggle" aria-expanded="${App.demoOpen ? 'true' : 'false'}" aria-controls="demo-body">${t.title}<span>${App.demoOpen ? t.hide : t.show}</span></button>
      ${body}
    </section>`;
  }

  function shellHtml() {
    var view = App.view;
    var content = view.render ? view.render() : '';
    if (view.mode === 'login') return html`${headerHtml()}<main class="login-main" id="main">${content}</main>`;
    return html`${headerHtml()}
      <div class="shell">
        ${sidebarHtml()}
        <main class="main ${view.hasBar && view.hasBar() ? 'has-bar' : ''}" id="main">
          ${demoPanelHtml()}
          ${content}
        </main>
      </div>
      ${view.renderBar ? view.renderBar() : ''}`;
  }

  /* ------------------------------------------------------------------ vẽ lại, giữ giá trị đang nhập */
  function snapshot(rootEl) {
    var snap = { fields: {}, focus: null, scroll: {} };
    rootEl.querySelectorAll('[data-keep][id]').forEach(function (el) {
      snap.fields[el.id] = { keep: el.getAttribute('data-keep'), value: el.value, checked: el.checked };
    });
    rootEl.querySelectorAll('.table-wrap[id]').forEach(function (el) { snap.scroll[el.id] = el.scrollLeft; });
    var active = document.activeElement;
    if (active && active.id && rootEl.contains(active)) {
      snap.focus = { id: active.id };
      try { snap.focus.start = active.selectionStart; snap.focus.end = active.selectionEnd; } catch (e) { /* ô không có vùng chọn */ }
    }
    return snap;
  }
  function restore(rootEl, snap) {
    Object.keys(snap.fields).forEach(function (id) {
      var el = document.getElementById(id);
      var old = snap.fields[id];
      if (!el || !rootEl.contains(el) || el.getAttribute('data-keep') !== old.keep) return;
      if (el.type === 'checkbox') el.checked = old.checked; else el.value = old.value;
    });
    Object.keys(snap.scroll).forEach(function (id) { var el = document.getElementById(id); if (el) el.scrollLeft = snap.scroll[id]; });
    if (snap.focus) {
      var target = document.getElementById(snap.focus.id);
      if (target && rootEl.contains(target) && !target.disabled) {
        target.focus({ preventScroll: true });
        try { if (snap.focus.start != null) target.setSelectionRange(snap.focus.start, snap.focus.end); } catch (e) { /* bỏ qua */ }
      }
    }
  }

  function paint() {
    if (!App.view) return;
    var rootEl = document.getElementById('app');
    document.body.dataset.surface = App.view.mode === 'login' ? 'gradient' : 'flat';
    document.documentElement.lang = App.view.mode === 'b2b' ? 'en' : 'vi';
    var snap = snapshot(rootEl);
    rootEl.innerHTML = String(shellHtml());
    restore(rootEl, snap);
    paintDialog();
    if (App.view.afterPaint) App.view.afterPaint();
  }

  /* ------------------------------------------------------------------ hộp thoại dùng chung */
  function dialogEl() { return document.getElementById('dialog'); }
  function paintDialog() {
    var el = dialogEl();
    if (!App.dialog) return;
    var snap = snapshot(el);
    el.className = 'dialog' + (App.dialog.wide ? ' dialog-wide' : '');
    el.innerHTML = String(App.dialog.render());
    restore(el, snap);
  }
  function openDialog(config) {
    App.dialog = config;
    var el = dialogEl();
    el.innerHTML = '';
    paintDialog();
    if (!el.open) { if (el.showModal) el.showModal(); else el.setAttribute('open', ''); }
    var focus = el.querySelector('[data-autofocus]');
    if (focus) focus.focus();
    el.scrollTop = 0;
  }
  function closeDialog() {
    var el = dialogEl();
    App.dialog = null;
    if (el.open) { if (el.close) el.close(); else el.removeAttribute('open'); }
    el.innerHTML = '';
  }

  /* ------------------------------------------------------------------ tải dữ liệu + điều hướng */
  var loadToken = 0;
  var refreshTimer = null;

  function refresh() {
    var view = App.view;
    var token = ++loadToken;
    var jobs = [api.demo.getState()];
    return jobs[0].then(function (demo) {
      if (token !== loadToken) return null;
      App.demo = demo;
      if (view.mode === 'portal' && !demo.loggedIn) { go('dang-nhap'); return null; }
      if (view.mode === 'login' && demo.loggedIn) { go('tong-quan'); return null; }
      var loads = [view.load ? view.load() : Promise.resolve(null)];
      if (view.mode === 'portal' && !App.me) loads.push(api.getMe().then(function (me) { App.me = me; }));
      return Promise.all(loads).then(function (results) {
        if (token !== loadToken || App.view !== view) return;
        view.data = results[0];
        view.loaded = true;
        if (view.onData) view.onData();
        paint();
      });
    }).catch(function (error) {
      if (error && error.code === 'UNAUTHENTICATED') { App.me = null; go('dang-nhap'); return; }
      toast((error && error.message) || 'Không tải được dữ liệu.', true);
    });
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { if (App.view) refresh(); }, 80);
  }

  function go(routeName, params) {
    App.navParams = params || null;
    if (window.location.hash === '#' + routeName) route(); else window.location.hash = '#' + routeName;
  }

  function route() {
    var name = window.location.hash.replace(/^#/, '');
    if (!App.views[name]) name = 'tong-quan';
    var view = App.views[name];
    if (App.view && App.view !== view && App.view.leave) App.view.leave();
    if (App.dialog) closeDialog();
    var tnc = document.getElementById('tnc');
    if (tnc && tnc.open) tnc.close();
    App.view = view;
    App.routeName = name;
    view.loaded = false;
    view.data = null;
    if (view.enter) view.enter(App.navParams || {});
    App.navParams = null;
    paint();
    window.scrollTo(0, 0);
    refresh();
  }

  /* ------------------------------------------------------------------ sự kiện */
  function findAction(name) {
    if (App.view && App.view.actions && App.view.actions[name]) return App.view.actions[name];
    return globalActions[name] || null;
  }
  function dispatch(attr, event) {
    var el = event.target.closest ? event.target.closest('[' + attr + ']') : null;
    if (!el) return;
    var fn = findAction(el.getAttribute(attr));
    if (fn) fn(el, event);
  }

  function run(promise, errorMessages) {
    return promise.catch(function (error) {
      var message = (errorMessages && errorMessages[error.code]) || error.message || 'Có lỗi xảy ra.';
      toast(message, true);
      return refresh();
    });
  }

  var globalActions = {
    'demo-toggle': function () {
      App.demoOpen = !App.demoOpen;
      setUiPref('demoOpen', App.demoOpen);
      paint();
    },
    'demo-setting': function (el) {
      var body = {};
      body[el.getAttribute('data-key')] = el.value;
      run(api.demo.updateSettings(body));
    },
    'demo-reset': function () {
      api.demo.reset().then(function () {
        clearUiPrefs();
        App.me = null;
        App.demoOpen = false;
        Object.keys(App.views).forEach(function (key) { if (App.views[key].reset) App.views[key].reset(); });
        toast(App.view.mode === 'b2b' ? 'Demo data has been reset.' : 'Đã đặt lại dữ liệu demo.');
        if (App.view.mode === 'b2b') go(App.routeName); else go('dang-nhap');
      });
    },
    'demo-cancel-approve': function (el) { run(api.b2b.approveCancelRequest(el.getAttribute('data-id')).then(refresh)); },
    'demo-cancel-reject': function (el) {
      var id = el.getAttribute('data-id');
      var input = document.getElementById('demo-reason-' + id);
      var reason = input.value.trim();
      if (!reason) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        toast(DEMO_TEXT[App.view.mode === 'b2b' ? 'en' : 'vi'].reasonMissing, true);
        return;
      }
      run(api.b2b.rejectCancelRequest(id, reason).then(refresh));
    },
    'demo-sale-approve': function (el) { run(api.demo.approveSaleRequest(el.getAttribute('data-id')).then(refresh)); },
    'demo-sale-reject': function (el) { run(api.demo.rejectSaleRequest(el.getAttribute('data-id')).then(refresh)); },
    'logout': function () { api.logout().then(function () { App.me = null; go('dang-nhap'); }); },
    'dialog-close': function () { closeDialog(); }
  };

  function start() {
    App.demoOpen = !!uiPrefs().demoOpen;
    document.addEventListener('click', function (event) { dispatch('data-act', event); });
    document.addEventListener('input', function (event) { dispatch('data-input', event); });
    document.addEventListener('change', function (event) { dispatch('data-change', event); });
    document.addEventListener('submit', function (event) {
      var form = event.target.closest('[data-submit]');
      if (!form) return;
      event.preventDefault();
      var fn = findAction(form.getAttribute('data-submit'));
      if (fn) fn(form, event);
    });
    var dialog = dialogEl();
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      if (App.dialog && App.dialog.locked && App.dialog.locked()) return;
      closeDialog();
    });
    window.addEventListener('hashchange', route);
    api.onChange(scheduleRefresh);
    api.startBackgroundSync();
    route();
  }

  App.html = html;
  App.raw = raw;
  App.fmt = fmt;
  App.formatMoneyInput = formatMoneyInput;
  App.authTag = authTag;
  App.AUTH_STATUS = AUTH_STATUS;
  App.toast = toast;
  App.paint = paint;
  App.paintDialog = paintDialog;
  App.openDialog = openDialog;
  App.closeDialog = closeDialog;
  App.refresh = refresh;
  App.go = go;
  App.run = run;
  App.uiPrefs = uiPrefs;
  App.setUiPref = setUiPref;
  App.start = start;
})();
