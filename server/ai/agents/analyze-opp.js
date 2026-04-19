/**
 * A11 — Opportunity analysis agent.
 *
 * Reads every meeting note for an opp + comparable closed deals (same industry,
 * similar amount). Produces:
 *   - signals[]: concrete observations from the notes, each mapped to a
 *     confidence component ± magnitude
 *   - confidence_override: final score the system should present
 *   - projected_close_override: adjusted close date
 *   - rationale: paragraph for the CRO
 *   - comparable_deals[]: the historical deals the analysis leaned on
 */
const gemini = require('../gemini');
const { SellerProfile } = require('../seller-profile');

const POSITIVE_KEYWORDS = [
  { re: /\bchampion\b.*(confirmed|committed|engaged|on board|will advocate)/i, component: 'stakeholder', delta: 8, signal: 'Champion confirmed + committed' },
  { re: /\b(economic buyer|cfo|econ buyer)\b.*(meeting|confirmed|aligned|agreed)/i, component: 'stakeholder', delta: 10, signal: 'Economic buyer meeting secured' },
  { re: /\b(success criteria|kpis?)\b.*(signed|agreed|locked|committed)/i, component: 'medpicss', delta: 7, signal: 'Success criteria locked with champion' },
  { re: /\b(decision criteria|eval criteria)\b.*(signed|agreed|shared)/i, component: 'medpicss', delta: 5, signal: 'Decision criteria shared' },
  { re: /\b(demo|pov|poc)\b.*(successful|strong|great|positive|approved)/i, component: 'medpicss', delta: 6, signal: 'Demo / PoV landed well' },
  { re: /\b(kinaxis|blue yonder|sap ibp|o9)\b.*(eliminated|ruled out|dropped|not proceeding)/i, component: 'competitive', delta: 12, signal: 'Competitor eliminated' },
  { re: /\bbudget\b.*(approved|secured|confirmed)/i, component: 'medpicss', delta: 6, signal: 'Budget approved' },
  { re: /\b(legal|procurement|security)\b.*(approved|cleared|complete)/i, component: 'recency', delta: 5, signal: 'Procurement / legal clearance achieved' },
  { re: /\b(verbal yes|verbal commit|verbal)\b/i, component: 'recency', delta: 10, signal: 'Verbal commitment received' },
  { re: /\b(mutual action plan|map|mutual plan)\b.*(signed|agreed)/i, component: 'recency', delta: 7, signal: 'Mutual action plan signed' }
];

const NEGATIVE_KEYWORDS = [
  { re: /\bchampion\b.*(left|departed|moved on|job change|unreachable|silent)/i, component: 'stakeholder', delta: -15, signal: 'Champion left / gone silent' },
  { re: /\b(kinaxis|blue yonder|sap ibp|o9)\b.*(selected|chosen|preferred|leading)/i, component: 'competitive', delta: -15, signal: 'Competitor gaining preference' },
  { re: /\b(budget|funding)\b.*(cut|frozen|delayed|deferred|not available)/i, component: 'recency', delta: -12, signal: 'Budget delay / freeze' },
  { re: /\blegal\b.*(concerns|blocker|60[- ]?day|90[- ]?day|review|redlines)/i, component: 'recency', delta: -8, signal: 'Legal review extending timeline' },
  { re: /\bprocurement\b.*(slow|delay|queue|backlog)/i, component: 'recency', delta: -6, signal: 'Procurement process friction' },
  { re: /\b(reorg|reorganization|restructur|layoff)/i, component: 'stakeholder', delta: -10, signal: 'Customer reorg / restructuring' },
  { re: /\b(pilot|pov)\b.*(extended|rescheduled|paused|delayed)/i, component: 'recency', delta: -7, signal: 'Pilot slip' },
  { re: /\b(price|pricing|cost)\b.*(pushback|too high|concern|objection)/i, component: 'medpicss', delta: -6, signal: 'Pricing pushback' },
  { re: /\bstakeholder\b.*(new|unknown|surfaced|blocker)/i, component: 'stakeholder', delta: -5, signal: 'New blocker / unknown stakeholder surfaced' },
  { re: /\bcio\b.*(concerns|pushback|security review)/i, component: 'medpicss', delta: -5, signal: 'CIO raised technical concerns' }
];

