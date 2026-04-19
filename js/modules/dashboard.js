RI.Dashboard = (function () {
  async function render() {
    const view = document.getElementById('view');
    view.innerHTML = '<div class="loading">Loading dashboard…</div>';
    try {
      const role = RI.Role.current();
      const userId = RI.Role.currentUserId();
      const qs = 'role=' + encodeURIComponent(role) + (userId ? '&user_id=' + encodeURIComponent(userId) : '');
      const data = await RI.Api.get('/api/dashboard/' + role + '?' + qs);
      view.innerHTML = shell(data) + viewFor(role, data) + tail(data);
      bind();
    } catch (e) {
      view.innerHTML = '<div class="error-state">Dashboard failed to load: ' + RI.escapeHTML(e.message) + '</div>';
    }
  }

  function shell(d) {
    return `
      <section class="page page-dashboard">
        <header class="page-header">
          <div>
            <h1>${headerTitle(d.role)}</h1>
            <p class="page-sub">${d.user ? 'As <strong>' + RI.escapeHTML(d.user.name) + '</strong>' : ''} · Scope: ${RI.escapeHTML(d.scopeLabel || '—')} · ${d.scopeAccountCount || 0} accounts in scope.</p>
          </div>
        </header>

        ${quarterFilterHtml(d.quarterly)}

        ${briefingPanelHtml(d)}

        <div class="tiles">
          ${(d.tiles || []).map(t => `
            <div class="tile">
              <div class="tile-label">${RI.escapeHTML(t.label)}</div>
              <div class="tile-value">${RI.escapeHTML(String(t.value))}</div>
              <div class="tile-sub">${RI.escapeHTML(t.sub || '')}</div>
            </div>`).join('')}
        </div>`;
  }

  function tail(d) {
    const stages = ['discovery', 'validation', 'proposal', 'negotiation'];
    return `
        ${quarterlyHtml(d.quarterly)}

        <div class="pipeline-strip">
          <div class="section-head">Pipeline by stage (in scope)</div>
          <div class="stages">
            ${stages.map(s => {
              const row = (d.pipelineByStage || {})[s] || { count: 0, amount: 0 };
              return `<div class="stage-cell">
                <div class="stage-name">${s}</div>
                <div class="stage-count">${row.count}</div>
                <div class="stage-amount">${RI.formatCurrency(row.amount)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>

        ${(d.forecastRisk || []).length ? `
          <div class="forecast-risk">
            <div class="section-head">Forecast risk — projected close slips > 30 days vs. SF date</div>
            <div class="list">
              ${d.forecastRisk.map(r => `
                <a class="list-row risk-row-dash" href="#/opps/${RI.escapeHTML(r.sf_id)}">
                  <span class="list-name">${RI.escapeHTML(r.sf_name)}</span>
                  <span class="chip chip-stage">${RI.escapeHTML(r.internal_stage)}</span>
                  <span class="chip chip-amount">${RI.formatCurrency(r.amount)}</span>
                  <span class="conf-chip" data-score="${r.confidence}">Conf ${r.confidence}</span>
                  <span class="delta ${r.delta > 0 ? 'delta-late' : 'delta-early'}">${r.delta > 0 ? '+' : ''}${r.delta}d</span>
                </a>`).join('')}
            </div>
          </div>` : ''}
      </section>`;
  }

  function headerTitle(role) {
    return ({
      cp: 'My pipeline',
      rvp: 'Team rollup',
      cro: 'CRO pipeline',
      ceo: 'Executive overview',
      bdr: 'BDR productivity'
    })[role] || 'Dashboard';
  }

  function viewFor(role, d) {
    if (role === 'cp') return cpBody(d);
    if (role === 'rvp') return rvpBody(d);
    if (role === 'cro') return croBody(d);
    if (role === 'ceo') return ceoBody(d);
    if (role === 'bdr') return bdrBody(d);
    return '';
  }

  function cpBody(d) {
    return `
      <div class="columns">
        <div class="col">
          <div class="section-head">Top accounts by FIRE</div>
          <div class="list">
            ${(d.topAccounts || []).map(a => `
              <a class="list-row" href="#/warmup/${RI.escapeHTML(a.sf_id)}">
                <span class="list-name">${RI.escapeHTML(a.sf_name)}</span>
                <span class="chip chip-stage">${RI.escapeHTML(a.stage)}</span>
                <span class="fire-chip" data-score="${a.fire}">FIRE ${a.fire}</span>
              </a>`).join('') || '<div class="muted">No accounts in scope.</div>'}
          </div>
        </div>
        <div class="col">
          <div class="section-head">Recent opportunities</div>
          <div class="list">
            ${(d.recentOpps || []).map(o => `
              <a class="list-row" href="#/opps/${RI.escapeHTML(o.sf_id)}">
                <span class="list-name">${RI.escapeHTML(o.sf_name)}</span>
                <span class="chip chip-stage">${RI.escapeHTML(o.internal_stage)}</span>
                <span class="chip chip-amount">${RI.formatCurrency(o.amount)}</span>
                <span class="conf-chip" data-score="${o.confidence}">Conf ${o.confidence}</span>
              </a>`).join('') || '<div class="muted">No opportunities yet.</div>'}
          </div>
        </div>
      </div>`;
  }

  function rvpBody(d) {
    const rows = d.teamRollup || [];
    return `
      <div class="section-head">Team rollup — CPs reporting to me</div>
      <div class="rollup-table-wrap">
        <table class="rollup-table">
          <thead><tr><th>Client Partner</th><th>Accounts</th><th>Open opps</th><th>Pipeline</th><th>Weighted</th><th>Avg FIRE</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td class="col-name">${RI.escapeHTML(r.name)}</td>
                <td>${r.accounts}</td>
                <td>${r.opps}</td>
                <td>${RI.formatCurrency(r.amount)}</td>
                <td>${RI.formatCurrency(Math.round(r.weighted))}</td>
                <td><span class="fire-chip" data-score="${r.avgFire}">${r.avgFire}</span></td>
              </tr>`).join('') || '<tr><td colspan="6" class="muted">No CPs on this team.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${(d.atRisk || []).length ? `
        <div class="section-head" style="margin-top:20px;">At-risk deals</div>
        <div class="list">
          ${d.atRisk.map(o => `
            <a class="list-row" href="#/opps/${RI.escapeHTML(o.sf_id)}">
              <span class="list-name">${RI.escapeHTML(o.sf_name)}</span>
              <span class="chip chip-amount">${RI.formatCurrency(o.amount)}</span>
              <span class="conf-chip" data-score="${o.confidence}">Conf ${o.confidence}</span>
              <span class="delta ${o.delta > 0 ? 'delta-late' : 'delta-early'}">${o.delta > 0 ? '+' : ''}${o.delta}d</span>
            </a>`).join('')}
        </div>` : ''}`;
  }

  function croBody(d) {
    const rows = d.rvpRollup || [];
    return `
      <div class="section-head">Pipeline by RVP</div>
      <div class="rollup-table-wrap">
        <table class="rollup-table">
          <thead><tr><th>RVP</th><th>CPs</th><th>Accounts</th><th>Open opps</th><th>Pipeline</th><th>Weighted</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td class="col-name">${RI.escapeHTML(r.name)}</td>
                <td>${r.cps}</td>
                <td>${r.accounts}</td>
                <td>${r.opps}</td>
                <td>${RI.formatCurrency(r.amount)}</td>
                <td>${RI.formatCurrency(Math.round(r.weighted))}</td>
              </tr>`).join('') || '<tr><td colspan="6" class="muted">No RVP data.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function ceoBody(d) {
    const inf = d.influenceBreakdown || {};
    const pct = inf.total_opps ? Math.round((inf.influenced_opps / inf.total_opps) * 100) : 0;
    return `
      <div class="section-head">Marketing → pipeline influence (last 60d lookback)</div>
      <div class="panel influence-panel">
        <div class="influence-bar-row">
          <div class="influence-label">Opps influenced by marketing touch</div>
          <div class="influence-bar-wrap"><div class="influence-bar" style="width:${pct}%;"></div></div>
          <div class="influence-value">${pct}%</div>
        </div>
        <div class="influence-numbers">
          <div><span>Influenced opps</span><span>${inf.influenced_opps || 0} / ${inf.total_opps || 0}</span></div>
          <div><span>Influenced amount</span><span>${RI.formatCurrency(inf.influenced_amount || 0)}</span></div>
          <div><span>Total pipeline amount</span><span>${RI.formatCurrency(inf.total_amount || 0)}</span></div>
        </div>
      </div>`;
  }

  function bdrBody(d) {
    const mix = d.activityMix || {};
    const topA = d.topAccounts || [];
    return `
      <div class="columns">
        <div class="col">
          <div class="section-head">Activity mix</div>
          <div class="list">
            ${Object.entries(mix).length ? Object.entries(mix).map(([k, v]) => `
              <div class="list-row mix-row">
                <span class="list-name">${k}</span>
                <span class="chip chip-amount">${v}</span>
              </div>`).join('') : '<div class="muted">No activity yet.</div>'}
          </div>
        </div>
        <div class="col">
          <div class="section-head">Top accounts I've touched</div>
          <div class="list">
            ${topA.length ? topA.map(a => `
              <a class="list-row" href="#/warmup/${RI.escapeHTML(a.sf_id)}">
                <span class="list-name">${RI.escapeHTML(a.sf_name)}</span>
                <span class="fire-chip" data-score="${a.fire}">FIRE ${a.fire}</span>
                <span class="chip chip-amount">${a.activities} acts</span>
              </a>`).join('') : '<div class="muted">No accounts engaged yet.</div>'}
          </div>
        </div>
      </div>`;
  }

  const QUARTER_LS_KEY = 'ri_selected_quarters';
  const STAGE_ORDER = ['negotiation', 'proposal', 'validation', 'discovery', 'closed_won', 'closed_lost'];
  const STAGE_COLORS = {
    discovery: '#c9d3e8',
    validation: '#8aa6ff',
    proposal: '#4a7aff',
    negotiation: '#2b5fff',
    closed_won: '#1b9b64',
    closed_lost: '#c73a3a'
  };

  function loadSelectedQuarters(q) {
    try {
      const raw = localStorage.getItem(QUARTER_LS_KEY);
      if (raw != null) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          // Honor an explicit empty selection; otherwise filter to known keys.
          const valid = new Set(q.buckets.map(b => b.key));
          return new Set(arr.filter(k => valid.has(k)));
        }
      }
    } catch (e) { /* fall through to default */ }
    return new Set(q.default_selected || [q.current_key]);
  }

  function saveSelectedQuarters(set) {
    try { localStorage.setItem(QUARTER_LS_KEY, JSON.stringify(Array.from(set))); } catch (e) { /* ignore */ }
  }

  const BRIEFING_LS_KEY = 'ri_briefing_cache';

  function cacheKeyFor() {
    return RI.Role.current() + ':' + (RI.Role.currentUserId() || 'default');
  }

  function loadCachedBriefing() {
    try {
      const raw = localStorage.getItem(BRIEFING_LS_KEY);
      if (!raw) return null;
      const all = JSON.parse(raw);
      return all[cacheKeyFor()] || null;
    } catch (e) { return null; }
  }

  function saveCachedBriefing(b) {
    try {
      const raw = localStorage.getItem(BRIEFING_LS_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[cacheKeyFor()] = b;
      localStorage.setItem(BRIEFING_LS_KEY, JSON.stringify(all));
    } catch (e) { /* ignore */ }
  }

  function briefingPanelHtml(d) {
    const cached = loadCachedBriefing();
    const roleTitle = ({ cp: 'My book', rvp: 'Team', cro: 'Org', ceo: 'Executive', bdr: 'Outbound' })[d.role] || 'Briefing';
    if (!cached) {
      return `
        <div class="briefing-panel briefing-empty">
          <div class="briefing-head">
            <div>
              <div class="briefing-label">Executive briefing</div>
              <div class="briefing-sub">AI summary of the quarter, ranked risks with reasoning, suggested mitigations, and momentum to amplify.</div>
            </div>
            <button id="btn-gen-briefing" class="btn btn-primary">Generate ${RI.escapeHTML(roleTitle)} briefing</button>
          </div>
        </div>`;
    }
    return briefingRendered(cached);
  }

  function briefingRendered(b) {
    const staleMs = Date.now() - new Date(b.generated_at).getTime();
    const staleMin = Math.round(staleMs / 60000);
    return `
      <div class="briefing-panel">
        <div class="briefing-head">
          <div>
            <div class="briefing-label">Executive briefing</div>
            <div class="briefing-meta">${RI.escapeHTML(b.user_name ? 'As ' + b.user_name : b.role.toUpperCase())} · ${(b.selected_quarters || []).length ? b.selected_quarters.join(', ') : 'all quarters'} · generated ${staleMin < 1 ? 'just now' : staleMin + ' min ago'}</div>
          </div>
          <button id="btn-gen-briefing" class="btn btn-secondary">Regenerate</button>
        </div>

        <div class="briefing-summary">${RI.escapeHTML(b.summary)}</div>

        <div class="briefing-kpis">
          <div><span>Open pipeline</span><strong>${RI.formatCurrency(b.totals.open_amount)}</strong><em>${b.totals.open_count} opps</em></div>
          <div><span>Commit ≥70</span><strong>${RI.formatCurrency(b.totals.commit)}</strong></div>
          <div><span>Best case ≥40</span><strong>${RI.formatCurrency(b.totals.best_case)}</strong></div>
          <div><span>Weighted</span><strong>${RI.formatCurrency(Math.round(b.totals.weighted))}</strong></div>
          <div><span>Won / Lost</span><strong>${b.totals.won_count} / ${b.totals.lost_count}</strong></div>
          <div><span>Active / Dormant</span><strong>${b.active_accounts} / ${b.dormant_accounts}</strong></div>
          ${b.historical_win_rate != null ? `<div><span>Historical win rate</span><strong>${b.historical_win_rate}%</strong></div>` : ''}
        </div>

        <div class="briefing-grid">
          <div class="briefing-col briefing-risks">
            <div class="section-head">Top risks <span class="count">${(b.risks || []).length}</span></div>
            ${(b.risks || []).length ? b.risks.map(r => `
              <a class="briefing-card risk-card-ai" href="#/opps/${RI.escapeHTML(r.opp_id)}">
                <div class="briefing-card-head">
                  <span class="briefing-name">${RI.escapeHTML(r.opp_name)}</span>
                  <span class="briefing-sev" title="Severity score">${r.severity}</span>
                </div>
                <div class="briefing-card-meta">${RI.formatCurrency(r.amount)} · ${RI.escapeHTML(r.internal_stage)} · Conf ${r.confidence} · Δ ${(r.delta_days || 0) >= 0 ? '+' : ''}${r.delta_days || 0}d</div>
                <ul class="briefing-reasons">
                  ${(r.reasoning || []).slice(0, 3).map(x => '<li>' + RI.escapeHTML(x) + '</li>').join('')}
                </ul>
              </a>`).join('') : '<div class="muted briefing-empty-col">No risks surfaced.</div>'}
          </div>

          <div class="briefing-col briefing-mitigations">
            <div class="section-head">Mitigations</div>
            ${(b.mitigations || []).length ? b.mitigations.map(m => `
              <div class="briefing-card mitigation-card">
                <a href="#/opps/${RI.escapeHTML(m.opp_id)}" class="briefing-name">${RI.escapeHTML(m.opp_name)}</a>
                <ul class="briefing-actions">
                  ${(m.actions || []).map(x => '<li>' + RI.escapeHTML(x) + '</li>').join('')}
                </ul>
              </div>`).join('') : '<div class="muted briefing-empty-col">—</div>'}
          </div>

          <div class="briefing-col briefing-momentum">
            <div class="section-head">Momentum <span class="count">${(b.momentum || []).length}</span></div>
            ${(b.momentum || []).length ? b.momentum.map(m => `
              <a class="briefing-card momentum-card" href="#/opps/${RI.escapeHTML(m.opp_id)}">
                <div class="briefing-card-head">
                  <span class="briefing-name">${RI.escapeHTML(m.opp_name)}</span>
                  <span class="conf-chip score-hi">${m.confidence}</span>
                </div>
                <div class="briefing-card-meta">${RI.formatCurrency(m.amount)} · ${RI.escapeHTML(m.internal_stage)}</div>
                <ul class="briefing-reasons">
                  ${(m.reasoning || []).slice(0, 2).map(x => '<li>' + RI.escapeHTML(x) + '</li>').join('')}
                </ul>
              </a>`).join('') : '<div class="muted briefing-empty-col">Quiet week.</div>'}
          </div>
        </div>
      </div>`;
  }

  function quarterFilterHtml(q) {
    if (!q || !q.buckets) return '';
    const selected = loadSelectedQuarters(q);
    const selectedBuckets = q.buckets.filter(b => selected.has(b.key));
    const totals = selectedBuckets.reduce(
      (acc, b) => ({ count: acc.count + b.count, amount: acc.amount + b.amount, weighted: acc.weighted + b.weighted }),
      { count: 0, amount: 0, weighted: 0 }
    );

    return `
      <div class="q-filter-bar">
        <div class="q-filter">
          <span class="q-filter-label">Quarters</span>
          ${q.buckets.map(b => `
            <label class="q-chip ${selected.has(b.key) ? 'is-on' : ''} ${b.is_current ? 'is-current' : ''} ${b.is_past ? 'is-past' : ''}" data-key="${RI.escapeHTML(b.key)}">
              <input type="checkbox" class="q-chip-input" value="${RI.escapeHTML(b.key)}" ${selected.has(b.key) ? 'checked' : ''}/>
              <span class="q-chip-text">${RI.escapeHTML(b.label)}</span>
              ${b.count ? '<span class="q-chip-count">' + b.count + '</span>' : ''}
            </label>`).join('')}
          <div class="q-filter-spacer"></div>
          <button type="button" class="q-filter-action" data-action="all">All</button>
          <button type="button" class="q-filter-action" data-action="reset">Reset</button>
          <button type="button" class="q-filter-action" data-action="none">Clear</button>
        </div>
        <div class="q-filter-summary">
          <span class="q-sum-label">Selected</span>
          <span class="q-sum-count">${totals.count} opps</span>
          <span class="q-sum-amount">${RI.formatCurrency(totals.amount)}</span>
          <span class="q-sum-weighted">weighted ${RI.formatCurrency(totals.weighted)}</span>
        </div>
      </div>`;
  }

  function quarterlyHtml(q) {
    if (!q || !q.buckets) return '';
    const selected = loadSelectedQuarters(q);
    const selectedBuckets = q.buckets.filter(b => selected.has(b.key));

    return `
      <div class="quarterly-strip">
        <div class="section-head">Quarterly forecast — by projected close</div>
        <div class="quarters" data-count="${selectedBuckets.length}">
          ${selectedBuckets.length === 0
            ? '<div class="muted" style="padding:18px;">No quarters selected — pick one or more at the top of the page.</div>'
            : selectedBuckets.map(cellHtml).join('')}
        </div>
        <div class="q-legend">
          ${['discovery','validation','proposal','negotiation','closed_won'].map(s => '<span class="q-legend-item"><span class="qseg qseg-swatch" style="background:' + STAGE_COLORS[s] + '"></span>' + s + '</span>').join('')}
        </div>
      </div>`;
  }

  function cellHtml(b) {
    const total = Math.max(1, b.amount);
    const segments = STAGE_ORDER.map(s => {
      const v = b.stage_mix[s] || 0;
      if (!v) return '';
      const pct = (v / total) * 100;
      return '<span class="qseg" style="width:' + pct.toFixed(1) + '%; background:' + STAGE_COLORS[s] + ';" title="' + s + ' ' + RI.formatCurrency(v) + '"></span>';
    }).join('');
    const cls = [
      'quarter-cell',
      b.is_current ? 'is-current' : '',
      b.is_past ? 'is-past' : '',
      b.count === 0 ? 'is-empty' : ''
    ].filter(Boolean).join(' ');
    return `
      <div class="${cls}">
        <div class="q-head">
          <span class="q-label">${RI.escapeHTML(b.label)}</span>
          ${b.is_current ? '<span class="q-current-chip">Now</span>' : ''}
        </div>
        <div class="q-count">${b.count}<span class="q-count-sub"> opps</span></div>
        <div class="q-amount">${RI.formatCurrency(b.amount)}</div>
        <div class="q-weighted">Weighted ${RI.formatCurrency(b.weighted)}</div>
        <div class="q-mix">${segments || '<span class="qseg qseg-empty"></span>'}</div>
        ${b.won_amount ? '<div class="q-won">Won ' + RI.formatCurrency(b.won_amount) + '</div>' : ''}
      </div>`;
  }

  function bind() {
    document.querySelectorAll('.fire-chip, .conf-chip').forEach(el => {
      const score = Number(el.dataset.score || 0);
      if (score >= 70) el.classList.add('score-hi');
      else if (score >= 45) el.classList.add('score-mid');
      else el.classList.add('score-lo');
    });

    document.querySelectorAll('.q-chip-input').forEach(input => {
      input.addEventListener('change', () => {
        const raw = localStorage.getItem(QUARTER_LS_KEY);
        const current = new Set();
        try { (JSON.parse(raw || '[]') || []).forEach(k => current.add(k)); } catch (e) { /* ignore */ }
        // If storage is empty, initialize from what's currently checked so we don't start empty
        if (current.size === 0) {
          document.querySelectorAll('.q-chip-input:checked').forEach(i => current.add(i.value));
        }
        if (input.checked) current.add(input.value);
        else current.delete(input.value);
        saveSelectedQuarters(current);
        render();
      });
    });

    const briefBtn = document.getElementById('btn-gen-briefing');
    briefBtn && briefBtn.addEventListener('click', async () => {
      briefBtn.disabled = true;
      const original = briefBtn.textContent;
      briefBtn.textContent = 'Generating…';
      try {
        const raw = localStorage.getItem(QUARTER_LS_KEY);
        let selected_quarters = null;
        try { selected_quarters = raw ? JSON.parse(raw) : null; } catch (e) { selected_quarters = null; }
        const b = await RI.Api.post('/api/agents/executive-briefing/' + RI.Role.current(), {
          user_id: RI.Role.currentUserId(),
          selected_quarters
        });
        saveCachedBriefing(b);
        render();
      } catch (e) {
        RI.showToast('Briefing failed: ' + e.message, 'error');
        briefBtn.disabled = false;
        briefBtn.textContent = original;
      }
    });

    document.querySelectorAll('.q-filter-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const allChips = Array.from(document.querySelectorAll('.q-chip-input'));
        let next = new Set();
        if (btn.dataset.action === 'all') next = new Set(allChips.map(i => i.value));
        else if (btn.dataset.action === 'none') next = new Set();
        else if (btn.dataset.action === 'reset') {
          try { localStorage.removeItem(QUARTER_LS_KEY); } catch (e) { /* ignore */ }
          render();
          return;
        }
        saveSelectedQuarters(next);
        render();
      });
    });
  }

  return { render };
})();
