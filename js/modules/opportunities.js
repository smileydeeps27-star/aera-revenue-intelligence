RI.Opportunities = (function () {
  const STAGES = ['discovery', 'validation', 'proposal', 'negotiation'];

  async function renderBoard() {
    const view = document.getElementById('view');
    view.innerHTML = '<div class="loading">Loading opportunities…</div>';
    try {
      const opps = await RI.Api.get('/api/opps' + RI.Role.scopeParams());
      view.innerHTML = boardHtml(opps);
      bindBoard();
    } catch (e) {
      view.innerHTML = '<div class="error-state">Failed to load: ' + RI.escapeHTML(e.message) + '</div>';
    }
  }

  function boardHtml(opps) {
    const byStage = {};
    STAGES.forEach(s => byStage[s] = []);
    opps.forEach(o => { if (byStage[o.internal_stage]) byStage[o.internal_stage].push(o); });

    return `
      <section class="page page-opps">
        <header class="page-header">
          <div><h1>Opportunities</h1><p class="page-sub">Drag between stages to advance. Confidence + projected close recompute server-side.</p></div>
        </header>
        <div class="kanban">
          ${STAGES.map(s => `
            <div class="kanban-col" data-stage="${s}">
              <div class="kanban-head">
                <span class="kanban-name">${s}</span>
                <span class="kanban-count">${byStage[s].length}</span>
              </div>
              <div class="kanban-body" data-dropzone="${s}">
                ${byStage[s].map(oppCard).join('')}
              </div>
            </div>`).join('')}
        </div>
      </section>`;
  }

  function oppCard(o) {
    const conf = (o.confidence && o.confidence.score) || 0;
    const delta = (o.projected_close && o.projected_close.delta_days_from_sf) || 0;
    return `
      <a class="opp-card" href="#/opps/${RI.escapeHTML(o.sf_id)}" draggable="true" data-opp-id="${RI.escapeHTML(o.sf_id)}">
        <div class="opp-name">${RI.escapeHTML(o.sf_name)}</div>
        <div class="opp-amount">${RI.formatCurrency(o.sf_amount)}</div>
        <div class="opp-conf">
          <div class="conf-label">Confidence ${conf}</div>
          <div class="conf-bar"><div class="conf-fill" style="width:${conf}%;"></div></div>
        </div>
        <div class="opp-close">
          <span>Proj. close ${RI.escapeHTML(o.projected_close && o.projected_close.date || '—')}</span>
          ${delta ? `<span class="delta ${delta > 0 ? 'delta-late' : 'delta-early'}">${delta > 0 ? '+' : ''}${delta}d</span>` : ''}
        </div>
      </a>`;
  }

  function bindBoard() {
    document.querySelectorAll('.opp-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', card.dataset.oppId);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    document.querySelectorAll('[data-dropzone]').forEach(zone => {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', async e => {
        e.preventDefault();
        zone.classList.remove('over');
        const oppId = e.dataTransfer.getData('text/plain');
        const stage = zone.dataset.dropzone;
        try {
          await RI.Api.patch('/api/opps/' + oppId + '/stage', { internal_stage: stage });
          RI.showToast('Stage updated → ' + stage);
          renderBoard();
        } catch (err) { RI.showToast('Update failed: ' + err.message, 'error'); }
      });
    });
  }

  let detailState = { opp: null, winPlan: null, wpDirty: false, notes: [] };
  const SEVERITIES = ['low', 'med', 'high'];

  async function renderDetail(params) {
    const view = document.getElementById('view');
    view.innerHTML = '<div class="loading">Loading opportunity…</div>';
    try {
      const opp = await RI.Api.get('/api/opps/' + params.id);
      let winPlan = null;
      if (opp.win_plan_id) {
        try { winPlan = await RI.Api.get('/api/win_plans/' + opp.win_plan_id); } catch (e) { /* ignore */ }
      }
      let notes = [];
      try { notes = await RI.Api.get('/api/opps/' + params.id + '/notes'); } catch (e) { /* ignore */ }
      detailState = { opp, winPlan, wpDirty: false, notes };
      view.innerHTML = detailHtml(opp, winPlan);
      bindDetail();
    } catch (e) {
      view.innerHTML = '<div class="error-state">Failed to load: ' + RI.escapeHTML(e.message) + '</div>';
    }
  }

  function detailHtml(o, wp) {
    const conf = o.confidence || { score: 0, components: {} };
    const cc = conf.components || {};
    const delta = (o.projected_close && o.projected_close.delta_days_from_sf) || 0;
    return `
      <section class="page page-opp-detail">
        <header class="page-header">
          <div>
            <a href="#/opps" class="link-back">← Back to board</a>
            <h1>${RI.escapeHTML(o.sf_name)}</h1>
            <p class="page-sub">${RI.formatCurrency(o.sf_amount)} · Stage <strong>${RI.escapeHTML(o.internal_stage)}</strong> · SF close ${RI.escapeHTML(o.sf_close_date)} · Projected ${RI.escapeHTML(o.projected_close.date)} ${delta ? '<span class="delta ' + (delta > 0 ? 'delta-late' : 'delta-early') + '">' + (delta > 0 ? '+' : '') + delta + 'd</span>' : ''}</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-secondary" id="btn-refresh-conf">Refresh narrative</button>
            <button class="btn btn-secondary" id="btn-gen-winplan">${wp ? 'Regenerate' : 'Generate'} win plan</button>
            <button class="btn btn-primary" id="btn-save-winplan" disabled>Save win plan</button>
          </div>
        </header>

        <nav class="plan-tabs opp-tabs">
          <button class="plan-tab active" data-tab="overview">Overview</button>
          <button class="plan-tab" data-tab="winplan">Win plan</button>
          <button class="plan-tab" data-tab="notes">Notes${detailState.notes.length ? ' <span class="tab-badge">' + detailState.notes.length + '</span>' : ''}</button>
          <button class="plan-tab" data-tab="confidence">Confidence</button>
          <button class="plan-tab" data-tab="stakeholders">Stakeholders</button>
          <button class="plan-tab" data-tab="history">History</button>
        </nav>

        <div class="plan-pane active" data-pane="overview">
          <div class="opp-detail-grid">
            <div class="panel">
              <div class="panel-head">Confidence</div>
              <div class="conf-score-big">${conf.score}</div>
              <div class="conf-components">
                <div><span>MEDPICSS</span><span>${(cc.medpicss * 100 || 0).toFixed(0)}%</span></div>
                <div><span>Recency</span><span>${(cc.recency * 100 || 0).toFixed(0)}%</span></div>
                <div><span>Stakeholder</span><span>${(cc.stakeholder * 100 || 0).toFixed(0)}%</span></div>
                <div><span>Competitive</span><span>${(cc.competitive * 100 || 0).toFixed(0)}%</span></div>
                <div><span>Size fit</span><span>${(cc.size_fit * 100 || 0).toFixed(0)}%</span></div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-head">Projected close</div>
              <div class="pclose-date">${RI.escapeHTML(o.projected_close && o.projected_close.date || '—')}</div>
              ${o.projected_close && o.projected_close.override_source ? `<div class="pclose-override">Adjusted from meeting notes · formula was ${RI.escapeHTML(o.projected_close.formula_date || '—')}</div>` : ''}
              <div class="pclose-reason">${RI.escapeHTML(o.projected_close && o.projected_close.reason || '')}</div>
              <div class="pclose-signals">
                <div><span>Champion</span><span>${o._has_champion ? '✓' : '—'}</span></div>
                <div><span>Economic buyer</span><span>${o._has_econ_buyer ? '✓' : '—'}</span></div>
                <div><span>Active leads</span><span>${o._active_leads}</span></div>
                <div><span>Competitors</span><span>${o._competitor_count}</span></div>
                <div><span>Days in stage</span><span>${o._days_in_stage}</span></div>
                <div><span>Velocity</span><span>${o._velocity_factor.toFixed(2)}×</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="plan-pane" data-pane="winplan">
          ${winPlanHtml(wp)}
        </div>

        <div class="plan-pane" data-pane="notes">
          ${notesTabHtml(o)}
        </div>

        <div class="plan-pane" data-pane="confidence">
          <div class="panel">
            <div class="panel-head">Confidence narrative</div>
            ${conf.override_source ? `
              <div class="override-badge">
                <span class="override-label">Adjusted from meeting notes</span>
                <span class="override-delta">Formula ${conf.formula_score} → Adjusted <strong>${conf.score}</strong></span>
              </div>` : ''}
            <div class="conf-narrative" id="conf-narrative">
              ${conf.narrative ? RI.escapeHTML(conf.narrative) : '<em class="muted">No narrative yet — click "Refresh narrative" to generate.</em>'}
            </div>
            <div class="conf-components-full">
              ${componentRow('MEDPICSS', cc.medpicss, 0.30)}
              ${componentRow('Recency', cc.recency, 0.20)}
              ${componentRow('Stakeholder', cc.stakeholder, 0.20)}
              ${componentRow('Competitive', cc.competitive, 0.15)}
              ${componentRow('Size fit', cc.size_fit, 0.15)}
            </div>
          </div>

          ${analysisHtml(o.analysis)}
        </div>

        <div class="plan-pane" data-pane="stakeholders">
          ${stakeholdersHtml(o.stakeholders || [])}
        </div>

        <div class="plan-pane" data-pane="history">
          ${historyHtml(o.stage_history || [])}
        </div>
      </section>`;
  }

  function componentRow(label, value, weight) {
    const v = value || 0;
    return `
      <div class="comp-row">
        <span class="comp-label">${label}</span>
        <span class="comp-weight">weight ${Math.round(weight * 100)}%</span>
        <div class="comp-bar"><div class="comp-fill" style="width:${Math.round(v * 100)}%;"></div></div>
        <span class="comp-value">${(v * 100).toFixed(0)}%</span>
      </div>`;
  }

  function winPlanHtml(wp) {
    if (!wp) return '<div class="empty-state"><div class="empty-icon">∴</div><div class="empty-title">No win plan yet</div><div class="empty-sub">Click "Generate win plan" to run the A8 agent.</div></div>';
    const byStage = {};
    for (const ai of wp.action_items || []) {
      byStage[ai.stage] = byStage[ai.stage] || [];
      byStage[ai.stage].push(ai);
    }
    const stages = ['discovery', 'validation', 'proposal', 'negotiation'];
    return `
      <div class="panel">
        <div class="nba">Next best action: <span class="ap-edit wp-edit" contenteditable="true" data-wp-path="next_best_action" spellcheck="false">${RI.escapeHTML(wp.next_best_action || '')}</span></div>

        <div class="wp-risks">
          <div class="section-head">Risks <button class="btn btn-xs btn-secondary" id="wp-add-risk">+ Add risk</button></div>
          <div id="wp-risks-list">
            ${(wp.risks || []).map((r, i) => riskRowHtml(r, i)).join('')}
          </div>
        </div>

        ${meetingsHtml(wp)}

        <div class="wp-stages">
          ${stages.map(s => {
            const items = byStage[s] || [];
            const pb = (wp.stage_playbooks && wp.stage_playbooks[s]) || {};
            return `
              <div class="wp-stage" data-stage="${s}">
                <div class="wp-stage-head">
                  ${s}
                  <button class="wp-add-action" data-stage="${s}" title="Add action">＋</button>
                </div>
                ${(pb.exit_criteria || []).length ? '<div class="wp-exit"><strong>Exit:</strong> ' + pb.exit_criteria.map(RI.escapeHTML).join(' · ') + '</div>' : ''}
                <ul class="wp-actions" data-stage="${s}">
                  ${items.map(ai => actionItemHtml(ai)).join('') || '<li class="muted wp-empty-stage">No actions yet.</li>'}
                </ul>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function actionItemHtml(ai) {
    return '<li class="wp-ai-row" data-ai-id="' + RI.escapeHTML(ai.id) + '">' +
      '<label class="ai-check">' +
        '<input type="checkbox" class="ai-toggle" data-ai-id="' + RI.escapeHTML(ai.id) + '" ' + (ai.status === 'done' ? 'checked' : '') + ' />' +
        '<span class="ap-edit wp-edit wp-ai-text" contenteditable="true" data-ai-id="' + RI.escapeHTML(ai.id) + '" spellcheck="false">' + RI.escapeHTML(ai.text) + '</span>' +
      '</label>' +
      '<button class="wp-remove-action" data-ai-id="' + RI.escapeHTML(ai.id) + '" title="Remove action">×</button>' +
    '</li>';
  }

  const PRIORITIES = ['low', 'med', 'high'];
  const TARGET_WINDOWS = [
    { v: 'this-week', label: 'This week' },
    { v: '2-weeks',   label: 'Next 2 weeks' },
    { v: 'this-month',label: 'This month' },
    { v: 'next-month',label: 'Next month' },
    { v: 'quarter',   label: 'This quarter' }
  ];

  function fmtMeetingDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    const date = d.toLocaleDateString(undefined, opts);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return date + ' · ' + time;
  }

  function meetingsHtml(wp) {
    const meetings = wp.meetings || { scheduled: [], to_schedule: [] };
    const scheduled = (meetings.scheduled || []).slice().sort((a, b) => (a.datetime || '').localeCompare(b.datetime || ''));
    const pending = meetings.to_schedule || [];
    return `
      <div class="wp-meetings">
        <div class="wp-meetings-grid">
          <div class="wp-meetings-col">
            <div class="section-head">
              <span>Scheduled meetings <span class="count-pill">${scheduled.length}</span></span>
              <button class="btn btn-xs btn-secondary" id="wp-add-meeting">+ Schedule</button>
            </div>
            <div class="wp-meetings-list">
              ${scheduled.length ? scheduled.map(scheduledRowHtml).join('') : '<div class="muted wp-meetings-empty">No meetings on the calendar. Click <em>+ Schedule</em> to add one.</div>'}
            </div>
          </div>
          <div class="wp-meetings-col">
            <div class="section-head">
              <span>To be scheduled <span class="count-pill">${pending.length}</span></span>
              <button class="btn btn-xs btn-secondary" id="wp-add-pending">+ Add</button>
            </div>
            <div class="wp-meetings-list">
              ${pending.length ? pending.map(pendingRowHtml).join('') : '<div class="muted wp-meetings-empty">Nothing in the backlog. Add the next meeting you need to land.</div>'}
            </div>
          </div>
        </div>
      </div>`;
  }

  function scheduledRowHtml(m) {
    const when = m.datetime || '';
    const attendees = Array.isArray(m.attendees) ? m.attendees.join(', ') : (m.attendees || '');
    const status = m.status || 'confirmed';
    return '<div class="mtg-row mtg-scheduled" data-mtg-id="' + RI.escapeHTML(m.id) + '">' +
      '<div class="mtg-left">' +
        '<input type="datetime-local" class="mtg-datetime" data-mtg-id="' + RI.escapeHTML(m.id) + '" value="' + RI.escapeHTML(when.slice(0, 16)) + '" />' +
        '<div class="mtg-when-display">' + RI.escapeHTML(fmtMeetingDate(when)) + '</div>' +
      '</div>' +
      '<div class="mtg-body">' +
        '<div class="mtg-title-row">' +
          '<span class="ap-edit wp-edit mtg-title" contenteditable="true" data-mtg-id="' + RI.escapeHTML(m.id) + '" data-mtg-field="title" spellcheck="false">' + RI.escapeHTML(m.title || '') + '</span>' +
          '<select class="mtg-status-select" data-mtg-id="' + RI.escapeHTML(m.id) + '">' +
            ['confirmed', 'tentative'].map(s => '<option value="' + s + '"' + (s === status ? ' selected' : '') + '>' + s + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="mtg-attendees"><span class="mtg-label">Attendees</span><span class="ap-edit wp-edit mtg-attendees-edit" contenteditable="true" data-mtg-id="' + RI.escapeHTML(m.id) + '" data-mtg-field="attendees" spellcheck="false">' + RI.escapeHTML(attendees) + '</span></div>' +
        '<div class="mtg-agenda"><span class="mtg-label">Agenda</span><span class="ap-edit wp-edit mtg-agenda-edit" contenteditable="true" data-mtg-id="' + RI.escapeHTML(m.id) + '" data-mtg-field="agenda" spellcheck="false">' + RI.escapeHTML(m.agenda || '') + '</span></div>' +
      '</div>' +
      '<button class="mtg-remove" data-mtg-id="' + RI.escapeHTML(m.id) + '" data-mtg-kind="scheduled" title="Remove">×</button>' +
    '</div>';
  }

  function pendingRowHtml(m) {
    const priority = m.priority || 'med';
    const proposed = Array.isArray(m.proposed_attendees) ? m.proposed_attendees.join(', ') : (m.proposed_attendees || '');
    const window = m.target_window || 'this-week';
    return '<div class="mtg-row mtg-pending prio-' + RI.escapeHTML(priority) + '" data-mtg-id="' + RI.escapeHTML(m.id) + '">' +
      '<select class="mtg-prio-select" data-mtg-id="' + RI.escapeHTML(m.id) + '">' +
        PRIORITIES.map(p => '<option value="' + p + '"' + (p === priority ? ' selected' : '') + '>' + p + '</option>').join('') +
      '</select>' +
      '<div class="mtg-body">' +
        '<span class="ap-edit wp-edit mtg-title" contenteditable="true" data-mtg-id="' + RI.escapeHTML(m.id) + '" data-mtg-field="title" spellcheck="false">' + RI.escapeHTML(m.title || '') + '</span>' +
        '<div class="mtg-attendees"><span class="mtg-label">Proposed</span><span class="ap-edit wp-edit" contenteditable="true" data-mtg-id="' + RI.escapeHTML(m.id) + '" data-mtg-field="proposed_attendees" spellcheck="false">' + RI.escapeHTML(proposed) + '</span></div>' +
        '<div class="mtg-purpose"><span class="mtg-label">Purpose</span><span class="ap-edit wp-edit" contenteditable="true" data-mtg-id="' + RI.escapeHTML(m.id) + '" data-mtg-field="purpose" spellcheck="false">' + RI.escapeHTML(m.purpose || '') + '</span></div>' +
      '</div>' +
      '<select class="mtg-window-select" data-mtg-id="' + RI.escapeHTML(m.id) + '">' +
        TARGET_WINDOWS.map(w => '<option value="' + w.v + '"' + (w.v === window ? ' selected' : '') + '>' + w.label + '</option>').join('') +
      '</select>' +
      '<button class="mtg-remove" data-mtg-id="' + RI.escapeHTML(m.id) + '" data-mtg-kind="pending" title="Remove">×</button>' +
    '</div>';
  }

  function riskRowHtml(r, i) {
    const sev = r.severity || 'med';
    return '<div class="risk-row sev-' + RI.escapeHTML(sev) + '" data-risk-idx="' + i + '">' +
      '<select class="risk-sev-select" data-risk-idx="' + i + '">' +
        SEVERITIES.map(s => '<option value="' + s + '"' + (s === sev ? ' selected' : '') + '>' + s + '</option>').join('') +
      '</select>' +
      '<span class="ap-edit wp-edit wp-risk-text" contenteditable="true" data-risk-idx="' + i + '" spellcheck="false">' + RI.escapeHTML(r.text || '') + '</span>' +
      '<button class="wp-remove-risk" data-risk-idx="' + i + '" title="Remove risk">×</button>' +
    '</div>';
  }

  function stakeholdersHtml(leads) {
    if (!leads.length) return '<div class="empty-state"><div class="empty-icon">∴</div><div class="empty-title">No stakeholders mapped</div><div class="empty-sub">Add leads to this account on the Leads tab.</div></div>';
    return `
      <div class="panel">
        <div class="section-head">Mapped stakeholders</div>
        <div class="stk-list">
          ${leads.map(s => `
            <div class="stk-card">
              <div class="stk-top">
                <div class="stk-name">${RI.escapeHTML(s.name)}</div>
                <span class="chip chip-role">${RI.escapeHTML(s.role)}</span>
              </div>
              <div class="stk-title">${RI.escapeHTML(s.title || '')}</div>
              <div class="stk-meta">Last interaction: ${s.last_interaction_at ? RI.daysAgo(s.last_interaction_at) : '—'}</div>
              ${s.linkedin ? '<a class="stk-linkedin" href="' + RI.escapeHTML(s.linkedin) + '" target="_blank" rel="noopener">LinkedIn ↗</a>' : ''}
            </div>`).join('')}
        </div>
      </div>`;
  }

  function notesTabHtml(o) {
    const notes = detailState.notes || [];
    return `
      <div class="panel">
        <div class="panel-head notes-head">
          <span>Meeting notes</span>
          <div class="notes-head-actions">
            <button id="btn-analyze-notes" class="btn btn-primary">${o.analysis ? 'Re-analyze' : 'Analyze with AI'}</button>
          </div>
        </div>
        <p class="muted notes-sub">AI reads every note and the history of similar closed deals in ${RI.escapeHTML((o._account && o._account.sf_name && o._account.sf_name.split(' ')[0]) || 'this')}&rsquo;s industry to adjust confidence + projected close. Formula values stay visible as the baseline.</p>

        <form id="note-form" class="note-form">
          <div class="note-form-row">
            <label><span class="form-label">Date</span><input type="date" id="note-date" value="${new Date().toISOString().slice(0, 10)}"/></label>
            <label><span class="form-label">Type</span><select id="note-type">
              <option value="discovery">Discovery</option>
              <option value="demo">Demo / PoV</option>
              <option value="exec_alignment">Exec alignment</option>
              <option value="proposal">Proposal review</option>
              <option value="negotiation">Negotiation</option>
              <option value="internal">Internal sync</option>
            </select></label>
            <label class="grow"><span class="form-label">Participants (comma-separated)</span><input type="text" id="note-participants" placeholder="Jane Doe - CSCO, John Smith - Aera"/></label>
          </div>
          <label class="note-textarea-label"><span class="form-label">Notes</span>
            <textarea id="note-body" rows="5" placeholder="What happened, who said what, commitments made, blockers raised, competitors mentioned…"></textarea>
          </label>
          <div class="note-form-actions">
            <button type="submit" class="btn btn-primary">Save note</button>
          </div>
        </form>

        <div class="notes-list">
          ${notes.length ? notes.map(noteRowHtml).join('') : '<div class="muted notes-empty">No meeting notes yet. Add one above and click "Analyze" to update confidence + projected close.</div>'}
        </div>
      </div>`;
  }

  function noteRowHtml(n) {
    const participants = Array.isArray(n.participants) ? n.participants.join(', ') : (n.participants || '');
    return `
      <div class="note-row" data-note-id="${RI.escapeHTML(n.id)}">
        <div class="note-row-head">
          <span class="note-date">${RI.escapeHTML(n.meeting_date)}</span>
          <span class="chip chip-stage">${RI.escapeHTML(n.meeting_type || 'note')}</span>
          <span class="note-participants">${RI.escapeHTML(participants)}</span>
          <button class="note-delete" data-note-id="${RI.escapeHTML(n.id)}" title="Delete note">×</button>
        </div>
        <div class="note-body">${RI.escapeHTML(n.notes || '')}</div>
      </div>`;
  }

  function analysisHtml(a) {
    if (!a) return '';
    const posSignals = (a.signals || []).filter(s => s.direction === 'positive');
    const negSignals = (a.signals || []).filter(s => s.direction === 'negative');
    const comps = a.comparable_deals || [];
    return `
      <div class="panel analysis-panel">
        <div class="panel-head">Analysis rationale <span class="analysis-meta">${a.notes_analyzed || 0} notes · ${comps.length} comparable deals · ${new Date(a.generated_at).toLocaleString()}</span></div>
        <div class="analysis-rationale">${RI.escapeHTML(a.rationale || '')}</div>

        ${(a.signals || []).length ? `
          <div class="analysis-signals">
            ${posSignals.length ? `<div class="sig-group sig-pos">
              <div class="sig-group-head">Positive signals <span class="sig-total">+${posSignals.reduce((s, x) => s + x.delta, 0)}</span></div>
              ${posSignals.map(s => '<div class="sig-row"><span class="sig-delta pos">+' + s.delta + '</span><span class="chip">' + RI.escapeHTML(s.component) + '</span><span>' + RI.escapeHTML(s.signal) + '</span></div>').join('')}
            </div>` : ''}
            ${negSignals.length ? `<div class="sig-group sig-neg">
              <div class="sig-group-head">Risk signals <span class="sig-total">${negSignals.reduce((s, x) => s + x.delta, 0)}</span></div>
              ${negSignals.map(s => '<div class="sig-row"><span class="sig-delta neg">' + s.delta + '</span><span class="chip">' + RI.escapeHTML(s.component) + '</span><span>' + RI.escapeHTML(s.signal) + '</span></div>').join('')}
            </div>` : ''}
          </div>` : ''}

        ${(a.close_reasons || []).length ? `
          <div class="analysis-close">
            <strong>Close date adjustment:</strong> ${a.close_delta_days >= 0 ? '+' : ''}${a.close_delta_days} days — ${a.close_reasons.map(RI.escapeHTML).join('; ')}
          </div>` : ''}

        ${comps.length ? `
          <div class="analysis-comparables">
            <div class="section-head">Comparable closed deals used</div>
            <table class="comp-table">
              <thead><tr><th>Account</th><th>Industry</th><th>Outcome</th><th>Amount</th><th>Cycle</th><th>Similarity</th></tr></thead>
              <tbody>
                ${comps.map(c => `
                  <tr>
                    <td>${RI.escapeHTML(c.account_name)}</td>
                    <td>${RI.escapeHTML(c.industry || '—')}</td>
                    <td><span class="chip ${c.outcome === 'closed_won' ? 'chip-won' : 'chip-lost'}">${RI.escapeHTML(c.outcome.replace('_', ' '))}</span></td>
                    <td>${RI.formatCurrency(c.amount || 0)}</td>
                    <td>${c.days_to_close_from_created}d</td>
                    <td>${c.similarity_score}%</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
      </div>`;
  }

  function historyHtml(history) {
    if (!history.length) return '<div class="muted">No stage history yet.</div>';
    return `
      <div class="panel">
        <div class="section-head">Stage history</div>
        <ul class="history-list">
          ${history.map((h, i) => `
            <li>
              <span class="chip chip-stage">${RI.escapeHTML(h.stage)}</span>
              <span class="history-date">Entered ${new Date(h.entered_at).toLocaleString()}</span>
              ${h.exited_at ? '<span class="history-exit">Exited ' + new Date(h.exited_at).toLocaleString() + '</span>' : (i === history.length - 1 ? '<span class="chip chip-amount">current</span>' : '')}
            </li>`).join('')}
        </ul>
      </div>`;
  }

  function bindDetail() {
    const tabs = document.querySelectorAll('.opp-tabs .plan-tab');
    const panes = document.querySelectorAll('.page-opp-detail .plan-pane');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      panes.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector('.page-opp-detail .plan-pane[data-pane="' + t.dataset.tab + '"]').classList.add('active');
    }));

    const genBtn = document.getElementById('btn-gen-winplan');
    genBtn && genBtn.addEventListener('click', async () => {
      if (detailState.wpDirty && !confirm('You have unsaved win-plan changes. Regenerate and lose them?')) return;
      genBtn.disabled = true;
      genBtn.textContent = 'Generating…';
      try {
        const wp = await RI.Api.post('/api/agents/win-plan/' + detailState.opp.sf_id, {});
        RI.showToast('Win plan ' + (wp._demo ? '(demo) ' : '') + 'generated');
        renderDetail({ id: detailState.opp.sf_id });
      } catch (e) { RI.showToast('Failed: ' + e.message, 'error'); genBtn.disabled = false; genBtn.textContent = 'Generate win plan'; }
    });

    const saveBtn = document.getElementById('btn-save-winplan');
    saveBtn && saveBtn.addEventListener('click', async () => {
      if (!detailState.winPlan) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        await RI.Api.put('/api/win_plans/' + detailState.winPlan.id, detailState.winPlan);
        detailState.wpDirty = false;
        saveBtn.textContent = 'Saved ✓';
        setTimeout(() => { saveBtn.textContent = 'Save win plan'; saveBtn.disabled = true; }, 1500);
        RI.showToast('Win plan saved');
      } catch (e) {
        RI.showToast('Save failed: ' + e.message, 'error');
        saveBtn.textContent = 'Save win plan';
        saveBtn.disabled = false;
      }
    });

    // Win-plan editing events
    const findItem = (id) => (detailState.winPlan.action_items || []).find(a => a.id === id);
    const markWpDirty = () => {
      if (!detailState.wpDirty) {
        detailState.wpDirty = true;
        const b = document.getElementById('btn-save-winplan');
        if (b) { b.disabled = false; b.textContent = 'Save win plan'; }
      }
    };

    const findMeeting = (id, kind) => {
      const wp = detailState.winPlan;
      if (!wp || !wp.meetings) return null;
      const list = kind === 'scheduled' ? wp.meetings.scheduled : wp.meetings.to_schedule;
      return (list || []).find(x => x.id === id);
    };

    document.querySelectorAll('.wp-edit').forEach(el => {
      el.addEventListener('input', () => {
        const wp = detailState.winPlan;
        if (!wp) return;
        if (el.dataset.wpPath === 'next_best_action') {
          wp.next_best_action = el.textContent;
        } else if (el.dataset.aiId) {
          const it = findItem(el.dataset.aiId);
          if (it) it.text = el.textContent;
        } else if (el.dataset.riskIdx != null) {
          const idx = Number(el.dataset.riskIdx);
          wp.risks = wp.risks || [];
          if (wp.risks[idx]) wp.risks[idx].text = el.textContent;
        } else if (el.dataset.mtgId) {
          const row = el.closest('.mtg-row');
          const kind = row && row.classList.contains('mtg-scheduled') ? 'scheduled' : 'pending';
          const mtg = findMeeting(el.dataset.mtgId, kind);
          if (!mtg) return;
          const field = el.dataset.mtgField;
          if (field === 'attendees' || field === 'proposed_attendees') {
            mtg[field] = el.textContent.split(',').map(s => s.trim()).filter(Boolean);
          } else {
            mtg[field] = el.textContent;
          }
        }
        markWpDirty();
      });
    });

    document.querySelectorAll('.mtg-datetime').forEach(inp => {
      inp.addEventListener('change', () => {
        const mtg = findMeeting(inp.dataset.mtgId, 'scheduled');
        if (!mtg) return;
        mtg.datetime = inp.value;
        const display = inp.closest('.mtg-left').querySelector('.mtg-when-display');
        if (display) display.textContent = fmtMeetingDate(mtg.datetime);
        markWpDirty();
      });
    });

    document.querySelectorAll('.mtg-status-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const mtg = findMeeting(sel.dataset.mtgId, 'scheduled');
        if (mtg) { mtg.status = sel.value; markWpDirty(); }
      });
    });

    document.querySelectorAll('.mtg-prio-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const mtg = findMeeting(sel.dataset.mtgId, 'pending');
        if (mtg) {
          mtg.priority = sel.value;
          const row = sel.closest('.mtg-row');
          if (row) { row.classList.remove('prio-low', 'prio-med', 'prio-high'); row.classList.add('prio-' + sel.value); }
          markWpDirty();
        }
      });
    });

    document.querySelectorAll('.mtg-window-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const mtg = findMeeting(sel.dataset.mtgId, 'pending');
        if (mtg) { mtg.target_window = sel.value; markWpDirty(); }
      });
    });

    document.querySelectorAll('.mtg-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const wp = detailState.winPlan;
        if (!wp || !wp.meetings) return;
        const kind = btn.dataset.mtgKind;
        const key = kind === 'scheduled' ? 'scheduled' : 'to_schedule';
        wp.meetings[key] = (wp.meetings[key] || []).filter(m => m.id !== btn.dataset.mtgId);
        markWpDirty();
        rerenderWinPlan();
      });
    });

    const addMtgBtn = document.getElementById('wp-add-meeting');
    addMtgBtn && addMtgBtn.addEventListener('click', () => {
      const wp = detailState.winPlan;
      if (!wp) return;
      wp.meetings = wp.meetings || { scheduled: [], to_schedule: [] };
      wp.meetings.scheduled = wp.meetings.scheduled || [];
      const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(10, 0, 0, 0);
      wp.meetings.scheduled.push({
        id: 'mtg-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
        title: 'New meeting',
        datetime: d.toISOString().slice(0, 16),
        duration_min: 30,
        attendees: [],
        agenda: '',
        status: 'tentative'
      });
      markWpDirty();
      rerenderWinPlan();
    });

    const addPendingBtn = document.getElementById('wp-add-pending');
    addPendingBtn && addPendingBtn.addEventListener('click', () => {
      const wp = detailState.winPlan;
      if (!wp) return;
      wp.meetings = wp.meetings || { scheduled: [], to_schedule: [] };
      wp.meetings.to_schedule = wp.meetings.to_schedule || [];
      wp.meetings.to_schedule.push({
        id: 'pend-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
        title: 'New meeting to schedule',
        purpose: '',
        proposed_attendees: [],
        priority: 'med',
        target_window: 'this-week'
      });
      markWpDirty();
      rerenderWinPlan();
    });

    function rerenderWinPlan() {
      const pane = document.querySelector('.page-opp-detail .plan-pane[data-pane="winplan"]');
      if (pane) { pane.innerHTML = winPlanHtml(detailState.winPlan); bindDetail(); activateTab('winplan'); }
    }

    document.querySelectorAll('.risk-sev-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.riskIdx);
        const wp = detailState.winPlan;
        if (wp && wp.risks && wp.risks[idx]) {
          wp.risks[idx].severity = sel.value;
          const row = document.querySelector('.risk-row[data-risk-idx="' + idx + '"]');
          if (row) {
            row.classList.remove('sev-low', 'sev-med', 'sev-high');
            row.classList.add('sev-' + sel.value);
          }
          markWpDirty();
        }
      });
    });

    document.querySelectorAll('.wp-add-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const wp = detailState.winPlan;
        if (!wp) return;
        const stage = btn.dataset.stage;
        const newItem = { id: 'ai-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36), stage, text: 'New action', status: 'open' };
        wp.action_items = wp.action_items || [];
        wp.action_items.push(newItem);
        markWpDirty();
        // Re-render just the win plan pane
        const pane = document.querySelector('.page-opp-detail .plan-pane[data-pane="winplan"]');
        if (pane) { pane.innerHTML = winPlanHtml(wp); bindDetail(); activateTab('winplan'); }
      });
    });

    document.querySelectorAll('.wp-remove-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const wp = detailState.winPlan;
        if (!wp) return;
        wp.action_items = (wp.action_items || []).filter(a => a.id !== btn.dataset.aiId);
        markWpDirty();
        const pane = document.querySelector('.page-opp-detail .plan-pane[data-pane="winplan"]');
        if (pane) { pane.innerHTML = winPlanHtml(wp); bindDetail(); activateTab('winplan'); }
      });
    });

    document.getElementById('wp-add-risk') && document.getElementById('wp-add-risk').addEventListener('click', () => {
      const wp = detailState.winPlan;
      if (!wp) return;
      wp.risks = wp.risks || [];
      wp.risks.push({ text: 'New risk', severity: 'med' });
      markWpDirty();
      const pane = document.querySelector('.page-opp-detail .plan-pane[data-pane="winplan"]');
      if (pane) { pane.innerHTML = winPlanHtml(wp); bindDetail(); activateTab('winplan'); }
    });

    document.querySelectorAll('.wp-remove-risk').forEach(btn => {
      btn.addEventListener('click', () => {
        const wp = detailState.winPlan;
        if (!wp) return;
        const idx = Number(btn.dataset.riskIdx);
        wp.risks = (wp.risks || []).filter((_, i) => i !== idx);
        markWpDirty();
        const pane = document.querySelector('.page-opp-detail .plan-pane[data-pane="winplan"]');
        if (pane) { pane.innerHTML = winPlanHtml(wp); bindDetail(); activateTab('winplan'); }
      });
    });

    const refreshBtn = document.getElementById('btn-refresh-conf');
    refreshBtn && refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing…';
      try {
        const r = await RI.Api.post('/api/agents/confidence-narrative/' + detailState.opp.sf_id, {});
        const n = document.getElementById('conf-narrative');
        if (n) n.textContent = r.narrative;
        RI.showToast((r._demo ? 'Demo ' : '') + 'narrative refreshed');
      } catch (e) { RI.showToast('Failed: ' + e.message, 'error'); }
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh narrative';
    });

    document.querySelectorAll('.ai-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const next = cb.checked ? 'done' : 'open';
        const wp = detailState.winPlan;
        if (!wp) return;
        const item = (wp.action_items || []).find(x => x.id === cb.dataset.aiId);
        if (item) { item.status = next; markWpDirty(); }
      });
    });

    bindNotesPane();
  }

  function activateTab(name) {
    document.querySelectorAll('.opp-tabs .plan-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.page-opp-detail .plan-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === name));
  }

  function bindNotesPane() {
    const form = document.getElementById('note-form');
    form && form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        meeting_date: document.getElementById('note-date').value,
        meeting_type: document.getElementById('note-type').value,
        participants: document.getElementById('note-participants').value.split(',').map(s => s.trim()).filter(Boolean),
        notes: document.getElementById('note-body').value.trim()
      };
      if (!body.notes) { RI.showToast('Add some note text first', 'error'); return; }
      try {
        await RI.Api.post('/api/opps/' + detailState.opp.sf_id + '/notes', body);
        RI.showToast('Note saved');
        renderDetail({ id: detailState.opp.sf_id });
        setTimeout(() => activateTab('notes'), 100);
      } catch (err) { RI.showToast('Save failed: ' + err.message, 'error'); }
    });

    document.querySelectorAll('.note-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this note?')) return;
        try {
          await RI.Api.del('/api/opps/' + detailState.opp.sf_id + '/notes/' + btn.dataset.noteId);
          RI.showToast('Note deleted');
          renderDetail({ id: detailState.opp.sf_id });
          setTimeout(() => activateTab('notes'), 100);
        } catch (err) { RI.showToast('Delete failed: ' + err.message, 'error'); }
      });
    });

    const analyzeBtn = document.getElementById('btn-analyze-notes');
    analyzeBtn && analyzeBtn.addEventListener('click', async () => {
      if (!detailState.notes.length) { RI.showToast('Add at least one note first', 'error'); return; }
      analyzeBtn.disabled = true;
      const original = analyzeBtn.textContent;
      analyzeBtn.textContent = 'Analyzing…';
      try {
        const a = await RI.Api.post('/api/agents/analyze-opp/' + detailState.opp.sf_id, {});
        RI.showToast('Confidence updated to ' + a.confidence_override + ' · close ' + a.projected_close_override);
        renderDetail({ id: detailState.opp.sf_id });
        setTimeout(() => activateTab('confidence'), 150);
      } catch (err) {
        RI.showToast('Analyze failed: ' + err.message, 'error');
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = original;
      }
    });
  }

  return { renderBoard, renderDetail };
})();
