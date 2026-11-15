/* Phần 2: B2B (tiếng Anh, sơ bộ). B1 Auto-debit card, B2 Cancel requests, B3 Debit authorizations. */
(function () {
  'use strict';

  var App = window.App;
  var api = window.api;
  var html = App.html;
  var fmt = App.fmt;
  var en = fmt.en;

  var ORDER_STATUS = {
    PROCESSING: { label: 'Processing', cls: 'tag-warn' },
    SUCCESS: { label: 'Success', cls: 'tag-ok' },
    INSUFFICIENT_BALANCE: { label: 'Insufficient balance', cls: 'tag-danger' },
    OVER_LIMIT: { label: 'Over limit', cls: 'tag-danger' },
    NO_RESULT: { label: 'No result', cls: 'tag-warn' }
  };
  var CANCEL_STATUS = {
    PENDING: { label: 'Pending', cls: 'tag-warn' },
    APPROVED: { label: 'Approved', cls: 'tag-ok' },
    REJECTED: { label: 'Rejected', cls: 'tag-danger' }
  };
  var DEFAULT_LOAN = 'DEMO-RRP-0003';

  function loadingCard() { return html`<div class="card loading">Loading…</div>`; }

  /* ================================================================== Loans (danh sách giao dịch Mua bán nợ) */
  var loans = App.views['b2b-loans'] = {
    mode: 'b2b', nav: 'b2b-loans',
    load: function () { return api.b2b.getLoans(); },
    render: function () {
      var d = this.data;
      if (!d) return html`<div class="page-head"><h1>Loans</h1></div>${loadingCard()}`;
      var rows = d.items.map(function (l) {
        return html`<tr class="is-clickable" data-act="loan-open" data-id="${l.id}">
          <td class="mono strong nowrap">${l.id}</td>
          <td><span class="tag tag-product">Receivables Purchase</span></td>
          <td>${l.clientName}</td>
          <td>${l.buyerName}</td>
          <td class="mono">${l.invoiceNo}</td>
          <td class="num">${en(l.principalAmount)}</td>
          <td class="mono nowrap">${fmt.enDate(l.dueDate)}</td>
          <td class="num strong">${en(l.outstanding)}</td>
          <td><button type="button" class="btn btn-outline btn-sm" data-act="loan-open" data-id="${l.id}">Loan details</button></td>
        </tr>`;
      });
      return html`<div class="page-head"><h1>Loans</h1></div>
        <section class="card">
          <div class="table-wrap" id="loans-wrap">
            <table class="data-table" style="min-width: 980px">
              <thead><tr><th>Transaction ID</th><th>Product</th><th>Client</th><th>Buyer</th><th>Invoice</th><th class="num">Principal amount (VND)</th><th>Due date</th><th class="num">Outstanding (VND)</th><th>Action</th></tr></thead>
              <tbody>${rows.length ? rows : html`<tr><td colspan="9" class="empty-rows">No transactions.</td></tr>`}</tbody>
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
      var head = html`<div class="page-head"><h1>Loan details</h1><a class="text-button back-link" href="#b2b-loans">← Loans</a></div>`;
      if (!d) return html`${head}${loadingCard()}`;
      return html`${head}
        <section class="card card-pad">
          <dl class="facts">
            <div><dt>Transaction ID</dt><dd class="mono">${d.id}</dd></div>
            <div><dt>Product</dt><dd>Receivables Purchase</dd></div>
            <div><dt>Client</dt><dd>${d.clientName}</dd></div>
            <div><dt>Buyer</dt><dd>${d.buyerName}</dd></div>
            <div><dt>Invoice</dt><dd class="mono">${d.invoiceNo}</dd></div>
            <div><dt>Principal amount (VND)</dt><dd class="mono">${en(d.principalAmount)}</dd></div>
            <div><dt>Outstanding receivable (VND)</dt><dd class="mono">${en(d.outstanding)}</dd></div>
          </dl>
        </section>
        <section class="card" aria-labelledby="schedule-title">
          <div class="card-head"><h2 id="schedule-title">Collection schedule</h2></div>
          <div class="table-wrap" id="schedule-wrap">
            <table class="data-table" style="min-width: 620px">
              <thead><tr><th>Invoice</th><th>Due date</th><th class="num">Amount due (VND)</th><th class="num">Collected (VND)</th><th>Status</th></tr></thead>
              <tbody>${d.schedule.map(function (line) {
                var done = line.collected >= line.amount;
                return html`<tr><td class="mono">${line.invoiceNo}</td><td class="mono nowrap">${fmt.enDate(line.dueDate)}</td><td class="num">${en(line.amount)}</td><td class="num">${en(line.collected)}</td>
                  <td><span class="tag ${done ? 'tag-ok' : line.collected > 0 ? 'tag-warn' : ''}">${done ? 'Collected' : line.collected > 0 ? 'Partially collected' : 'Uncollected'}</span></td></tr>`;
              })}</tbody>
            </table>
          </div>
        </section>
        ${debitCardHtml(d)}`;
    },
    actions: {
      'debit-amount': function (el) {
        App.formatMoneyInput(el, ',');
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
        if (!amount) errors.amount = 'Enter an amount greater than 0.';
        else if (amount > d.outstanding) errors.amount = 'Amount cannot exceed the outstanding receivable (' + en(d.outstanding) + ' VND).';
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
          App.toast('Debit order sent.');
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
          App.toast('Status: ' + (ORDER_STATUS[order.status] || { label: order.status }).label + '.');
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
        <td class="mono nowrap">${fmt.enDateTime(o.sentAt)}</td>
        <td class="num strong">${en(o.amount)}</td>
        <td><span class="tag ${status.cls}">${status.label}</span>${o.note && html`<span class="secondary">${o.note}</span>`}</td>
        <td>${o.status === 'NO_RESULT' && html`<button type="button" class="btn btn-outline btn-sm" data-act="debit-check" data-id="${o.id}">Check status</button>`}</td>
      </tr>`;
    });
    var history = html`<div class="table-wrap" id="orders-wrap">
      <table class="data-table" style="min-width: 680px">
        <thead><tr><th>Transaction ID</th><th>Sent at</th><th class="num">Amount (VND)</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${orders.length ? orders : html`<tr><td colspan="5" class="empty-rows">No debit orders yet.</td></tr>`}</tbody>
      </table>
    </div>`;

    if (!a) {
      return html`<section class="card" aria-labelledby="debit-title">
        <div class="card-head"><h2 id="debit-title">Auto-debit</h2></div>
        <p class="empty-state">No active debit authorization</p>
        ${orders.length ? history : ''}
      </section>`;
    }
    var settled = d.outstanding <= 0;
    var locked = d.sendLocked || settled;
    // data-keep đổi khi số còn phải thu đổi hoặc vừa gửi lệnh: ô nhập quay về giá trị điền sẵn mới.
    var keep = d.outstanding + '-' + (st.formVersion || 0);
    return html`<section class="card" aria-labelledby="debit-title">
      <div class="card-head"><h2 id="debit-title">Auto-debit</h2></div>
      <form class="card-body" data-submit="debit-open" novalidate autocomplete="off">
        <div>
          <div class="field-label">Debit authorization</div>
          <div class="auth-line"><span>${a.bankName}</span><span class="sep">·</span><span class="mono">${a.accountNo}</span><span class="sep">·</span><span class="mono">${a.epayRegistrationId}</span>${App.authTag(a.status, 'en')}</div>
        </div>
        <div class="debit-grid">
          <div class="field">
            <label class="field-label" for="debit-amount">Amount (VND)</label>
            <input class="input mono" id="debit-amount" data-keep="${keep}" data-input="debit-amount" type="text" inputmode="numeric" autocomplete="off"
              value="${d.suggestedAmount ? en(d.suggestedAmount) : ''}" aria-invalid="${st.errors.amount ? 'true' : 'false'}" ${locked ? App.raw('disabled') : ''}>
            <p class="hint">Pre-filled with the earliest uncollected amount due. Maximum: outstanding receivable ${en(d.outstanding)} VND.</p>
            <p class="err" id="debit-amount-err" role="alert" ${st.errors.amount ? '' : App.raw('hidden')}>${st.errors.amount || ''}</p>
          </div>
          <div class="field">
            <label class="field-label" for="debit-note">Note <span class="opt">(optional)</span></label>
            <input class="input" id="debit-note" data-keep="${keep}" data-input="debit-note" type="text" autocomplete="off" maxlength="100" ${locked ? App.raw('disabled') : ''}>
            <p class="hint"><span id="debit-count">0</span>/100 characters</p>
          </div>
        </div>
        ${d.sendLocked && html`<p class="banner banner-warn" role="status">A debit order is still processing or has no result yet. Sending is locked to avoid debiting twice.</p>`}
        ${settled && html`<p class="banner" role="status">This transaction has no outstanding receivable.</p>`}
        <div class="actions"><button type="submit" class="btn btn-primary" ${locked ? App.raw('disabled') : ''}>Send debit order</button></div>
        <p class="hint">Debited funds reach Advance's MSB account on D+1, net of the EPAY fee. Record the collection at the gross amount debited; the EPAY fee is booked separately.</p>
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
      <div class="eyebrow">Auto-debit</div>
      <h2 id="dialog-title">Send debit order?</h2>
      <dl class="receipt">
        <div><dt>Transaction</dt><dd class="mono">${d.id}</dd></div>
        <div><dt>Account</dt><dd class="mono">${a.bankName} · ${a.accountNo}</dd></div>
        ${c.note && html`<div><dt>Note</dt><dd>${c.note}</dd></div>`}
        <div class="receipt-total"><dt>Amount</dt><dd class="mono">${en(c.amount)} VND</dd></div>
      </dl>
      ${c.error && html`<p class="banner banner-danger" role="alert">${c.error}</p>`}
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-act="debit-cancel" ${c.sending ? App.raw('disabled') : ''}>Cancel</button>
        <button type="button" class="btn btn-primary" data-act="debit-send" data-autofocus ${c.sending ? App.raw('disabled') : ''}>${c.sending ? 'Sending…' : 'Send debit order'}</button>
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
      if (!d) return html`<div class="page-head"><h1>Cancel requests</h1></div>${loadingCard()}`;
      var rows = d.items.map(function (r) {
        var status = CANCEL_STATUS[r.status];
        return html`<tr class="is-clickable" data-act="cancel-open" data-id="${r.id}">
          <td class="mono strong nowrap">${r.id}</td>
          <td>${r.clientName}</td>
          <td>${r.buyerName}</td>
          <td class="mono">${r.bankName} · ${r.accountNo}</td>
          <td class="mono nowrap">${fmt.enDateTime(r.requestedAt)}</td>
          <td>${r.reason || '—'}</td>
          <td><span class="tag ${status.cls}">${status.label}</span>${r.rejectReason && html`<span class="secondary">${r.rejectReason}</span>`}</td>
          <td><button type="button" class="btn btn-outline btn-sm" data-act="cancel-open" data-id="${r.id}">${r.status === 'PENDING' ? 'Review' : 'View'}</button></td>
        </tr>`;
      });
      return html`<div class="page-head"><h1>Cancel requests</h1><p>Debit authorization cancellations requested by clients. Approving calls EPAY to cancel the authorization.</p></div>
        <section class="card">
          <div class="table-wrap" id="cancels-wrap">
            <table class="data-table" style="min-width: 980px">
              <thead><tr><th>Request ID</th><th>Client</th><th>Buyer</th><th>Bank / account</th><th>Requested at</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>${rows.length ? rows : html`<tr><td colspan="8" class="empty-rows">No cancel requests.</td></tr>`}</tbody>
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
          App.toast('Approved. EPAY cancelled the authorization.');
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
          st.error = 'Enter a reason to reject this request.';
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
          App.toast('Rejected. The authorization stays active.');
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
    if (!r) return html`<div class="modal-body"><h2 id="dialog-title">Cancel request ${st.id}</h2><p>${st.error || 'Loading…'}</p></div>`;
    var status = CANCEL_STATUS[r.status];
    var pending = r.status === 'PENDING';
    var dis = st.busy ? App.raw('disabled') : '';
    var loansRows = r.outstandingLoans.map(function (l) {
      return html`<tr><td class="mono strong">${l.id}</td><td class="num">${en(l.outstanding)}</td><td class="mono nowrap">${fmt.enDate(l.dueDate)}</td></tr>`;
    });
    var actions;
    if (!pending) {
      actions = html`<div class="modal-actions"><button type="button" class="btn btn-outline" data-act="cancel-close" data-autofocus>Close</button></div>`;
    } else if (st.mode === 'reject') {
      actions = html`<div class="field" style="margin-top: 1rem">
          <label class="field-label" for="reject-reason">Reject reason</label>
          <textarea class="input" id="reject-reason" data-keep="${r.id}" maxlength="300" aria-invalid="${st.error ? 'true' : 'false'}" ${dis}></textarea>
          <p class="hint">Shown to the client on the portal.</p>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-act="cancel-reject-back" ${dis}>Back</button>
          <button type="button" class="btn btn-danger" data-act="cancel-reject" ${dis}>${st.busy ? 'Rejecting…' : 'Reject request'}</button>
        </div>`;
    } else {
      actions = html`<div class="modal-actions">
        <button type="button" class="btn btn-outline" data-act="cancel-close" data-autofocus ${dis}>Close</button>
        <button type="button" class="btn btn-danger-outline" data-act="cancel-reject-start" ${dis}>Reject</button>
        <button type="button" class="btn btn-primary" data-act="cancel-approve" ${dis}>${st.busy ? 'Calling EPAY…' : 'Approve'}</button>
      </div>`;
    }
    return html`<div class="modal-body">
      <div class="eyebrow">Debit authorization</div>
      <h2 id="dialog-title">Cancel request ${r.id}</h2>
      <dl class="facts box">
        <div><dt>Client</dt><dd>${r.clientName}</dd></div>
        <div><dt>Buyer</dt><dd>${r.buyerName}</dd></div>
        <div><dt>Bank / account</dt><dd class="mono">${r.bankName} · ${r.accountNo}</dd></div>
        <div><dt>Requested at</dt><dd class="mono">${fmt.enDateTime(r.requestedAt)}</dd></div>
        <div><dt>Reason</dt><dd>${r.reason || '—'}</dd></div>
        <div><dt>Status</dt><dd><span class="tag ${status.cls}">${status.label}</span></dd></div>
        ${r.rejectReason && html`<div><dt>Reject reason</dt><dd>${r.rejectReason}</dd></div>`}
      </dl>
      <div class="field-label" style="margin-top: 1.1rem">Outstanding transactions with this buyer</div>
      <div class="sale-table table-wrap" id="cancel-loans-wrap" style="margin-top: 0.3rem">
        <table class="data-table" style="min-width: 420px">
          <thead><tr><th>Transaction ID</th><th class="num">Outstanding (VND)</th><th>Due date</th></tr></thead>
          <tbody>${loansRows.length ? loansRows : html`<tr><td colspan="3" class="empty-rows">No outstanding transactions with this buyer.</td></tr>`}</tbody>
        </table>
      </div>
      ${pending && html`<p>After cancellation Advance can no longer debit this account for these transactions.</p>`}
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
      if (!d) return html`<div class="page-head"><h1>Debit authorizations</h1></div>${loadingCard()}`;
      var rows = d.items.map(function (a) {
        return html`<tr>
          <td>${a.clientName}</td>
          <td>${a.buyerName}</td>
          <td class="nowrap">${a.agreementNo}</td>
          <td>${a.bankName}</td>
          <td class="mono">${a.accountNo}</td>
          <td>${a.accountName}</td>
          <td class="mono">${a.phone}</td>
          <td class="mono nowrap">${fmt.enDateTime(a.registeredAt)}</td>
          <td class="mono">${a.epayRegistrationId || '—'}</td>
          <td>${App.authTag(a.status, 'en')}</td>
        </tr>`;
      });
      return html`<div class="page-head"><h1>Debit authorizations</h1></div>
        <section class="card">
          <div class="table-wrap" id="auths-wrap">
            <table class="data-table" style="min-width: 1180px">
              <thead><tr><th>Client</th><th>Buyer</th><th>Agreement number</th><th>Bank</th><th>Account</th><th>Account holder</th><th>Phone</th><th>Registered at</th><th>EPAY registration ID</th><th>Status</th></tr></thead>
              <tbody>${rows.length ? rows : html`<tr><td colspan="10" class="empty-rows">No debit authorizations.</td></tr>`}</tbody>
            </table>
          </div>
        </section>`;
    }
  };

})();