const CLOSE_DATE_SIGNALS = [
  { re: /\b(close|sign).*(this quarter|q[1-4])/i, days: -14, signal: 'Target named a quarter → tighter window' },
  { re: /\b(verbal|soft)\s+(yes|commit)/i, days: -21, signal: 'Verbal commitment pulls close date forward' },
  { re: /\b60[- ]?day (review|legal|procurement)/i, days: +14, signal: 'Legal review pushes close +14d' },
  { re: /\b90[- ]?day (review|legal|procurement)/i, days: +30, signal: '90-day review pushes close +30d' },
  { re: /\b(pilot|pov).*(extended|reschedul|delayed)/i, days: +21, signal: 'Pilot slip pushes close' },
  { re: /\b(next quarter|fy[0-9]+ q[1-4])\b/i, days: +30, signal: 'Target slipped to next quarter' }
];

function extractSignalsFromNotes(notes) {
  const combined = notes.map(n => (n.notes || '')).join('\n---\n');
  const signals = [];
  for (const kw of POSITIVE_KEYWORDS) {
    if (kw.re.test(combined)) signals.push({ signal: kw.signal, component: kw.component, delta: kw.delta, direction: 'positive' });
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (kw.re.test(combined)) signals.push({ signal: kw.signal, component: kw.component, delta: kw.delta, direction: 'negative' });
  }
  let closeDelta = 0;
  const closeReasons = [];
  for (const cs of CLOSE_DATE_SIGNALS) {
    if (cs.re.test(combined)) { closeDelta += cs.days; closeReasons.push(cs.signal); }
  }
  return { signals, closeDelta, closeReasons };
}

function findComparableDeals(opp, allOpps, accountsById) {
  const thisAcct = accountsById.get(opp.sf_account_id);
  const thisIndustry = thisAcct ? thisAcct.sf_industry : null;
  const thisAmount = opp.sf_amount || 0;
  return allOpps
    .filter(o => o.sf_id !== opp.sf_id)
    .filter(o => o.internal_stage === 'closed_won' || o.internal_stage === 'closed_lost')
    .map(o => {
      const acct = accountsById.get(o.sf_account_id);
      const industryMatch = acct && thisIndustry && acct.sf_industry === thisIndustry;
      const amountDelta = thisAmount ? Math.abs((o.sf_amount || 0) - thisAmount) / thisAmount : 1;
      const sizeScore = Math.max(0, 1 - amountDelta);
      const score = (industryMatch ? 0.6 : 0.1) + sizeScore * 0.4;
      return {
        sf_id: o.sf_id,
        account_name: acct ? acct.sf_name : 'Unknown',
        industry: acct ? acct.sf_industry : null,
        outcome: o.internal_stage,
        amount: o.sf_amount,
        close_date: o.sf_close_date,
        days_to_close_from_created: Math.round((new Date(o.sf_close_date) - new Date(o.sf_created_date)) / 86400000),
        similarity_score: Math.round(score * 100),
        similarity_reason: industryMatch ? 'Same industry' : 'Different industry',
        size_match_pct: Math.round(sizeScore * 100)
      };
    })
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, 5);
}

function buildRationaleText({ signals, comparables, closeReasons, finalScore, baseScore, closeDelta }) {
  const pos = signals.filter(s => s.direction === 'positive');
  const neg = signals.filter(s => s.direction === 'negative');
  const parts = [];
  parts.push('Confidence ' + finalScore + ' (base ' + baseScore + (finalScore - baseScore >= 0 ? ' +' : ' ') + (finalScore - baseScore) + ' from meeting notes).');
  if (pos.length) parts.push('Positive signals: ' + pos.map(s => s.signal).slice(0, 3).join('; ') + '.');
  if (neg.length) parts.push('Risks surfaced: ' + neg.map(s => s.signal).slice(0, 3).join('; ') + '.');
  if (closeReasons.length) parts.push('Close-date adjusted ' + (closeDelta >= 0 ? '+' : '') + closeDelta + ' days — ' + closeReasons.slice(0, 2).join('; ') + '.');
  if (comparables.length) {
    const won = comparables.filter(c => c.outcome === 'closed_won');
    const winRate = comparables.length ? Math.round((won.length / comparables.length) * 100) : 0;
    parts.push('Historical comparables: ' + comparables.length + ' similar deals, ' + winRate + '% win rate; typical cycle ' + Math.round(comparables.reduce((s, c) => s + c.days_to_close_from_created, 0) / comparables.length) + ' days.');
  }
  return parts.join(' ');
}

