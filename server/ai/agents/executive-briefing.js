/**
 * A12 — Executive briefing agent.
 *
 * Given the in-scope opps + activities + closed-deal history for a role (and
 * optionally a selected-quarter filter), produce:
 *   - summary: 3-4 sentences on the quarter
 *   - forecast: commit / best-case / gap to target
 *   - risks[]: ranked, each with { opp, reasoning, components }
 *   - mitigations[]: concrete plays tied to specific risks
 *   - momentum[]: bright spots to amplify
 */
const gemini = require('../gemini');
const { SellerProfile } = require('../seller-profile');

function currency(n) {
  if (!n) return '$0';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}

function quarterKey(dateStr) {
  const d = new Date(dateStr);
  return d.getUTCFullYear() + '-Q' + (Math.floor(d.getUTCMonth() / 3) + 1);
}

function targetDate(opp) {
  if (opp.internal_stage === 'closed_won' || opp.internal_stage === 'closed_lost') return opp.sf_close_date;
  return (opp.projected_close && opp.projected_close.date) || opp.sf_close_date;
}

function computeFacts({ role, user, opps, activities, selectedQuarters, allOpps }) {
  const inScopeQ = selectedQuarters && selectedQuarters.length
    ? opps.filter(o => selectedQuarters.includes(quarterKey(targetDate(o))))
    : opps;

  const open = inScopeQ.filter(o => !o.internal_stage.startsWith('closed'));
  const closedWon = inScopeQ.filter(o => o.internal_stage === 'closed_won');
  const closedLost = inScopeQ.filter(o => o.internal_stage === 'closed_lost');

  const totalAmount = open.reduce((s, o) => s + (o.sf_amount || 0), 0);
  const weighted = open.reduce((s, o) => s + (o.sf_amount || 0) * ((o.confidence && o.confidence.score) || 0) / 100, 0);
  const commit = open.filter(o => (o.confidence && o.confidence.score) >= 70).reduce((s, o) => s + (o.sf_amount || 0), 0);
  const bestCase = open.filter(o => (o.confidence && o.confidence.score) >= 40).reduce((s, o) => s + (o.sf_amount || 0), 0);

  // At-risk: slipping > 30d, OR low confidence for late-stage, OR override dropped significantly
  const risks = open.map(o => {
    const reasons = [];
    let severity = 0;
    const conf = (o.confidence && o.confidence.score) || 0;
    const delta = (o.projected_close && o.projected_close.delta_days_from_sf) || 0;
    if (delta > 30) { reasons.push('projected close slipped +' + delta + 'd vs. SF date'); severity += Math.min(40, delta / 2); }
    if ((o.internal_stage === 'proposal' || o.internal_stage === 'negotiation') && conf < 55) {
      reasons.push('late stage (' + o.internal_stage + ') but confidence only ' + conf); severity += 25;
    }
    if (o._has_champion === false) { reasons.push('no active champion'); severity += 15; }
    if (o._has_econ_buyer === false && (o.internal_stage === 'proposal' || o.internal_stage === 'negotiation')) {
      reasons.push('no economic buyer engaged at ' + o.internal_stage); severity += 20;
    }
    if (o._competitor_count >= 2) { reasons.push(o._competitor_count + ' competitors active'); severity += 10; }
    // Meeting-note signals pulled in from opp.analysis
    const neg = (o.analysis && o.analysis.signals || []).filter(s => s.direction === 'negative');
    for (const s of neg.slice(0, 3)) { reasons.push(s.signal); severity += Math.abs(s.delta); }
    return { opp: o, reasons, severity };
  })
    .filter(r => r.reasons.length > 0 && r.severity > 0)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 6);

  // Momentum: big positive swings from meeting-note analysis OR high-conf late-stage deals
  const momentum = open.map(o => {
    const reasons = [];
    let score = 0;
    const conf = (o.confidence && o.confidence.score) || 0;
    if (conf >= 75 && (o.internal_stage === 'proposal' || o.internal_stage === 'negotiation')) {
      reasons.push('late stage + high confidence ' + conf); score += 30;
    }
    const pos = (o.analysis && o.analysis.signals || []).filter(s => s.direction === 'positive');
    for (const s of pos.slice(0, 2)) { reasons.push(s.signal); score += s.delta; }
    if (o._has_champion && o._has_econ_buyer) { reasons.push('champion + econ buyer engaged'); score += 10; }
    return { opp: o, reasons, score };
  })
    .filter(m => m.reasons.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  // Activity pulse — active vs dormant accounts
  const byAccount = {};
  const cutoff = Date.now() - 14 * 86400000;
  for (const a of activities) {
    if (new Date(a.occurred_at).getTime() >= cutoff) {
      byAccount[a.account_id] = (byAccount[a.account_id] || 0) + 1;
    }
  }
  const accountIds = new Set(inScopeQ.map(o => o.sf_account_id));
  const activeAccounts = Array.from(accountIds).filter(id => (byAccount[id] || 0) > 0).length;
  const dormantAccounts = accountIds.size - activeAccounts;

  // Historical comparable: closed deals in same industries
  const industries = new Set(inScopeQ.map(o => o._account && o._account.industry).filter(Boolean));
  const comparables = (allOpps || [])
    .filter(o => o.internal_stage === 'closed_won' || o.internal_stage === 'closed_lost')
    .slice(0, 20);
  const compWinRate = comparables.length
    ? Math.round(comparables.filter(c => c.internal_stage === 'closed_won').length / comparables.length * 100)
    : null;

  return {
    scope: { role, user_name: user ? user.name : null, quarters: selectedQuarters || null },
    totals: {
      open_count: open.length,
      open_amount: totalAmount,
      weighted,
      commit,
      best_case: bestCase,
      won_count: closedWon.length,
      won_amount: closedWon.reduce((s, o) => s + (o.sf_amount || 0), 0),
      lost_count: closedLost.length,
      lost_amount: closedLost.reduce((s, o) => s + (o.sf_amount || 0), 0)
    },
    active_accounts: activeAccounts,
    dormant_accounts: dormantAccounts,
    historical_win_rate: compWinRate,
    risks,
    momentum
  };
}

