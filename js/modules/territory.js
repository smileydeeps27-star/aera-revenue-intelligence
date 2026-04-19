RI.Territory = (function () {
  async function render() {
    const view = document.getElementById('view');
    view.innerHTML = '<div class="loading">Loading territory…</div>';
    try {
      const [rollup, accounts, users] = await Promise.all([
        RI.Api.get('/api/regions/rollup'),
        RI.Api.get('/api/accounts'),
        RI.Api.get('/api/users')
      ]);
      view.innerHTML = html(rollup, accounts, users);
      bind(accounts, users);
    } catch (e) {
      view.innerHTML = '<div class="error-state">Failed: ' + RI.escapeHTML(e.message) + '</div>';
    }
  }

  function html(regions, accounts, users) {
    const unassigned = accounts.filter(a => a.assignment_status !== 'cp_assigned');
    return `
      <section class="page page-territory">
        <header class="page-header">
          <div>
            <h1>Territory planning</h1>
            <p class="page-sub">Region definitions drive auto-assignment from Market Intel → RVP. RVPs then assign accounts to their CPs.</p>
          </div>
        </header>

        <div class="territory-grid">
          ${regions.map(r => regionCardHtml(r)).join('')}
        </div>

        <div class="panel unassigned-queue">
          <div class="panel-head">Accounts awaiting CP assignment <span class="count">${unassigned.length}</span></div>
          <p class="muted unassigned-sub">Accounts currently owned by an RVP (or unassigned) — drag across the org by picking a CP below.</p>
          <table class="rollup-table unassigned-table">
            <thead><tr><th>Account</th><th>Industry</th><th>Region</th><th>RVP</th><th>FIRE</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${unassigned.length ? unassigned.slice(0, 50).map(a => unassignedRow(a, users)).join('') : '<tr><td colspan="7" class="muted" style="padding:20px;text-align:center;">Every account has a CP. 🎉</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function regionCardHtml(r) {
    return `
      <div class="territory-card" data-region-id="${RI.escapeHTML(r.id)}">
        <div class="territory-head">
          <div>
            <div class="territory-name">${RI.escapeHTML(r.name)}</div>
            <div class="territory-desc">${RI.escapeHTML(r.description || '')}</div>
          </div>
          <div class="territory-rvp">
            <span class="territory-label">RVP</span>
            <span class="territory-rvp-name">${RI.escapeHTML(r.rvp ? r.rvp.name : '—')}</span>
          </div>
        </div>
        <div class="territory-kpis">
          <div><span>Accounts</span><strong>${r.total_accounts}</strong></div>
          <div><span>Key accounts</span><strong>${r.key_accounts}</strong></div>
          <div><span>Needs CP</span><strong class="${r.unassigned_count ? 'warn' : ''}">${r.unassigned_count}</strong></div>
          <div><span>CPs</span><strong>${r.cps.length}</strong></div>
        </div>
        <div class="territory-countries">
          <span class="territory-label">Countries</span>
          <div class="territory-chips">
            ${(r.countries || []).map(c => '<span class="territory-chip">' + RI.escapeHTML(c) + '</span>').join('')}
          </div>
        </div>
        <div class="territory-cps">
          <span class="territory-label">CPs on this team</span>
          <div class="territory-cp-list">
            ${r.cps.map(c => '<span class="territory-chip">' + RI.escapeHTML(c.name) + '</span>').join('') || '<span class="muted">No CPs yet.</span>'}
          </div>
        </div>
      </div>`;
  }

  function unassignedRow(a, users) {
    const owner = users.find(u => u.id === a.owner_user_id);
    return `
      <tr data-sf-id="${RI.escapeHTML(a.sf_id)}">
        <td class="col-name"><a href="#/warmup/${RI.escapeHTML(a.sf_id)}">${RI.escapeHTML(a.sf_name)}</a></td>
        <td>${RI.escapeHTML(a.sf_industry || '—')}</td>
        <td>${RI.escapeHTML(a.region_id || '—')}</td>
        <td>${RI.escapeHTML(owner ? owner.name : '—')}</td>
        <td><span class="fire-chip">${a.fire.score}</span></td>
        <td>${a.assignment_status === 'rvp_assigned' ? '<span class="chip chip-warn">needs CP</span>' : '<span class="chip chip-status">' + RI.escapeHTML(a.assignment_status || 'unassigned') + '</span>'}</td>
        <td class="col-actions">
          <button class="btn btn-xs btn-primary t-assign" data-sf-id="${RI.escapeHTML(a.sf_id)}" data-rvp="${RI.escapeHTML(a.owner_user_id || '')}">Assign CP</button>
        </td>
      </tr>`;
  }

  function bind(accounts, users) {
    document.querySelectorAll('.t-assign').forEach(btn => {
      btn.addEventListener('click', () => openPicker(btn, users));
    });
  }

  function openPicker(btn, users) {
    const rvpId = btn.dataset.rvp;
    const cps = users.filter(u => u.role === 'cp' && u.parent_id === rvpId);
    if (!cps.length) { RI.showToast('No CPs report to this RVP.', 'error'); return; }

    document.querySelectorAll('.cp-picker').forEach(n => n.remove());
    const picker = document.createElement('div');
    picker.className = 'cp-picker';
    picker.innerHTML = '<div class="cp-picker-head">Assign CP</div>' +
      cps.map(c => '<button class="cp-pick" data-cp="' + RI.escapeHTML(c.id) + '">' + RI.escapeHTML(c.name) + '</button>').join('');
    btn.parentElement.appendChild(picker);

    picker.querySelectorAll('.cp-pick').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await RI.Api.patch('/api/accounts/' + btn.dataset.sfId + '/assign-cp', { cp_user_id: b.dataset.cp });
          RI.showToast('Assigned to ' + b.textContent);
          render();
        } catch (e) { RI.showToast('Assignment failed: ' + e.message, 'error'); }
      });
    });

    setTimeout(() => {
      const closer = (e) => {
        if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener('click', closer); }
      };
      document.addEventListener('click', closer);
    }, 0);
  }

  return { render };
})();