async function analyze({ opp, account, notes, allOpps, accountsById, baseConfidence, basProjectedClose, now }) {
  const effectiveNow = now ? new Date(now) : new Date();

  const comparables = findComparableDeals(opp, allOpps, accountsById);
  const { signals, closeDelta, closeReasons } = extractSignalsFromNotes(notes);

  // Apply signals to the base confidence score
  const totalDelta = signals.reduce((s, x) => s + x.delta, 0);
  const baseScore = baseConfidence && baseConfidence.score != null ? baseConfidence.score : 50;
  const finalScore = Math.max(0, Math.min(100, baseScore + totalDelta));

  // Apply close-date delta
  const baseDate = basProjectedClose && basProjectedClose.date ? new Date(basProjectedClose.date) : new Date(effectiveNow.getTime() + 60 * 86400000);
  const adjustedDate = new Date(baseDate.getTime() + closeDelta * 86400000);
  const projectedCloseOverride = adjustedDate.toISOString().slice(0, 10);

  // Try live Gemini narrative; fall back to deterministic prose
  let rationale;
  if (gemini.keyConfigured() && notes.length) {
    try {
      rationale = await generateNarrative({ opp, account, notes, signals, comparables, finalScore, baseScore, closeDelta, closeReasons });
    } catch (e) { /* fall through */ }
  }
  if (!rationale) {
    rationale = buildRationaleText({ signals, comparables, closeReasons, finalScore, baseScore, closeDelta });
  }

  return {
    generated_at: effectiveNow.toISOString(),
    notes_analyzed: notes.length,
    signals,
    close_reasons: closeReasons,
    close_delta_days: closeDelta,
    confidence_base: baseScore,
    confidence_override: finalScore,
    projected_close_override: projectedCloseOverride,
    comparable_deals: comparables,
    rationale
  };
}

async function generateNarrative({ opp, account, notes, signals, comparables, finalScore, baseScore, closeDelta, closeReasons }) {
  const system = 'You are a senior Aera Client Partner writing a short, candid CRO-facing read-out of the latest meeting notes for a live opportunity. Be concrete. Cite specific signals. No preamble, no headings, plain prose, 4-6 sentences.';
  const msg = 'Opportunity: ' + opp.sf_name + ' · stage ' + opp.internal_stage + ' · $' + (opp.sf_amount || 0) + '\n' +
    'Account: ' + (account ? account.sf_name + ' (' + account.sf_industry + ')' : '?') + '\n' +
    'Notes analyzed: ' + notes.length + '\n' +
    'Base confidence: ' + baseScore + ' → adjusted: ' + finalScore + '\n' +
    'Signals detected:\n' + signals.map(s => '  - [' + s.direction + ' ' + s.delta + '] ' + s.component + ': ' + s.signal).join('\n') + '\n' +
    (closeReasons.length ? 'Close date adjusted ' + closeDelta + 'd: ' + closeReasons.join('; ') + '\n' : '') +
    (comparables.length ? 'Comparable historical deals: ' + comparables.map(c => c.account_name + ' (' + c.outcome + ', $' + c.amount + ', ' + c.days_to_close_from_created + 'd cycle)').join('; ') + '\n' : '') +
    '\nMeeting notes:\n' + notes.slice(-3).map(n => '[' + n.meeting_date + '] ' + (n.notes || '').slice(0, 800)).join('\n---\n') +
    '\nWrite the rationale now.';
  const out = await gemini.call(system, msg, 512);
  return (out || '').trim();
}

module.exports = { analyze };