function mitigationsFor(risks) {
  const out = [];
  for (const r of risks.slice(0, 6)) {
    const o = r.opp;
    const playbook = [];
    for (const reason of r.reasons) {
      if (/champion/i.test(reason) && /no active|gone silent|left/i.test(reason)) {
        playbook.push('Identify a backup champion via LinkedIn + recent activities; target their manager in the next 5 days.');
      } else if (/economic buyer|econ buyer/i.test(reason)) {
        playbook.push('Ask current champion for a 30-min introduction to the CFO/COO before stage gate.');
      } else if (/projected close slipped|slipped|legal review|60-day|90-day/i.test(reason)) {
        playbook.push('Lock a mutual action plan with explicit legal + procurement milestones and weekly checkpoints.');
      } else if (/competitor|kinaxis|blue yonder|o9|sap ibp/i.test(reason)) {
        playbook.push('Schedule a head-to-head differentiation session; lead with autonomous execution + explainability.');
      } else if (/confidence only|late stage/i.test(reason)) {
        playbook.push('Escalate for an executive sponsor call; time-box to 15 min with quantified value model.');
      } else if (/budget|funding/i.test(reason)) {
        playbook.push('Reframe the ROI model to map to the customer\'s stated FY27 savings commitment.');
      } else if (/pricing pushback/i.test(reason)) {
        playbook.push('Offer a phased commercial structure tied to realized value milestones.');
      } else {
        playbook.push('Book an account review with the full pursuit team this week.');
      }
    }
    out.push({ opp_id: o.sf_id, opp_name: o.sf_name, actions: Array.from(new Set(playbook)).slice(0, 3) });
  }
  return out;
}

