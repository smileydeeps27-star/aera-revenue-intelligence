RI.MarketIntel = (function () {
  const INDUSTRIES = ['Logistics', 'CPG', 'Pharma', 'Manufacturing', 'Retail', 'Hi-Tech', 'Financial Services', 'Automotive'];
  const SENIORITIES = ['C-level', 'VP', 'Director', 'Manager'];
  const PAIN_OPTIONS = [
    { id: 'forecast_accuracy', label: 'Forecast accuracy' },
    { id: 'inventory_optimization', label: 'Inventory optimization' },
    { id: 'supplier_risk', label: 'Supplier risk' },
    { id: 'pricing', label: 'Pricing optimization' },
    { id: 'working_capital', label: 'Working capital' },
    { id: 'demand_volatility', label: 'Demand volatility' }
  ];

  let lastDiscovered = [];

  async function render() {
    const view = document.getElementById('view');
    view.innerHTML = html();
    bind();
  }

  function html() {
    return `
      <section class="page page-market-intel">
        <header class="page-header">
          <div>
            <h1>Market Intelligence</h1>
            <p class="page-sub">Account discovery contextualized to <strong>Aera Decision Intelligence</strong>. Every result names the lead Aera Skill, the value estimate, and the public intent signal that makes the deal ripe now.</p>
          </div>
        </header>

        <div class="panel mi-form-panel">
          <div class="panel-head">Campaign criteria</div>
          <form id="mi-form" class="mi-form">
            <label>
              <span class="form-label">Industry</span>
              <select id="mi-industry">
                ${INDUSTRIES.map(i => '<option value="' + i + '">' + i + '</option>').join('')}
              </select>
            </label>
            <label>
              <span class="form-label">Target persona</span>
              <input type="text" id="mi-persona" value="VP Supply Chain Planning" placeholder="e.g. VP Demand Planning" />
            </label>
            <label>
              <span class="form-label">Seniority</span>
              <select id="mi-seniority">
                ${SENIORITIES.map(s => '<option>' + s + '</option>').join('')}
              </select>
            </label>
            <label>
              <span class="form-label">Accounts to discover</span>
              <input type="number" id="mi-count" value="8" min="3" max="20" step="1" />
            </label>
            <div class="mi-pains">
              <span class="form-label">Pain points</span>
              <div class="pain-chips">
                ${PAIN_OPTIONS.map(p => '<label class="pain-chip"><input type="checkbox" value="' + p.id + '" ' + (['forecast_accuracy','inventory_optimization'].includes(p.id) ? 'checked' : '') + '/><span>' + p.label + '</span></label>').join('')}
              </div>
            </div>
            <button type="submit" class="btn btn-primary" id="mi-submit">Discover accounts</button>
          </form>
        </div>

        <div id="mi-results"></div>
      </section>`;
  }

  function bind() {
    document.getElementById('mi-form').addEventListener('submit', async e => {
      e.preventDefault();
      await discover();
    });
  }

  async function discover() {
    const industry = document.getElementById('mi-industry').value;
    const persona = document.getElementById('mi-persona').value;
    const seniority = document.getElementById('mi-seniority').value;
    const count = Math.max(1, Math.min(20, Number(document.getElementById('mi-count').value) || 8));
    const pains = Array.from(document.querySelectorAll('.pain-chips input:checked')).map(c => c.value);
    const results = document.getElementById('mi-results');
    results.innerHTML = '<div class="panel"><div class="panel-head">Discovering…</div><div class="loading">Identifying ' + count + ' real companies that match…</div></div>';
    try {
      const r = await RI.Api.post('/api/agents/discover', { industry, persona, seniority, pain_points: pains, count });
      lastDiscovered = r.accounts || [];
      results.innerHTML = resultsHtml(lastDiscovered, r.demo);
      bindResults();
    } catch (e) {
      results.innerHTML = '<div class="error-state">Discovery failed: ' + RI.escapeHTML(e.message) + '</div>';
    }
  }

  function resultsHtml(accounts, demo) {
    return `
      <div class="panel mi-results-panel">
        <div class="panel-head">
          Discovered accounts ${demo ? '<span class="chip">Demo data</span>' : '<span class="chip chip-amount">Gemini live</span>'}
        </div>
        <div class="mi-grid">
          ${accounts.map((a, i) => cardHtml(a, i)).join('')}
        </div>
      </div>`;
  }

  function cardHtml(a, i) {
    const plays = a.aera_plays || (a.primary_play ? [a.primary_play] : []);
    const signals = a.intent_signals || [];
    const painHooks = a.pain_hooks || [];
    return `
      <div class="mi-card" data-idx="${i}">
        <div class="mi-card-top">
          <div class="mi-name">${RI.escapeHTML(a.company)}</div>
          <div class="mi-bombora">Intent ${a.bombora_score || '—'}</div>
        </div>
        <div class="mi-meta">${RI.escapeHTML(a.industry)} · ${RI.formatCurrency(a.revenue)} · ${RI.formatNumber(a.headcount)} FTE · ${RI.escapeHTML(a.location || '')}</div>
        <div class="mi-summary">${RI.escapeHTML((a.summary || '').slice(0, 220))}</div>

        ${a.primary_play || a.aera_angle || a.value_estimate ? `
          <div class="mi-aera-block">
            <div class="mi-aera-label">Aera angle</div>
            ${a.primary_play ? '<div class="mi-primary-play"><span class="mi-play-chip">Lead Skill: ' + RI.escapeHTML(a.primary_play) + '</span></div>' : ''}
            ${a.aera_angle ? '<div class="mi-aera-angle">' + RI.escapeHTML(a.aera_angle) + '</div>' : ''}
            ${plays.length ? '<div class="mi-play-list">' + plays.map(p => '<span class="mi-play-pill">' + RI.escapeHTML(p) + '</span>').join('') + '</div>' : ''}
            ${a.value_estimate ? '<div class="mi-value">Value: <strong>' + RI.escapeHTML(a.value_estimate) + '</strong></div>' : ''}
          </div>` : ''}

        ${signals.length ? `
          <div class="mi-signals">
            <div class="mi-signals-label">Why now</div>
            <ul>${signals.slice(0, 3).map(s => '<li>' + RI.escapeHTML(s) + '</li>').join('')}</ul>
          </div>` : ''}

        ${painHooks.length ? `
          <div class="mi-pain-hooks">
            ${painHooks.slice(0, 2).map(h => '<div class="mi-pain-hook">' + RI.escapeHTML(h) + '</div>').join('')}
          </div>` : ''}

        <div class="mi-stakeholders">
          ${(a.stakeholders || []).slice(0, 3).map(s => `<div class="mi-sh">
            <span class="mi-sh-name">${RI.escapeHTML(s.name)}</span>
            <span class="mi-sh-title">${RI.escapeHTML(s.title || s.role || '')}</span>
            ${s.linkedin ? '<a href="' + RI.escapeHTML(s.linkedin) + '" target="_blank" rel="noopener" class="mi-sh-li">LinkedIn ↗</a>' : ''}
          </div>`).join('')}
        </div>
        <div class="mi-actions">
          <button class="btn btn-primary btn-add" data-idx="${i}">Add to pipeline</button>
        </div>
      </div>`;
  }

  function bindResults() {
    document.querySelectorAll('.btn-add').forEach(b => {
      b.addEventListener('click', async () => {
        const idx = Number(b.dataset.idx);
        const acc = lastDiscovered[idx];
        b.disabled = true;
        b.textContent = 'Adding…';
        try {
          const r = await RI.Api.post('/api/market-intel/add', { account: acc, campaign_id: 'cmp-market-intel' });
          const regionMsg = r.region ? ' · region ' + r.region.name + ' → RVP assigned' : '';
          RI.showToast((r.created ? 'Added ' : 'Already in pipeline: ') + r.account.sf_name + ' · ' + r.leads.length + ' stakeholders' + regionMsg);
          b.textContent = 'Added ✓';
          b.classList.remove('btn-primary');
          b.classList.add('btn-disabled');
        } catch (err) {
          RI.showToast('Add failed: ' + err.message, 'error');
          b.disabled = false;
          b.textContent = 'Add to pipeline';
        }
      });
    });
  }

  return { render };
})();
