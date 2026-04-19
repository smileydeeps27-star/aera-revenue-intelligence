RI.Warmup = (function () {
  let cache = { accounts: [], users: [] };
  let filter = 'all'; // all | rvp_assigned | cp_assigned | unassigned

  async function renderList() {
    const view = document.getElementById('view');
    view.innerHTML = '<div class="loading">Loading accounts…</div>';
    try {
      const [accounts, users] = await Promise.all([
        RI.Api.get('/api/accounts' + RI.Role.scopeParams()),
        RI.Api.get('/api/users')
      ]);
      cache.accounts = accounts;
      cache.users = users;
      view.innerHTML = listHtml(accounts);
      bindList();
    } catch (e) {
      view.innerHTML = '<div class="error-state">Failed to load accounts: ' + RI.escapeHTML(e.message) + '</div>';
    }
  }

  function userName(id) {
    const u = cache.users.find(x => x.id === id);
    return u ? u.name : '—';
  }

  function filteredAccounts() {
    if (filter === 'all') return cache.accounts;
    return cache.accounts.filter(a => (a.assignment_status || 'unassigned') === filter);
  }

  function listHtml() {
    const accounts = filteredAccounts();
    const counts = cache.accounts.reduce((m, a) => { const s = a.assignment_status || 'unassigned'; m[s] = (m[s] || 0) + 1; m.all = (m.all || 0) + 1; return m; }, {});
    return `
      <section class="page page-warmup">
        <header class="page-header">
          <div>
            <h1>Warm-up tracker</h1>
            <p class="page-sub">Accounts being warmed by marketing + BDR activity. Assignment is region-driven: RVP first, then CP.</p>
          </div>
        </header>

        <div class="warmup-filters">
          ${['all','cp_assigned','rvp_assigned','unassigned'].map(f => `
            <button class="wu-filter ${filter === f ? 'active' : ''}" data-filter="${f}">
              ${filterLabel(f)} <span class="wu-filter-count">${counts[f] || 0}</span>
            </button>`).join('')}
        </div>

        <table class="warmup-table">
          <thead>
            <tr>
              <th>Account</th><th>Industry</th><th>Revenue</th>
              <th>Region</th><th>Owner</th>
              <th>FIRE</th><th>MEDPICSS</th><th>Stage</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${accounts.map(rowHtml).join('') || '<tr><td colspan="9" class="muted" style="padding:32px;text-align:center;">No accounts match the filter.</td></tr>'}
          </tbody>
        </table>
      </section>`;
  }

  function filterLabel(f) {
    return ({ all: 'All', cp_assigned: 'CP assigned', rvp_assigned: 'Needs CP', unassigned: 'Unassigned' })[f];
  }

  function rowHtml(a) {
    const filled = a.medpicss_filled != null ? a.medpicss_filled : Object.values(a.medpicss || {}).filter(v => v && v.filled).length;
    const gateOk = filled >= RI.Config.GATE_MEDPICSS && a.fire.score >= RI.Config.GATE_FIRE;
    const status = a.assignment_status || 'unassigned';
    const ownerLabel = a.owner_user_id ? userName(a.owner_user_id) : '—';
    const role = RI.Role.current();
    const canAssignCp = status === 'rvp_assigned' && (role === 'rvp' || role === 'cro' || role === 'ceo');
    return `
      <tr data-sf-id="${RI.escapeHTML(a.sf_id)}" class="status-${RI.escapeHTML(status)}">
        <td class="col-name"><a href="#/warmup/${RI.escapeHTML(a.sf_id)}">${RI.escapeHTML(a.sf_name)}</a></td>
        <td>${RI.escapeHTML(a.sf_industry || '—')}</td>
        <td>${RI.formatCurrency(a.sf_annual_revenue)}</td>
        <td>${RI.escapeHTML(a.region_id || '—')}</td>
        <td class="col-owner">
          <span class="owner-name">${RI.escapeHTML(ownerLabel)}</span>
          ${status === 'rvp_assigned' ? '<span class="chip chip-warn">needs CP</span>' : ''}
          ${status === 'unassigned' ? '<span class="chip chip-status">unassigned</span>' : ''}
        </td>
        <td><span class="fire-chip score-${scoreClass(a.fire.score)}">${a.fire.score}</span></td>
        <td>${filled}/9</td>
        <td><span class="chip chip-stage">${RI.escapeHTML(a.warmup_stage)}</span></td>
        <td class="col-actions">
          ${canAssignCp ? '<button class="btn btn-primary btn-xs btn-assign-cp" data-sf-id="' + RI.escapeHTML(a.sf_id) + '" data-owner="' + RI.escapeHTML(a.owner_user_id || '') + '">Assign CP</button>' : ''}
          <a href="#/account-assist/${RI.escapeHTML(a.sf_id)}" class="btn btn-secondary btn-xs">Plan</a>
          <button class="btn btn-xs ${gateOk ? 'btn-primary' : 'btn-disabled'}" data-spinout="${RI.escapeHTML(a.sf_id)}" ${gateOk ? '' : 'disabled'} title="${gateOk ? 'Spin out an Opportunity' : 'Gate: FIRE ≥ ' + RI.Config.GATE_FIRE + ' and MEDPICSS ≥ ' + RI.Config.GATE_MEDPICSS + '/9'}">Spin out</button>
        </td>
      </tr>`;
  }

  function scoreClass(n) { return n >= 70 ? 'hi' : n >= 45 ? 'mid' : 'lo'; }

  function bindList() {
    document.querySelectorAll('[data-spinout]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sfId = btn.dataset.spinout;
        await spinoutFlow(sfId);
      });
    });

    document.querySelectorAll('.wu-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter;
        const view = document.getElementById('view');
        view.innerHTML = listHtml();
        bindList();
      });
    });

    document.querySelectorAll('.btn-assign-cp').forEach(btn => {
      btn.addEventListener('click', () => openAssignPicker(btn));
    });
  }

  function openAssignPicker(btn) {
    const sfId = btn.dataset.sfId;
    const ownerRvpId = btn.dataset.owner;
    const cps = cache.users.filter(u => u.role === 'cp' && u.parent_id === ownerRvpId);
    if (!cps.length) { RI.showToast('No CPs report to this RVP.', 'error'); return; }

    // Remove any existing picker
    document.querySelectorAll('.cp-picker').forEach(n => n.remove());
    const picker = document.createElement('div');
    picker.className = 'cp-picker';
    picker.innerHTML = '<div class="cp-picker-head">Assign CP</div>' +
      cps.map(c => '<button class="cp-pick" data-cp="' + RI.escapeHTML(c.id) + '">' + RI.escapeHTML(c.name) + '</button>').join('');
    btn.parentElement.appendChild(picker);

    picker.querySelectorAll('.cp-pick').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await RI.Api.patch('/api/accounts/' + sfId + '/assign-cp', { cp_user_id: b.dataset.cp });
          RI.showToast('Assigned to ' + b.textContent);
          renderList();
        } catch (e) { RI.showToast('Assignment failed: ' + e.message, 'error'); }
      });
    });

    // Close on outside click
    setTimeout(() => {
      const closer = (e) => {
        if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener('click', closer); }
      };
      document.addEventListener('click', closer);
    }, 0);
  }

  async function spinoutFlow(sfId) {
    const name = prompt('Opportunity name? (e.g. "Phase 1 — Demand Sensing")');
    if (!name) return;
    const amountStr = prompt('Amount in USD? (e.g. 1200000)', '800000');
    const amount = Number(amountStr) || 800000;
    try {
      const acct = await RI.Api.get('/api/accounts/' + sfId);
      const opp = await RI.Api.post('/api/opps', {
        account_id: sfId,
        name: acct.sf_name + ' — ' + name,
        amount,
        source_plan_id: acct.account_plan_id
      });
      RI.showToast('Opportunity created: ' + opp.sf_name);
      RI.Router.go('#/opps/' + opp.sf_id);
    } catch (e) {
      RI.showToast('Spin-out failed: ' + e.message, 'error');
    }
  }

  return { renderList };
})();
