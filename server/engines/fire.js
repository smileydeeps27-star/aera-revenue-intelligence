/**
 * FIRE score engine — pure functions.
 * FIRE = 0.30·Fit + 0.25·Intent + 0.20·Recency + 0.25·Engagement
 *
 * Fit (static, computed at creation time from account + campaign)
 * Intent (drifts per activity; decays 2 pts/wk)
 * Recency (100 - min(100, daysSinceLastActivity·2))
 * Engagement (active leads + champion/econ-buyer bonuses)
 */

const INTENT_DELTAS = {
  content_view: 3,
  event_attend: 12,
  email_reply: 8,          // positive sentiment
  email_reply_negative: -4,
  bdr_call: 6,             // long call (>10 min)
  meeting: 10,
  email_sent: 0
};
const INTENT_START = 30;
const INTENT_CAP_PER_KIND = 20;
const INTENT_DECAY_PER_WEEK = 2;

function compute({ fit = 60, intent = 30, recency = 70, engagement = 40, updated_at } = {}) {
  const f = clamp(fit), i = clamp(intent), r = clamp(recency), e = clamp(engagement);
  const score = Math.round(0.30 * f + 0.25 * i + 0.20 * r + 0.25 * e);
  return { score: clamp(score), fit: f, intent: i, recency: r, engagement: e, updated_at: updated_at || new Date().toISOString() };
}

function computeFit(account) {
  let fit = 0;
  const industryMatch = account.sf_industry && ['Logistics', 'CPG', 'Pharma', 'Manufacturing', 'Retail', 'Hi-Tech'].includes(account.sf_industry);
  fit += industryMatch ? 40 : 15;
  const revenue = account.sf_annual_revenue || 0;
  if (revenue >= 500000000 && revenue <= 100000000000) fit += 25;
  else if (revenue >= 100000000) fit += 15;
  const employees = account.sf_employees || 0;
  if (employees >= 1000 && employees <= 200000) fit += 15;
  else if (employees >= 200) fit += 8;
  if (account.sf_billing_country) fit += 10;
  // Persona coverage — bumped when leads are attached (Phase 3)
  const leadsN = (account.stakeholder_lead_ids || []).length;
  fit += Math.min(10, leadsN * 2);
  return clamp(fit);
}

function computeRecency(activities, now) {
  const t = now ? new Date(now) : new Date();
  if (!activities || activities.length === 0) return 50;
  const last = activities.reduce((m, a) => {
    const d = new Date(a.occurred_at || a.created_at || 0).getTime();
    return d > m ? d : m;
  }, 0);
  if (!last) return 50;
  const days = Math.max(0, (t - last) / 86400000);
  return clamp(100 - Math.min(100, days * 2));
}

function computeIntent(activities, now) {
  const t = now ? new Date(now) : new Date();
  let intent = INTENT_START;
  const byKind = {};
  for (const a of activities || []) {
    const kind = a.kind;
    const delta = INTENT_DELTAS[kind];
    if (delta == null) continue;
    byKind[kind] = byKind[kind] || { applied: 0, positive: 0 };
    // Cap the positive contribution per kind at INTENT_CAP_PER_KIND
    if (delta > 0) {
      const next = Math.min(INTENT_CAP_PER_KIND, byKind[kind].positive + delta);
      const added = next - byKind[kind].positive;
      intent += added;
      byKind[kind].positive = next;
    } else {
      intent += delta;
    }
    byKind[kind].applied += delta;
  }
  // Time decay since last activity
  const last = (activities || []).reduce((m, a) => Math.max(m, new Date(a.occurred_at || 0).getTime()), 0);
  if (last) {
    const weeks = Math.max(0, (t - last) / (86400000 * 7));
    intent -= weeks * INTENT_DECAY_PER_WEEK;
  }
  return clamp(Math.round(intent));
}

function computeEngagement(activities, leads, now) {
  const t = now ? new Date(now) : new Date();
  const ls = leads || [];
  const activeLeads = ls.filter(l => l.active !== false);
  let score = Math.min(40, activeLeads.length * 8);
  if (activeLeads.length) {
    const recentCount = activeLeads.filter(l => {
      if (!l.last_interaction_at) return false;
      const d = (t - new Date(l.last_interaction_at)) / 86400000;
      return d <= 14;
    }).length;
    score += Math.round((recentCount / activeLeads.length) * 30);
  }
  if (activeLeads.some(l => l.role_in_deal === 'champion')) score += 20;
  if (activeLeads.some(l => l.role_in_deal === 'decision_maker')) score += 10;
  return clamp(score);
}

function recompute(account, activities, leads, opts = {}) {
  const fit = account.fire && account.fire.fit != null ? account.fire.fit : computeFit(account);
  const intent = computeIntent(activities, opts.now);
  const recency = computeRecency(activities, opts.now);
  const engagement = computeEngagement(activities, leads, opts.now);
  return compute({ fit, intent, recency, engagement });
}

function initial(account = {}) {
  const fit = computeFit(account);
  return compute({ fit, intent: INTENT_START, recency: 60, engagement: 35 });
}

function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

module.exports = { compute, initial, recompute, computeFit, computeIntent, computeRecency, computeEngagement, INTENT_DELTAS };
