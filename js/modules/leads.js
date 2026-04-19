RI.Leads = (function () {
  const ROLE_CHOICES = ['unknown', 'user', 'champion', 'decision_maker', 'blocker'];
  let state = { leads: [], accounts: [], filters: { account_id: '', role_in_deal: '', active: 'all' } };

  async function render() {
    const view = document.getElementById('view');
    view.innerHTML = '<div class="loading">Loading leads…</div>';
    try {
      const [leads, accounts] = await Promise.all([
        RI.Api.get('/api/leads' + RI.Role.scopeParams()),
        RI.Api.get('/api/accounts' + RI.Role.scopeParams())
      ]);
      state.leads = leads;
      state.accounts = accounts;
      view.innerHTML = html();
      bind();
    } catch (e) {
      view.innerHTML = '<div class="error-state">Failed: ' + RI.escapeHTML(e.message) + '</div>';
    }
  }

  function filteredLeads() {
    return state.leads.filter(l => {
      if (state.filters.account_id && l.sf_account_id !== state.filters.account_id) return false;
      if (state.filters.role_in_deal && l.role_in_deal !== state.filters.role_in_deal) return false;
      if (state.filters.active === 'active' && l.active === false) return false;
      if (state.filters.active === 'inactive' && l.active !== false) return false;
      return true;
    });
  }

  function accountNameOf(id) {
    const a = state.accounts.find(x => x.sf_id === id);
    return a ? a.sf_name : (id ? 'Orphan · ' + id : 'Orphan');
  }

  function html() {
    const rows = filteredLeads();
    return `
      <section class="page page-leads">
        <header class="page-header">
          <div>
            <h1>Lead database</h1>
            <p class="page-sub">Always-on contact registry. Job-change signals automatically create orphan leads at new companies.</p>
          </div>
          <div class="header-actions">
            <span class="muted">${rows.length} of ${state.leads.length} leads</span>
          </div>
        </header>

        <div class="leads-filters">
          <select id="f-account">
            <option value="">All accounts</option>
            ${state.accounts.map(a => '<option value="' + RI.escapeHTML(a.sf_id) + '">' + RI.escapeHTML(a.sf_name) + '</option>').join('')}
          </select>
          <select id="f-role">
            <option value="">All roles</option>
            ${ROLE_CHOICES.map(r => '<option value="' + r + '">' + r + '</option>').join('')}
          </select>
          <select id="f-active">
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        <table class="leads-table">
          <thead>
            <tr>
              <th>Name</th><th>Title</th><th>Account</th>
              <th>Email</th><th>Phone</th><th>TZ</th><th>Social</th>
              <th>Role in deal</th><th>Status</th><th>Signals</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(rowHtml).join('') || '<tr><td colspan="11" class="muted" style="padding:32px;text-align:center;">No leads match the filters.</td></tr>'}
          </tbody>
        </table>
      </section>`;
  }

  function rowHtml(l) {
    const jc = (l.signals || []).filter(s => s.kind === 'job_change' || s.kind === 'job_change_from');
    const email = l.sf_email || l.email;
    const phone = l.sf_phone;
    const mobile = l.sf_mobile;
    const phoneDisplay = phone || mobile || '';
    return `
      <tr data-lead-id="${RI.escapeHTML(l.id)}" class="${l.active === false ? 'row-inactive' : ''}">
        <td class="col-name">
          ${RI.escapeHTML(l.name)}
        </td>
        <td>${RI.escapeHTML(l.title || '—')}</td>
        <td>${RI.escapeHTML(accountNameOf(l.sf_account_id))}</td>
        <td class="col-email">
          ${email ? '<a href="mailto:' + RI.escapeHTML(email) + '" class="copy-link" title="' + RI.escapeHTML(email) + '">' + RI.escapeHTML(email) + '</a><button class="copy-btn" data-copy="' + RI.escapeHTML(email) + '" title="Copy email">⧉</button>' : '<span class="muted">—</span>'}
        </td>
        <td class="col-phone">
          ${phoneDisplay ? '<a href="tel:' + RI.escapeHTML(phoneDisplay.replace(/[^+0-9]/g, '')) + '" class="copy-link" title="' + RI.escapeHTML(phoneDisplay) + '">' + RI.escapeHTML(phoneDisplay) + '</a>' +
             (mobile && mobile !== phone ? '<span class="phone-mobile" title="Mobile: ' + RI.escapeHTML(mobile) + '">📱</span>' : '') +
             '<button class="copy-btn" data-copy="' + RI.escapeHTML(phoneDisplay) + '" title="Copy phone">⧉</button>'
             : '<span class="muted">—</span>'}
        </td>
        <td class="col-tz">${RI.escapeHTML(l.timezone || '—')}</td>
        <td class="col-social">
          ${l.linkedin ? '<a href="' + RI.escapeHTML(l.linkedin) + '" target="_blank" rel="noopener" class="social-icon" title="LinkedIn"><span class="social-li">in</span></a>' : '<span class="muted">—</span>'}
        </td>
        <td>
          <select class="lead-role" data-lead-id="${RI.escapeHTML(l.id)}">
            ${ROLE_CHOICES.map(r => '<option value="' + r + '" ' + (l.role_in_deal === r ? 'selected' : '') + '>' + r + '</option>').join('')}
          </select>
        </td>
        <td>${l.active === false ? '<span class="chip chip-status">inactive</span>' : '<span class="chip chip-role">active</span>'}</td>
        <td>${jc.length ? '<span class="chip jc-chip" title="Job change detected">job change</span>' : ''}</td>
        <td class="col-actions">
          <button class="btn btn-xs btn-secondary btn-jobchange" data-lead-id="${RI.escapeHTML(l.id)}" ${l.active === false ? 'disabled' : ''}>Simulate job change</button>
        </td>
      </tr>`;
  }

  function bind() {
    document.getElementById('f-account').addEventListener('change', e => { state.filters.account_id = e.target.value; refresh(); });
    document.getElementById('f-role').addEventListener('change', e => { state.filters.role_in_deal = e.target.value; refresh(); });
    document.getElementById('f-active').addEventListener('change', e => { state.filters.active = e.target.value; refresh(); });

    document.querySelectorAll('.lead-role').forEach(sel => {
      sel.addEventListener('change', async () => {
        try {
          await RI.Api.patch('/api/leads/' + sel.dataset.leadId, { role_in_deal: sel.value });
          const lead = state.leads.find(l => l.id === sel.dataset.leadId);
          if (lead) lead.role_in_deal = sel.value;
          RI.showToast('Role updated');
        } catch (e) { RI.showToast('Update failed: ' + e.message, 'error'); }
      });
    });

    document.querySelectorAll('.btn-jobchange').forEach(b => {
      b.addEventListener('click', async () => {
        const newCompany = prompt('New company name?', 'Acme Logistics');
        if (!newCompany) return;
        const newTitle = prompt('New title?', 'VP Operations') || '';
        try {
          const r = await RI.Api.patch('/api/leads/' + b.dataset.leadId + '/job-change', { new_company: newCompany, new_title: newTitle });
          RI.showToast('Job change: ' + r.old.name + ' → ' + newCompany);
          render();
        } catch (e) { RI.showToast('Failed: ' + e.message, 'error'); }
      });
    });

    bindCopy();
  }

  function bindCopy() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const text = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(text);
          RI.showToast('Copied ' + text);
        } catch (err) {
          RI.showToast('Copy failed: ' + err.message, 'error');
        }
      });
    });
  }

  async function refresh() {
    const tbody = document.querySelector('.leads-table tbody');
    if (!tbody) return render();
    tbody.innerHTML = filteredLeads().map(rowHtml).join('') || '<tr><td colspan="11" class="muted" style="padding:32px;text-align:center;">No leads match the filters.</td></tr>';
    const countEl = document.querySelector('.header-actions .muted');
    if (countEl) countEl.textContent = filteredLeads().length + ' of ' + state.leads.length + ' leads';
    bindRows();
  }

  function bindRows() {
    document.querySelectorAll('.lead-role').forEach(sel => {
      sel.addEventListener('change', async () => {
        try {
          await RI.Api.patch('/api/leads/' + sel.dataset.leadId, { role_in_deal: sel.value });
          const lead = state.leads.find(l => l.id === sel.dataset.leadId);
          if (lead) lead.role_in_deal = sel.value;
        } catch (e) { RI.showToast('Update failed: ' + e.message, 'error'); }
      });
    });
    document.querySelectorAll('.btn-jobchange').forEach(b => {
      b.addEventListener('click', async () => {
        const newCompany = prompt('New company name?', 'Acme Logistics');
        if (!newCompany) return;
        const newTitle = prompt('New title?', 'VP Operations') || '';
        try {
          const r = await RI.Api.patch('/api/leads/' + b.dataset.leadId + '/job-change', { new_company: newCompany, new_title: newTitle });
          RI.showToast('Job change: ' + r.old.name + ' → ' + newCompany);
          render();
        } catch (e) { RI.showToast('Failed: ' + e.message, 'error'); }
      });
    });

    bindCopy();
  }

  return { render };
})();
