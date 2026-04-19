RI.WarmupDetail = (function () {
  const SLOTS = ['metrics', 'economic_buyer', 'decision_criteria', 'decision_process', 'paper_process', 'identify_pain', 'champion', 'competition', 'success_criteria'];
  const SLOT_LABELS = {
    metrics: 'Metrics', economic_buyer: 'Economic Buyer', decision_criteria: 'Decision Criteria',
    decision_process: 'Decision Process', paper_process: 'Paper Process', identify_pain: 'Identify Pain',
    champion: 'Champion', competition: 'Competition', success_criteria: 'Success Criteria'
  };
  const SLOT_HINT = {
    metrics: 'Baseline number + unit (e.g. "62% forecast accuracy")',
    economic_buyer: 'Lead id of the decision-maker',
    decision_criteria: 'List ≥ 2 criteria',
    decision_process: 'Describe the decision workflow',
    paper_process: 'Procurement / legal process',
    identify_pain: 'Core pain in 1–2 sentences',
    champion: 'Lead id of the active champion',
    competition: 'Name ≥ 1 competitor',
    success_criteria: 'Measurable target with a number'
  };

  const ACTIVITY_KINDS = [
    { k: 'meeting', label: 'Meeting' },
    { k: 'email_reply', label: 'Positive email reply' },
    { k: 'email_reply_negative', label: 'Negative email reply' },
    { k: 'email_sent', label: 'Email sent' },
    { k: 'bdr_call', label: 'BDR call' },
    { k: 'content_view', label: 'Content view' },
    { k: 'event_attend', label: 'Event attendance' },
    { k: 'note', label: 'Note' }
  ];

  let state = { account: null, activities: [] };

  async function render(params) {
    const view = document.getElementById('view');
    view.innerHTML = '<div class="loading">Loading account…</div>';
    try {
      const [account, activities] = await Promise.all([
        RI.Api.get('/api/accounts/' + params.id),
        RI.Api.get('/api/activities?account_id=' + encodeURIComponent(params.id))
      ]);
      state.account = account;
      state.activities = activities;
      view.innerHTML = html(account, activities);
      bind();
    } catch (e) {
      view.innerHTML = '<div class="error-state">Failed: ' + RI.escapeHTML(e.message) + '</div>';
    }
  }

  function html(a, activities) {
    const filled = a.medpicss_filled || 0;
    const gateOk = filled >= RI.Config.GATE_MEDPICSS && a.fire.score >= RI.Config.GATE_FIRE;
    return `
      <section class="page page-warmup-detail">
        <header class="page-header">
          <div>
            <a href="#/warmup" class="link-back">← Back to warm-up</a>
            <h1>${RI.escapeHTML(a.sf_name)}</h1>
            <p class="page-sub">${RI.escapeHTML(a.sf_industry)} · ${RI.formatCurrency(a.sf_annual_revenue)} · Stage <strong>${RI.escapeHTML(a.warmup_stage)}</strong></p>
          </div>
          <div class="header-actions">
            <a href="#/account-assist/${RI.escapeHTML(a.sf_id)}" class="btn btn-secondary">Open account plan</a>
            <button class="btn ${gateOk ? 'btn-primary' : 'btn-disabled'}" id="btn-spinout" ${gateOk ? '' : 'disabled'}>Spin out opportunity</button>
          </div>
        </header>

        <div class="detail-grid">
          <div class="panel fire-panel">
            <div class="panel-head">FIRE score</div>
            ${fireRadial(a.fire)}
            <div class="fire-sub">
              <div><span>Fit</span><span>${a.fire.fit}</span></div>
              <div><span>Intent</span><span>${a.fire.intent}</span></div>
              <div><span>Recency</span><span>${a.fire.recency}</span></div>
              <div><span>Engagement</span><span>${a.fire.engagement}</span></div>
            </div>
            <div class="gate-state">
              Gate: ${gateOk ? '<span class="gate-ok">✓ open</span>' : '<span class="gate-closed">closed — need FIRE ≥ ' + RI.Config.GATE_FIRE + ' and MEDPICSS ≥ ' + RI.Config.GATE_MEDPICSS + '/9</span>'}
            </div>
          </div>

          <div class="panel medpicss-panel">
            <div class="panel-head">MEDPICSS <span class="medp-count">${filled}/9</span>
              <button id="btn-suggest" class="btn btn-secondary btn-xs">AI suggest</button>
            </div>
            <ul class="medp-list">
              ${SLOTS.map(s => slotRow(s, a.medpicss[s] || {})).join('')}
            </ul>
          </div>

          <div class="panel activity-panel">
            <div class="panel-head">Log an activity</div>
            <form id="activity-form" class="activity-form">
              <select id="act-kind">
                ${ACTIVITY_KINDS.map(k => '<option value="' + k.k + '">' + k.label + '</option>').join('')}
              </select>
              <input id="act-note" type="text" placeholder="Optional note…" />
              <button type="submit" class="btn btn-primary">Log</button>
            </form>

            <div class="panel-head" style="margin-top:16px;">Timeline</div>
            <ul class="timeline-list" id="timeline">
              ${timelineHtml(activities)}
            </ul>
          </div>
        </div>
      </section>`;
  }

  function fireRadial(f) {
    const score = f.score || 0;
    const cls = score >= 70 ? 'hi' : score >= 45 ? 'mid' : 'lo';
    const deg = Math.round(score / 100 * 360);
    return `
      <div class="fire-radial score-${cls}" style="--deg:${deg}deg;">
        <div class="fire-radial-inner">
          <div class="fire-score">${score}</div>
          <div class="fire-label">FIRE</div>
        </div>
      </div>`;
  }

  function slotRow(slot, value) {
    const isFilled = value && value.filled === true;
    const errs = value && value._validation_errors;
    const note = (value && value.note) || '';
    return `
      <li class="medp-row ${isFilled ? 'is-filled' : ''}" data-slot="${slot}">
        <label class="medp-check">
          <input type="checkbox" class="medp-toggle" data-slot="${slot}" ${isFilled ? 'checked' : ''}/>
          <span>${SLOT_LABELS[slot]}</span>
        </label>
        <input type="text" class="medp-note" data-slot="${slot}" placeholder="${SLOT_HINT[slot]}" value="${RI.escapeHTML(note)}" />
        ${errs && errs.length ? '<div class="medp-errs">' + errs.map(RI.escapeHTML).join(' · ') + '</div>' : ''}
      </li>`;
  }

  function timelineHtml(activities) {
    if (!activities.length) return '<li class="muted">No activities logged yet.</li>';
    return activities.map(a => {
      const label = ACTIVITY_KINDS.find(k => k.k === a.kind);
      const note = (a.payload && (a.payload.note || a.payload.subject)) || '';
      return `<li class="tl-item">
        <div class="tl-dot kind-${a.kind}"></div>
        <div class="tl-body">
          <div class="tl-top"><span class="tl-kind">${RI.escapeHTML(label ? label.label : a.kind)}</span><span class="tl-time">${RI.daysAgo(a.occurred_at)}</span></div>
          ${note ? '<div class="tl-note">' + RI.escapeHTML(note) + '</div>' : ''}
        </div>
      </li>`;
    }).join('');
  }

  function bind() {
    const form = document.getElementById('activity-form');
    form && form.addEventListener('submit', async e => {
      e.preventDefault();
      const kind = document.getElementById('act-kind').value;
      const note = document.getElementById('act-note').value;
      try {
        const resp = await RI.Api.post('/api/activities', {
          account_id: state.account.sf_id,
          kind,
          payload: note ? { note } : {}
        });
        RI.showToast('Logged · FIRE ' + resp.fire_after.score);
        document.getElementById('act-note').value = '';
        render({ id: state.account.sf_id });
      } catch (err) { RI.showToast('Log failed: ' + err.message, 'error'); }
    });

    document.querySelectorAll('.medp-toggle').forEach(cb => {
      cb.addEventListener('change', e => patchSlot(cb.dataset.slot, { filled: cb.checked }));
    });
    document.querySelectorAll('.medp-note').forEach(inp => {
      inp.addEventListener('blur', () => patchSlot(inp.dataset.slot, { note: inp.value }));
    });

    const btnSuggest = document.getElementById('btn-suggest');
    btnSuggest && btnSuggest.addEventListener('click', async () => {
      btnSuggest.disabled = true;
      btnSuggest.textContent = 'Suggesting…';
      try {
        const r = await RI.Api.post('/api/accounts/' + state.account.sf_id + '/medpicss/suggest', {});
        for (const s of r.suggestions || []) {
          const input = document.querySelector('.medp-note[data-slot="' + s.slot + '"]');
          if (input && !input.value) input.value = s.note;
        }
        RI.showToast((r.demo ? 'Demo ' : '') + 'suggestions applied — click each ✓ to mark filled');
      } catch (err) { RI.showToast('Suggest failed: ' + err.message, 'error'); }
      btnSuggest.disabled = false;
      btnSuggest.textContent = 'AI suggest';
    });

    const spinout = document.getElementById('btn-spinout');
    spinout && spinout.addEventListener('click', async () => {
      const name = prompt('Opportunity name?');
      if (!name) return;
      const amount = Number(prompt('Amount in USD?', '800000')) || 800000;
      try {
        const opp = await RI.Api.post('/api/opps', {
          account_id: state.account.sf_id,
          name: state.account.sf_name + ' — ' + name,
          amount,
          source_plan_id: state.account.account_plan_id
        });
        RI.showToast('Opportunity created');
        RI.Router.go('#/opps/' + opp.sf_id);
      } catch (err) { RI.showToast('Spin-out failed: ' + err.message, 'error'); }
    });
  }

  async function patchSlot(slot, body) {
    try {
      const r = await RI.Api.patch('/api/accounts/' + state.account.sf_id + '/medpicss', {
        slot,
        filled: body.filled,
        note: body.note
      });
      // Rerender to reflect validation + completeness + gate
      state.account.medpicss = r.medpicss;
      state.account.medpicss_filled = r.completeness;
      const count = document.querySelector('.medp-count');
      if (count) count.textContent = r.completeness + '/9';
      const row = document.querySelector('.medp-row[data-slot="' + slot + '"]');
      if (row) {
        row.classList.toggle('is-filled', r.value.filled);
        const existing = row.querySelector('.medp-errs');
        if (existing) existing.remove();
        if (r.value._validation_errors && r.value._validation_errors.length) {
          const d = document.createElement('div');
          d.className = 'medp-errs';
          d.textContent = r.value._validation_errors.join(' · ');
          row.appendChild(d);
        }
        const cb = row.querySelector('.medp-toggle');
        if (cb) cb.checked = r.value.filled;
      }
      // Update gate
      const account = await RI.Api.get('/api/accounts/' + state.account.sf_id);
      const gateOk = account.medpicss_filled >= RI.Config.GATE_MEDPICSS && account.fire.score >= RI.Config.GATE_FIRE;
      const btn = document.getElementById('btn-spinout');
      if (btn) {
        btn.disabled = !gateOk;
        btn.classList.toggle('btn-primary', gateOk);
        btn.classList.toggle('btn-disabled', !gateOk);
      }
    } catch (e) { RI.showToast('Update failed: ' + e.message, 'error'); }
  }

  return { render };
})();