function buildNarrative(facts) {
  const { totals, scope, risks, momentum, active_accounts, dormant_accounts, historical_win_rate } = facts;
  const bits = [];
  const roleLabel = { cp: 'my book', rvp: 'the RVP team', cro: 'the org', ceo: 'the company', bdr: 'my outbound' }[scope.role] || 'the scope';
  const qLabel = scope.quarters && scope.quarters.length ? 'across ' + scope.quarters.join(', ') : 'across the selected window';

  bits.push('Executive briefing for ' + roleLabel + ' ' + qLabel + '. ' +
    totals.open_count + ' open opps totaling ' + currency(totals.open_amount) +
    ' (commit ' + currency(totals.commit) + ' @ ≥70 conf, best-case ' + currency(totals.best_case) + ' @ ≥40), weighted ' + currency(totals.weighted) + '.');
  if (totals.won_count) bits.push('Closed-won in window: ' + totals.won_count + ' deals worth ' + currency(totals.won_amount) + '.');
  if (historical_win_rate != null) bits.push('Historical win rate in comparable segments: ' + historical_win_rate + '%.');
  bits.push('Engagement pulse: ' + active_accounts + ' accounts touched in the last 14 days; ' + dormant_accounts + ' dormant and need a nudge.');
  if (risks.length) bits.push('Top risk: ' + risks[0].opp.sf_name + ' — ' + risks[0].reasons.slice(0, 2).join('; ') + '.');
  if (momentum.length) bits.push('Strongest momentum: ' + momentum[0].opp.sf_name + ' — ' + momentum[0].reasons.slice(0, 2).join('; ') + '.');
  return bits.join(' ');
}

async function generate({ role, user, opps, activities, selectedQuarters, allOpps }) {
  const facts = computeFacts({ role, user, opps, activities, selectedQuarters, allOpps });
  const mitigations = mitigationsFor(facts.risks);

  let summary;
  if (gemini.keyConfigured()) {
    try {
      summary = await geminiNarrative({ role, user, facts });
    } catch (e) { /* fall through */ }
  }
  if (!summary) summary = buildNarrative(facts);

  return {
    generated_at: new Date().toISOString(),
    role: facts.scope.role,
    user_name: facts.scope.user_name,
    selected_quarters: selectedQuarters || [],
    summary,
    totals: facts.totals,
    active_accounts: facts.active_accounts,
    dormant_accounts: facts.dormant_accounts,
    historical_win_rate: facts.historical_win_rate,
    risks: facts.risks.map(r => ({
      opp_id: r.opp.sf_id,
      opp_name: r.opp.sf_name,
      amount: r.opp.sf_amount,
      confidence: r.opp.confidence && r.opp.confidence.score,
      internal_stage: r.opp.internal_stage,
      projected_close: r.opp.projected_close && r.opp.projected_close.date,
      delta_days: r.opp.projected_close && r.opp.projected_close.delta_days_from_sf,
      severity: Math.round(r.severity),
      reasoning: r.reasons
    })),
    momentum: facts.momentum.map(m => ({
      opp_id: m.opp.sf_id,
      opp_name: m.opp.sf_name,
      amount: m.opp.sf_amount,
      confidence: m.opp.confidence && m.opp.confidence.score,
      internal_stage: m.opp.internal_stage,
      reasoning: m.reasons
    })),
    mitigations
  };
}

async function geminiNarrative({ role, user, facts }) {
  const sys = 'You are the Chief of Staff to the ' + (role || 'CRO').toUpperCase() + ' at ' + SellerProfile.companyName + '. Write a tight 4-5 sentence executive briefing. Be specific: call out the top risk by name, the top opportunity by name, and the most consequential number. Plain prose. No headings. No hedging.';
  const msg = 'Scope: ' + (user ? user.name : 'org') + '. Quarters: ' + (facts.scope.quarters || []).join(', ') + '\n' +
    'Totals: ' + JSON.stringify(facts.totals) + '\n' +
    'Active/dormant accounts: ' + facts.active_accounts + '/' + facts.dormant_accounts + '\n' +
    'Historical win rate: ' + (facts.historical_win_rate != null ? facts.historical_win_rate + '%' : 'n/a') + '\n' +
    'Top risks:\n' + facts.risks.slice(0, 3).map(r => '- ' + r.opp.sf_name + ' ($' + r.opp.sf_amount + ', stage ' + r.opp.internal_stage + '): ' + r.reasons.join('; ')).join('\n') + '\n' +
    'Top momentum:\n' + facts.momentum.slice(0, 3).map(m => '- ' + m.opp.sf_name + ' ($' + m.opp.sf_amount + '): ' + m.reasons.join('; ')).join('\n') + '\n' +
    'Write the briefing now.';
  const out = await gemini.call(sys, msg, 512);
  return (out || '').trim();
}

module.exports = { generate };
