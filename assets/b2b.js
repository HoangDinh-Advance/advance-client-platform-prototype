/* Phần 2: B2B (sơ bộ). B1 thẻ Trích nợ tự động, B2 Yêu cầu hủy ủy quyền, B3 Ủy quyền trích nợ. */
(function () {
  'use strict';

  var App = window.App;
  var api = window.api;
  var html = App.html;
  var fmt = App.fmt;
  var en = fmt.vn;

  var ORDER_STATUS = {
    PROCESSING: { label: 'Đang xử lý', cls: 'tag-warn' },
    SUCCESS: { label: 'Thành công', cls: 'tag-ok' },
    INSUFFICIENT_BALANCE: { label: 'Số dư không đủ', cls: 'tag-danger' },
    OVER_LIMIT: { label: 'Vượt hạn mức', cls: 'tag-danger' },
    NO_RESULT: { label: 'Không nhận được kết quả', cls: 'tag-warn' }
  };
  var CANCEL_STATUS = {
    PENDING: { label: 'Chờ duyệt', cls: 'tag-warn' },
    APPROVED: { label: 'Đã duyệt', cls: 'tag-ok' },
    REJECTED: { label: 'Từ chối', cls: 'tag-danger' }
  };
  var DEFAULT_LOAN = 'DEMO-RRP-0003';

  function loadingCard() { return html`<div class="card loading">Đang tải…</div>`; }

  /* ================================================================== Loans (danh sách giao dịch Mua bán nợ) */
  var loans = App.views['b2b-loans'] = {
    mode: 'b2b', nav: 'b2b-loans',
    load: function () { return api.b2b.getLoans(); },
    render: function () {
      var d = this.data;
      if (!d) return html`<div class="page-head"><h1>Giao dịch</h1></div>${loadingCard()}`;
      var rows = d.items.map(function (l) {
        return html`<tr class="is-clickable" data-act="loan-open" data-id="${l.id}">
          <td class="mono strong nowrap">${l.id}</td>
          <td><span class="tag tag-product">Mua bán nợ</span></td>
          <td>${l.clientName}</td>
          <td>${l.buyerName}</td>
          <td class="mono">${l.invoiceNo}</td>
          <td class="num">${en(l.principalAmount)}</td>
          <td class="mono nowrap">${fmt.vnDate(l.dueDate)}</td>
          <td class="num strong">${en(l.outstanding)}</td>
          <td><button type="button" class="btn btn-outline btn-sm" data-act="loan-open" data-id="${l.id}">Chi tiết giao dịch</button></td>
        </tr>`;
      });
      return html`<div class="page-head"><h1>Giao dịch</h1></div>
        <section class="card">
          <div class="table-wrap" id="loans-wrap">
            <table class="data-table" style="min-width: 980px">
              <thead><tr><th>Mã giao dịch</th><th>Sản phẩm</th><th>Khách hàng</th><th>Bên thanh toán</th><th>Hóa đơn</th><th class="num">Giá Mua nợ (VND)</th><th>Ngày đến hạn</th><th class="num">Còn phải thu (VND)</th><th>Thao tác</th></tr></thead>
              <tbody>${rows.length ? rows : html`<tr><td colspan="9" class="empty-rows">Chưa có giao dịch nào.</td></tr>`}</tbody>
            </table>
          </div>
        </section>`;
    },
    actions: {
      'loan-open': function (el, event) {
        event.stopPropagation();
        App.go('b2b-loan', { loanId: el.getAttribute('data-id') });
      }
    }
  };

  /* ================================================================== B1. Loan details + Auto-debit card */
  var loan = App.views['b2b-loan'] = {
    mode: 'b2b', nav: 'b2b-loans',
    state: { loanId: DEFAULT_LOAN, errors: {}, confirm: null },
    reset: function () { this.state = { loanId: DEFAULT_LOAN, errors: {}, confirm: null }; },
    enter: function (params) {
      if (params.loanId) this.state.loanId = params.loanId;
      this.state.errors = {};
      this.state.confirm = null;
    },
    load: function () { return api.b2b.getLoan(this.state.loanId); },
    afterPaint: function () {
      var note = document.getElementById('debit-note');
      if (note) document.getElementById('debit-count').textContent = note.value.length;
    },
    render: function () {
      var d = this.data;
      var head = html`<div class="page-head"><h1>Chi tiết giao dịch</h1><a class="text-button back-link" href="#b2b-loans">← Giao dịch</a></div>`;
      if (!d) return html`${head}${loadingCard()}`;
      return html`${head}
        <section class="card card-pad">
          <dl class="facts">
            <div><dt>Mã giao dịch</dt><dd class="mono">${d.id}</dd></div>
            <div><dt>Sản phẩm</dt><dd>Mua bán nợ</dd></div>
            <div><dt>Khách hàng</dt><dd>${d.clientName}</dd></div>
            <div><dt>Bên thanh toán</dt><dd>${d.buyerName}</dd></div>
            <div><dt>Hóa đơn</dt><dd class="mono">${d.invoiceNo}</dd></div>
            <div><dt>Giá Mua nợ (VND)</dt><dd class="mono">${en(d.principalAmount)}</dd></div>
            <div><dt>Còn phải thu (VND)</dt><dd class="mono">${en(d.outstanding)}</dd></div>
          </dl>
        </section>
        <section class="card" aria-labelledby="schedule-title">
          <div class="card-head"><h2 id="schedule-title">Lịch thu</h2></div>
          <div class="table-wrap" id="schedule-wrap">
            <table class="data-table" style="min-width: 620px">
              <thead><tr><th>Hóa đơn</th><th>Ngày đến hạn</th><th class="num">Số tiền đến hạn (VND)</th><th class="num">Đã thu (VND)</th><th>Trạng thái</th></tr></thead>
              <tbody>${d.schedule.map(function (line) {
                var done = line.collected >= line.amount;
                return html`<tr><td class="mono">${line.invoiceNo}</td><td class="mono nowrap">${fmt.vnDate(line.dueDate)}</td><td class="num">${en(line.amount)}</td><td class="num">${en(line.collected)}</td>
                  <td><span class="tag ${done ? 'tag-ok' : line.collected > 0 ? 'tag-warn' : ''}">${done ? 'Đã thu' : line.collected > 0 ? 'Thu một phần' : 'Chưa thu'}</span></td></tr>`;
              })}</tbody>
            </table>
          </div>
        </section>
        ${App.autoDebit() && debitCardHtml(d)}`;
    },
    actions: {
      'debit-amount': function (el) {
        App.formatMoneyInput(el, '.');
        clearDebitError('amount');
      },
      'debit-note': function (el) {
        document.getElementById('debit-count').textContent = el.value.length;
      },
      'debit-open': function () {
        var d = loan.data;
        var amount = fmt.money(document.getElementById('debit-amount').value);
        var note = document.getElementById('debit-note').value.trim();
        var errors = {};
        if (!amount) errors.amount = 'Vui lòng nhập số tiền lớn hơn 0.';
        else if (amount > d.outstanding) errors.amount = 'Số tiền không được vượt quá số còn phải thu (' + en(d.outstanding) + ' VND).';
        loan.state.errors = errors;
        if (errors.amount) { App.paint(); document.getElementById('debit-amount').focus(); return; }
        loan.state.confirm = { amount: amount, note: note, sending: false, error: '' };
        App.openDialog({ render: debitConfirmHtml, locked: function () { return loan.state.confirm && loan.state.confirm.sending; } });
      },
      'debit-send': function () {
        var c = loan.state.confirm;
        c.sending = true;
        c.error = '';
        App.paintDialog();
        api.b2b.sendDebitOrder(loan.state.loanId, c.amount, c.note).then(function () {
          loan.state.confirm = null;
          loan.state.formVersion = (loan.state.formVersion || 0) + 1;
          App.closeDialog();
          App.toast('Đã gửi lệnh trích nợ.');
          App.refresh();
        }).catch(function (error) {
          c.sending = false;
          c.error = error.message;
          App.paintDialog();
          App.refresh();
        });
      },
      'debit-cancel': function () { loan.state.confirm = null; App.closeDialog(); },
      'debit-check': function (el) {
        el.disabled = true;
        App.run(api.b2b.checkDebitOrderStatus(el.getAttribute('data-id')).then(function (order) {
          App.toast('Trạng thái: ' + (ORDER_STATUS[order.status] || { label: order.status }).label + '.');
          return App.refresh();
        }));
      }
    }
  };

  function clearDebitError(key) {
    if (!loan.state.errors[key]) return;
    delete loan.state.errors[key];
    var err = document.getElementById('debit-' + key + '-err');
    if (err) err.hidden = true;
    document.getElementById('debit-' + key).setAttribute('aria-invalid', 'false');
  }

  function debitCardHtml(d) {
    var st = loan.state;
    var a = d.authorization;
    var orders = d.orders.map(function (o) {
      var status = ORDER_STATUS[o.status];
      return html`<tr>
        <td class="mono">${o.id}</td>
        <td class="mono nowrap">${fmt.vnDateTime(o.sentAt)}</td>
        <td class="num strong">${en(o.amount)}</td>
        <td><span class="tag ${status.cls}">${status.label}</span>${o.note && html`<span class="secondary">${o.note}</span>`}</td>
        <td>${o.status === 'NO_RESULT' && html`<button type="button" class="btn btn-outline btn-sm" data-act="debit-check" data-id="${o.id}">Kiểm tra trạng thái</button>`}</td>
      </tr>`;
    });
    var history = html`<div class="table-wrap" id="orders-wrap">
      <table class="data-table" style="min-width: 680px">
        <thead><tr><th>Mã lệnh</th><th>Thời điểm gửi</th><th class="num">Số tiền (VND)</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>${orders.length ? orders : html`<tr><td colspan="5" class="empty-rows">Chưa có lệnh trích nợ nào.</td></tr>`}</tbody>
      </table>
    </div>`;

    if (!a) {
      return html`<section class="card" aria-labelledby="debit-title">
        <div class="card-head"><h2 id="debit-title">Trích nợ tự động</h2></div>
        <p class="empty-state">Chưa có ủy quyền trích nợ đang hiệu lực</p>
        ${orders.length ? history : ''}
      </section>`;
    }
    var settled = d.outstanding <= 0;
    var locked = d.sendLocked || settled;
    // data-keep đổi khi số còn phải thu đổi hoặc vừa gửi lệnh: ô nhập quay về giá trị điền sẵn mới.
    var keep = d.outstanding + '-' + (st.formVersion || 0);
    return html`<section class="card" aria-labelledby="debit-title">
      <div class="card-head"><h2 id="debit-title">Trích nợ tự động</h2></div>
      <form class="card-body" data-submit="debit-open" novalidate autocomplete="off">
        <div>
          <div class="field-label">Ủy quyền trích nợ</div>
          <div class="auth-line"><span>${a.bankName}</span><span class="sep">·</span><span class="mono">${a.accountNo}</span><span class="sep">·</span><span class="mono">${a.epayRegistrationId}</span>${App.authTag(a.status)}</div>
        </div>
        <div class="debit-grid">
          <div class="field">
            <label class="field-label" for="debit-amount">Số tiền (VND)</label>
            <input class="input mono" id="debit-amount" data-keep="${keep}" data-input="debit-amount" type="text" inputmode="numeric" autocomplete="off"
              value="${d.suggestedAmount ? en(d.suggestedAmount) : ''}" aria-invalid="${st.errors.amount ? 'true' : 'false'}" ${locked ? App.raw('disabled') : ''}>
            <p class="hint">Điền sẵn số đến hạn của dòng chưa thu sớm nhất. Tối đa: số còn phải thu ${en(d.outstanding)} VND.</p>
            <p class="err" id="debit-amount-err" role="alert" ${st.errors.amount ? '' : App.raw('hidden')}>${st.errors.amount || ''}</p>
          </div>
          <div class="field">
            <label class="field-label" for="debit-note">Ghi chú <span class="opt">(không bắt buộc)</span></label>
            <input class="input" id="debit-note" data-keep="${keep}" data-input="debit-note" type="text" autocomplete="off" maxlength="100" ${locked ? App.raw('disabled') : ''}>
            <p class="hint"><span id="debit-count">0</span>/100 ký tự</p>
          </div>
        </div>
        ${d.sendLocked && html`<p class="banner banner-warn" role="status">Đang có lệnh trích nợ chưa xử lý xong hoặc chưa nhận được kết quả. Tạm khóa gửi lệnh để tránh trích hai lần.</p>`}
        ${settled && html`<p class="banner" role="status">Giao dịch này không còn khoản phải thu.</p>`}
        <div class="actions"><button type="submit" class="btn btn-primary" ${locked ? App.raw('disabled') : ''}>Gửi lệnh trích nợ</button></div>
        <p class="hint">Tiền trích về tài khoản MSB của Advance vào D+1, sau khi trừ phí EPAY. Ghi nhận thu theo số tiền gộp đã trích; phí EPAY hạch toán riêng.</p>
      </form>
      ${history}
    </section>`;
  }

  function debitConfirmHtml() {
    var c = loan.state.confirm;
    var d = loan.data;
    if (!c || !d || !d.authorization) return '';
    var a = d.authorization;
    return html`<div class="modal-body">
      <div class="eyebrow">Trích nợ tự động</div>
      <h2 id="dialog-title">Gửi lệnh trích nợ?</h2>
      <dl class="receipt">
        <div><dt>Giao dịch</dt><dd class="mono">${d.id}</dd></div>
        <div><dt>Tài khoản</dt><dd class="mono">${a.bankName} · ${a.accountNo}</dd></div>
        ${c.note && html`<div><dt>Ghi chú</dt><dd>${c.note}</dd></div>`}
        <div class="receipt-total"><dt>Số tiền</dt><dd class="mono">${en(c.amount)} VND</dd></div>
      </dl>
      ${c.error && html`<p class="banner banner-danger" role="alert">${c.error}</p>`}
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-act="debit-cancel" ${c.sending ? App.raw('disabled') : ''}>Hủy</button>
        <button type="button" class="btn btn-primary" data-act="debit-send" data-autofocus ${c.sending ? App.raw('disabled') : ''}>${c.sending ? 'Đang gửi…' : 'Gửi lệnh trích nợ'}</button>
      </div>
    </div>`;
  }

  /* ================================================================== B2. Cancel requests */
  var cancels = App.views['b2b-cancel-requests'] = {
    mode: 'b2b', nav: 'b2b-cancel-requests',
    state: { detail: null },
    reset: function () { this.state = { detail: null }; },
    enter: function () { this.state.detail = null; },
    load: function () { return api.b2b.getCancelRequests(); },
    render: function () {
      var d = this.data;
      if (!d) return html`<div class="page-head"><h1>Yêu cầu hủy ủy quyền</h1></div>${loadingCard()}`;
      var rows = d.items.map(function (r) {
        var status = CANCEL_STATUS[r.status];
        return html`<tr class="is-clickable" data-act="cancel-open" data-id="${r.id}">
          <td class="mono strong nowrap">${r.id}</td>
          <td>${r.clientName}</td>
          <td>${r.buyerName}</td>
          <td class="mono">${r.bankName} · ${r.accountNo}</td>
          <td class="mono nowrap">${fmt.vnDateTime(r.requestedAt)}</td>
          <td>${r.reason || '—'}</td>
          <td><span class="tag ${status.cls}">${status.label}</span>${r.rejectReason && html`<span class="secondary">${r.rejectReason}</span>`}</td>
          <td><button type="button" class="btn btn-outline btn-sm" data-act="cancel-open" data-id="${r.id}">${r.status === 'PENDING' ? 'Xem xét' : 'Xem'}</button></td>
        </tr>`;
      });
      return html`<div class="page-head"><h1>Yêu cầu hủy ủy quyền</h1><p>Yêu cầu hủy ủy quyền trích nợ do khách hàng gửi. Duyệt thì hệ thống gọi EPAY để hủy ủy quyền.</p></div>
        <section class="card">
          <div class="table-wrap" id="cancels-wrap">
            <table class="data-table" style="min-width: 980px">
              <thead><tr><th>Mã yêu cầu</th><th>Khách hàng</th><th>Bên thanh toán</th><th>Ngân hàng / tài khoản</th><th>Thời điểm yêu cầu</th><th>Lý do</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>${rows.length ? rows : html`<tr><td colspan="8" class="empty-rows">Chưa có yêu cầu hủy nào.</td></tr>`}</tbody>
            </table>
          </div>
        </section>`;
    },
    actions: {
      'cancel-open': function (el, event) {
        event.stopPropagation();
        var id = el.getAttribute('data-id');
        cancels.state.detail = { id: id, data: null, mode: 'view', busy: false, error: '' };
        App.openDialog({ wide: true, render: cancelDetailHtml, locked: function () { return cancels.state.detail && cancels.state.detail.busy; } });
        loadCancelDetail();
      },
      'cancel-close': function () { cancels.state.detail = null; App.closeDialog(); },
      'cancel-approve': function () {
        var st = cancels.state.detail;
        st.busy = true;
        st.error = '';
        App.paintDialog();
        api.b2b.approveCancelRequest(st.id).then(function () {
          cancels.state.detail = null;
          App.closeDialog();
          App.toast('Đã duyệt. EPAY đã hủy ủy quyền.');
          App.refresh();
        }).catch(function (error) {
          // EPAY trả lỗi: giữ CANCEL_PENDING và hiện lỗi.
          st.busy = false;
          st.error = error.message;
          App.paintDialog();
          App.refresh();
        });
      },
      'cancel-reject-start': function () {
        cancels.state.detail.mode = 'reject';
        cancels.state.detail.error = '';
        App.paintDialog();
        var box = document.getElementById('reject-reason');
        if (box) box.focus();
      },
      'cancel-reject-back': function () { cancels.state.detail.mode = 'view'; cancels.state.detail.error = ''; App.paintDialog(); },
      'cancel-reject': function () {
        var st = cancels.state.detail;
        var box = document.getElementById('reject-reason');
        var reason = box.value.trim();
        if (!reason) {
          st.error = 'Vui lòng nhập lý do từ chối.';
          App.paintDialog();
          document.getElementById('reject-reason').focus();
          return;
        }
        st.busy = true;
        st.error = '';
        App.paintDialog();
        api.b2b.rejectCancelRequest(st.id, reason).then(function () {
          cancels.state.detail = null;
          App.closeDialog();
          App.toast('Đã từ chối. Ủy quyền vẫn đang hiệu lực.');
          App.refresh();
        }).catch(function (error) {
          st.busy = false;
          st.error = error.message;
          App.paintDialog();
          App.refresh();
        });
      }
    }
  };

  function loadCancelDetail() {
    var st = cancels.state.detail;
    api.b2b.getCancelRequest(st.id).then(function (data) {
      if (cancels.state.detail !== st) return;
      st.data = data;
      App.paintDialog();
    }).catch(function (error) {
      if (cancels.state.detail !== st) return;
      st.error = error.message;
      App.paintDialog();
    });
  }

  function cancelDetailHtml() {
    var st = cancels.state.detail;
    if (!st) return '';
    var r = st.data;
    if (!r) return html`<div class="modal-body"><h2 id="dialog-title">Yêu cầu hủy ${st.id}</h2><p>${st.error || 'Đang tải…'}</p></div>`;
    var status = CANCEL_STATUS[r.status];
    var pending = r.status === 'PENDING';
    var dis = st.busy ? App.raw('disabled') : '';
    var loansRows = r.outstandingLoans.map(function (l) {
      return html`<tr><td class="mono strong">${l.id}</td><td class="num">${en(l.outstanding)}</td><td class="mono nowrap">${fmt.vnDate(l.dueDate)}</td></tr>`;
    });
    var actions;
    if (!pending) {
      actions = html`<div class="modal-actions"><button type="button" class="btn btn-outline" data-act="cancel-close" data-autofocus>Đóng</button></div>`;
    } else if (st.mode === 'reject') {
      actions = html`<div class="field" style="margin-top: 1rem">
          <label class="field-label" for="reject-reason">Lý do từ chối</label>
          <textarea class="input" id="reject-reason" data-keep="${r.id}" maxlength="300" aria-invalid="${st.error ? 'true' : 'false'}" ${dis}></textarea>
          <p class="hint">Khách hàng sẽ thấy lý do này trên cổng.</p>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-act="cancel-reject-back" ${dis}>Quay lại</button>
          <button type="button" class="btn btn-danger" data-act="cancel-reject" ${dis}>${st.busy ? 'Đang từ chối…' : 'Từ chối yêu cầu'}</button>
        </div>`;
    } else {
      actions = html`<div class="modal-actions">
        <button type="button" class="btn btn-outline" data-act="cancel-close" data-autofocus ${dis}>Đóng</button>
        <button type="button" class="btn btn-danger-outline" data-act="cancel-reject-start" ${dis}>Từ chối</button>
        <button type="button" class="btn btn-primary" data-act="cancel-approve" ${dis}>${st.busy ? 'Đang gọi EPAY…' : 'Duyệt'}</button>
      </div>`;
    }
    return html`<div class="modal-body">
      <div class="eyebrow">Ủy quyền trích nợ</div>
      <h2 id="dialog-title">Yêu cầu hủy ${r.id}</h2>
      <dl class="facts box">
        <div><dt>Khách hàng</dt><dd>${r.clientName}</dd></div>
        <div><dt>Bên thanh toán</dt><dd>${r.buyerName}</dd></div>
        <div><dt>Ngân hàng / tài khoản</dt><dd class="mono">${r.bankName} · ${r.accountNo}</dd></div>
        <div><dt>Thời điểm yêu cầu</dt><dd class="mono">${fmt.vnDateTime(r.requestedAt)}</dd></div>
        <div><dt>Lý do</dt><dd>${r.reason || '—'}</dd></div>
        <div><dt>Trạng thái</dt><dd><span class="tag ${status.cls}">${status.label}</span></dd></div>
        ${r.rejectReason && html`<div><dt>Lý do từ chối</dt><dd>${r.rejectReason}</dd></div>`}
      </dl>
      <div class="field-label" style="margin-top: 1.1rem">Giao dịch còn phải thu của Bên thanh toán này</div>
      <div class="sale-table table-wrap" id="cancel-loans-wrap" style="margin-top: 0.3rem">
        <table class="data-table" style="min-width: 420px">
          <thead><tr><th>Mã giao dịch</th><th class="num">Còn phải thu (VND)</th><th>Ngày đến hạn</th></tr></thead>
          <tbody>${loansRows.length ? loansRows : html`<tr><td colspan="3" class="empty-rows">Không có giao dịch còn phải thu của Bên thanh toán này.</td></tr>`}</tbody>
        </table>
      </div>
      ${pending && html`<p>Sau khi hủy, Advance không còn trích được tài khoản này cho các giao dịch trên.</p>`}
      ${st.error && html`<p class="banner banner-danger" role="alert">${st.error}</p>`}
      ${actions}
    </div>`;
  }

  /* ================================================================== B3. Debit authorizations (chỉ đọc) */
  App.views['b2b-authorizations'] = {
    mode: 'b2b', nav: 'b2b-authorizations',
    load: function () { return api.b2b.getAuthorizations(); },
    render: function () {
      var d = this.data;
      if (!d) return html`<div class="page-head"><h1>Ủy quyền trích nợ</h1></div>${loadingCard()}`;
      var rows = d.items.map(function (a) {
        return html`<tr>
          <td>${a.clientName}</td>
          <td>${a.buyerName}</td>
          <td class="nowrap">${a.agreementNo}</td>
          <td>${a.bankName}</td>
          <td class="mono">${a.accountNo}</td>
          <td>${a.accountName}</td>
          <td class="mono">${a.phone}</td>
          <td class="mono nowrap">${fmt.vnDateTime(a.registeredAt)}</td>
          <td class="mono">${a.epayRegistrationId || '—'}</td>
          <td>${App.authTag(a.status)}</td>
        </tr>`;
      });
      return html`<div class="page-head"><h1>Ủy quyền trích nợ</h1></div>
        <section class="card">
          <div class="table-wrap" id="auths-wrap">
            <table class="data-table" style="min-width: 1180px">
              <thead><tr><th>Khách hàng</th><th>Bên thanh toán</th><th>Mã hợp đồng</th><th>Ngân hàng</th><th>Số tài khoản</th><th>Chủ tài khoản</th><th>Số điện thoại</th><th>Thời điểm đăng ký</th><th>Mã đăng ký EPAY</th><th>Trạng thái</th></tr></thead>
              <tbody>${rows.length ? rows : html`<tr><td colspan="10" class="empty-rows">Chưa có ủy quyền trích nợ nào.</td></tr>`}</tbody>
            </table>
          </div>
        </section>`;
    }
  };

})();
