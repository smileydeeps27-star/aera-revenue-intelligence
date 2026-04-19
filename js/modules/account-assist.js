RI.AccountAssist = (function () {
  let currentPlan = null;
  let dirty = false;

  async function render(params) {
    const view = document.getElementById('view');
    const sfId = params.id;
    try {
      const account = await RI.Api.get('/api/accounts/' + sfId);
      view.innerHTML = shellHtml(account);
      bind(account);
      if (account.account_plan_id) {
        try {
          const plan = await RI.Api.get('/api/account_plans/' + account.account_plan_id);
          currentPlan = plan;
          dirty = false;
          renderPlan(plan);
        } catch (e) { /* plan ref stale; let user regenerate */ }
      }
    } catch (e) {
      view.innerHTML = '<div class="error-state">Failed to load account: ' + RI.escapeHTML(e.message) + '</div>';
    }
  }

  function shellHtml(a) {
    return `
      <section class="page page-assist">
        <header class="page-header">
          <div>
            <a href="#/warmup" class="link-back">← Back to warm-up</a>
            <h1>${RI.escapeHTML(a.sf_name)} — Account Plan</h1>
            <p class="page-sub">${RI.escapeHTML(a.sf_industry)} · ${RI.formatCurrency(a.sf_annual_revenue)} revenue · ${RI.formatNumber(a.sf_employees)} employees</p>
          </div>
          <div class="header-actions">
            <button id="btn-save-plan" class="btn btn-primary" disabled>Save plan</button>
            <button id="btn-generate-external" class="btn btn-primary">Generate via Account Plan Generator</button>
            <button id="btn-generate" class="btn btn-secondary">Regenerate (embedded)</button>
          </div>
        </header>

        <div id="progress-panel" class="progress-panel" style="display:none;">
          <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
          <div class="progress-label" id="progress-label">Starting…</div>
        </div>

        <div id="plan-container" class="plan-container empty">
          <div class="empty-state">
            <div class="empty-icon">∴</div>
            <div class="empty-title">No account plan yet</div>
            <div class="empty-sub">Click <em>Regenerate</em> to run the 4-call Aera Account Plan Agent (overview · whitespace · stakeholders · 10-30-60).</div>
          </div>
        </div>
      </section>`;
  }

  function bind(account) {
    document.getElementById('btn-generate').addEventListener('click', () => generate(account));
    document.getElementById('btn-save-plan').addEventListener('click', () => savePlan());
    document.getElementById('btn-generate-external').addEventListener('click', () => generateExternal(account));
  }

  function mapIndustry(i) {
    if (!i) return '';
    const map = {
      'CPG': 'CPG / FMCG', 'FMCG': 'CPG / FMCG', 'CPG / FMCG': 'CPG / FMCG',
      'Manufacturing': 'Manufacturing', 'Retail': 'Retail',
      'Pharmaceuticals': 'Pharmaceuticals', 'Pharma': 'Pharmaceuticals',
      'Hi-Tech': 'Hi-Tech', 'Technology': 'Hi-Tech',
      'Financial Services': 'Financial Services', 'Energy': 'Energy',
      'Automotive': 'Automotive', 'Chemicals': 'Chemicals',
      'Healthcare': 'Healthcare', 'Telecommunications': 'Telecommunications',
      'Aerospace & Defense': 'Aerospace & Defense', 'Aerospace': 'Aerospace & Defense'
    };
    return map[i] || '';
  }

  function mapRevenueBand(n) {
    if (!n || typeof n !== 'number') return '';
    if (n >= 50e9) return '$50B+';
    if (n >= 20e9) return '$20B - $50B';
    if (n >= 5e9)  return '$5B - $20B';
    if (n >= 1e9)  return '$1B - $5B';
    if (n >= 500e6) return '$500M - $1B';
    return '';
  }

  function generateExternal(account) {
    const base = 'https://account-plan-generator-production.up.railway.app/';
    const params = new URLSearchParams();
    params.set('company', account.sf_name || '');
    const ind = mapIndustry(account.sf_industry);
    if (ind) params.set('industry', ind);
    const rev = mapRevenueBand(account.sf_annual_revenue);
    if (rev) params.set('revenue', rev);
    params.set('autostart', '1');
    window.open(base + '?' + params.toString(), '_blank', 'noopener');
    RI.showToast('Opening Account Plan Generator for ' + (account.sf_name || 'account') + '…');
  }

  async function generate(account) {
    if (dirty && !confirm('You have unsaved changes. Regenerate anyway and lose them?')) return;
    const btn = document.getElementById('btn-generate');
    const panel = document.getElementById('progress-panel');
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('progress-label');
    btn.disabled = true;
    panel.style.display = 'block';
    fill.style.width = '0%';
    label.textContent = 'Starting…';

    try {
      await RI.Api.sse('/api/agents/account-plan', {
        company_name: account.sf_name,
        industry: account.sf_industry,
        revenue: RI.formatCurrency(account.sf_annual_revenue),
        sf_account_id: account.sf_id,
        demo: RI.AppStore.get('aiMode') === 'demo'
      }, {
        progress: (p) => {
          const pct = Math.round((p.current / p.total) * 100);
          fill.style.width = pct + '%';
          label.textContent = 'Call ' + Math.min(p.current + 1, p.total) + ' of ' + p.total + ' — ' + p.phase;
        },
        done: (d) => {
          currentPlan = d.plan;
          dirty = false;
          renderPlan(d.plan);
          RI.showToast('Account plan generated');
        },
        error: (err) => { RI.showToast('Plan generation failed: ' + (err.message || 'unknown'), 'error'); }
      });
    } catch (e) {
      RI.showToast('Failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      panel.style.display = 'none';
    }
  }

  async function savePlan() {
    if (!currentPlan || !currentPlan.id) return;
    const btn = document.getElementById('btn-save-plan');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await RI.Api.put('/api/store/account_plans/' + encodeURIComponent(currentPlan.id), currentPlan);
      dirty = false;
      btn.textContent = 'Saved ✓';
      setTimeout(() => {
        btn.textContent = 'Save plan';
        btn.disabled = true;
      }, 1500);
      RI.showToast('Plan saved');
    } catch (e) {
      RI.showToast('Save failed: ' + e.message, 'error');
      btn.textContent = 'Save plan';
      btn.disabled = false;
    }
  }

  function markDirty() {
    if (!dirty) {
      dirty = true;
      const btn = document.getElementById('btn-save-plan');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save plan';
      }
    }
  }

  function setByPath(obj, pathStr, value) {
    const parts = pathStr.split('.');
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const m = key.match(/^(.+)\[(\d+)\]$/);
      if (m) {
        const [, arr, idxStr] = m;
        node[arr] = node[arr] || [];
        const idx = Number(idxStr);
        node[arr][idx] = node[arr][idx] || {};
        node = node[arr][idx];
      } else {
        node[key] = node[key] || {};
        node = node[key];
      }
    }
    const last = parts[parts.length - 1];
    const m2 = last.match(/^(.+)\[(\d+)\]$/);
    if (m2) {
      const [, arr, idxStr] = m2;
      node[arr] = node[arr] || [];
      node[arr][Number(idxStr)] = value;
    } else {
      node[last] = value;
    }
  }

  // An inline-editable span. The data-path lets us update currentPlan by key path on blur/input.
  function editable(value, pathStr, extraClass = '') {
    const safe = RI.escapeHTML(value == null ? '' : value);
    return '<span class="ap-edit ' + extraClass + '" contenteditable="true" data-path="' + RI.escapeHTML(pathStr) + '" spellcheck="false">' + safe + '</span>';
  }

  function renderPlan(plan) {
    const c = document.getElementById('plan-container');
    c.classList.remove('empty');
    c.innerHTML = planHtml(plan);
    const tabs = c.querySelectorAll('.plan-tab');
    const panes = c.querySelectorAll('.plan-pane');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      panes.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      c.querySelector('[data-pane="' + t.dataset.tab + '"]').classList.add('active');
    }));
    // Wire editable fields
    c.querySelectorAll('.ap-edit').forEach(el => {
      el.addEventListener('input', () => {
        setByPath(currentPlan, el.dataset.path, el.textContent);
        markDirty();
      });
      el.addEventListener('blur', () => {
        // Collapse whitespace on blur
        const trimmed = el.textContent.replace(/\s+/g, ' ').trim();
        if (trimmed !== el.textContent) {
          el.textContent = trimmed;
          setByPath(currentPlan, el.dataset.path, trimmed);
        }
      });
    });
  }

  function planHtml(p) {
    const o = p.overview || {};
    return `
      ${p.valueHypothesis ? `
        <div class="executive-pitch">
          <div class="pitch-label">Executive pitch</div>
          <div class="pitch-text">"${editable(p.valueHypothesis.executivePitch || '', 'valueHypothesis.executivePitch', 'ap-edit-block')}"</div>
        </div>` : ''}

      <nav class="plan-tabs">
        <button class="plan-tab active" data-tab="overview">Overview</button>
        <button class="plan-tab" data-tab="news">News</button>
        <button class="plan-tab" data-tab="whitespace">White space</button>
        <button class="plan-tab" data-tab="stakeholders">Stakeholders</button>
        <button class="plan-tab" data-tab="competitive">Competitive</button>
        <button class="plan-tab" data-tab="value">Value & risks</button>
        <button class="plan-tab" data-tab="plan">10-30-60</button>
      </nav>

      <div class="plan-pane active" data-pane="overview">
        <div class="facts">
          <div><span class="k">Industry</span><span class="v">${editable(o.industry, 'overview.industry')}</span></div>
          <div><span class="k">HQ</span><span class="v">${editable(o.hqLocation, 'overview.hqLocation')}</span></div>
          <div><span class="k">Revenue</span><span class="v">${editable(o.annualRevenue, 'overview.annualRevenue')}</span></div>
          <div><span class="k">Employees</span><span class="v">${editable(o.employeeCount, 'overview.employeeCount')}</span></div>
        </div>
        ${o.keySegments && o.keySegments.length ? `<h3>Key segments</h3><ul>${o.keySegments.map((s, i) => '<li>' + editable(s, 'overview.keySegments[' + i + ']') + '</li>').join('')}</ul>` : ''}
        <h3>Growth trajectory</h3><p class="ap-edit-block-wrap">${editable(o.growthTrajectory, 'overview.growthTrajectory', 'ap-edit-block')}</p>
        <h3>Competitive landscape</h3><p class="ap-edit-block-wrap">${editable(o.competitiveLandscape, 'overview.competitiveLandscape', 'ap-edit-block')}</p>
        <h3>Implication for Aera</h3><p class="highlight ap-edit-block-wrap">${editable(o.implicationForSeller, 'overview.implicationForSeller', 'ap-edit-block')}</p>
      </div>

      <div class="plan-pane" data-pane="news">
        ${(p.news || []).map((n, i) => `
          <div class="news-item">
            <div class="news-meta"><span>${RI.escapeHTML(n.date)}</span> · <span>${RI.escapeHTML(n.source)}</span></div>
            <div class="news-headline">${editable(n.headline, 'news[' + i + '].headline')}</div>
            <div class="news-tag">${editable(n.relevanceTag, 'news[' + i + '].relevanceTag')}</div>
          </div>`).join('') || '<div class="muted">No news.</div>'}
      </div>

      <div class="plan-pane" data-pane="whitespace">
        ${(p.whiteSpace || []).map((w, i) => `
          <div class="ws-card urgency-${RI.escapeHTML(w.urgency || 'medium')}">
            <div class="ws-head">
              <div class="ws-area">${editable(w.area, 'whiteSpace[' + i + '].area')}</div>
              <div class="ws-value">${editable(w.value, 'whiteSpace[' + i + '].value')}</div>
            </div>
            <div class="ws-problem"><strong>Problem: </strong>${editable(w.problem, 'whiteSpace[' + i + '].problem', 'ap-edit-block')}</div>
            <div class="ws-play"><strong>Aera play: </strong>${editable(w.aeraPlay, 'whiteSpace[' + i + '].aeraPlay', 'ap-edit-block')}</div>
          </div>`).join('') || '<div class="muted">No white space identified.</div>'}
      </div>

      <div class="plan-pane" data-pane="stakeholders">
        ${(p.stakeholders || []).map((s, i) => `
          <div class="stk-card">
            <div class="stk-top">
              <div class="stk-name">${editable(s.name, 'stakeholders[' + i + '].name')}</div>
              <span class="chip chip-role">${RI.escapeHTML(s.roleInDeal)}</span>
            </div>
            <div class="stk-title">${editable(s.title, 'stakeholders[' + i + '].title')}</div>
            <div class="stk-notes">${editable(s.notes, 'stakeholders[' + i + '].notes', 'ap-edit-block')}</div>
            ${s.linkedin ? '<a class="stk-linkedin" href="' + RI.escapeHTML(s.linkedin) + '" target="_blank" rel="noopener">LinkedIn ↗</a>' : ''}
          </div>`).join('') || '<div class="muted">No stakeholders mapped.</div>'}
      </div>

      <div class="plan-pane" data-pane="competitive">
        ${p.competitive ? `
          <p class="ap-edit-block-wrap">${editable(p.competitive.positioning || '', 'competitive.positioning', 'ap-edit-block')}</p>
          ${(p.competitive.landscape || []).map((c, i) => `
            <div class="comp-card">
              <div class="comp-name">${editable(c.competitor, 'competitive.landscape[' + i + '].competitor')}</div>
              <div><strong>Weakness: </strong>${editable(c.weakness, 'competitive.landscape[' + i + '].weakness', 'ap-edit-block')}</div>
              <div><strong>Aera advantage: </strong>${editable(c.aeraAdvantage, 'competitive.landscape[' + i + '].aeraAdvantage', 'ap-edit-block')}</div>
            </div>`).join('')}` : '<div class="muted">No competitive data.</div>'}
      </div>

      <div class="plan-pane" data-pane="value">
        ${p.valueHypothesis ? `
          <h3>Value metrics</h3>
          <table class="value-table">
            <thead><tr><th>Metric</th><th>Impact</th><th>Confidence</th></tr></thead>
            <tbody>
              ${(p.valueHypothesis.metrics || []).map((m, i) => `
                <tr>
                  <td>${editable(m.metric, 'valueHypothesis.metrics[' + i + '].metric')}</td>
                  <td>${editable(m.impact, 'valueHypothesis.metrics[' + i + '].impact')}</td>
                  <td>${editable(m.confidence, 'valueHypothesis.metrics[' + i + '].confidence')}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : ''}
        <h3>Risks</h3>
        ${(p.risks || []).map((r, i) => `
          <div class="risk-card">
            <div class="risk-text"><strong>Risk: </strong>${editable(r.risk, 'risks[' + i + '].risk', 'ap-edit-block')}</div>
            <div class="risk-mit"><strong>Mitigation: </strong>${editable(r.mitigation, 'risks[' + i + '].mitigation', 'ap-edit-block')}</div>
          </div>`).join('') || '<div class="muted">No risks identified.</div>'}
      </div>

      <div class="plan-pane" data-pane="plan">
        ${['day10','day30','day60'].map(k => {
          const d = (p.plan && p.plan[k]) || null;
          if (!d) return '';
          return `<div class="timeline-block">
            <div class="timeline-head">${k.toUpperCase()} — ${editable(d.title, 'plan.' + k + '.title')}</div>
            <ol class="timeline-actions">
              ${(d.actions || []).map((a, i) => '<li>' + editable(a, 'plan.' + k + '.actions[' + i + ']', 'ap-edit-block') + '</li>').join('')}
            </ol>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  // Warn on navigation with unsaved changes
  window.addEventListener('hashchange', () => {
    if (dirty) {
      if (!confirm('You have unsaved changes to the account plan. Continue and lose them?')) {
        // Can't cancel hashchange cleanly; user can hit back
      } else {
        dirty = false;
      }
    }
  });

  return { render };
})();
