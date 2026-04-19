const medpicss = require('./medpicss');

const MEDIAN_WON = 800000;

function compute(opp, account, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const lastActivity = opp._last_activity_at ? new Date(opp._last_activity_at) : new Date(opp.sf_created_date || now);
  const daysSince = Math.max(0, (now - lastActivity) / 86400000);

  const accountLeads = opts.leads || account?._leads || [];
  const Med = account && account.medpicss ? medpicss.completeness(account.medpicss, accountLeads) : 0;
  const Rec = 1 - clamp01(daysSince / 30);

  const activeLeadCount = opp._active_leads || 0;
  const hasChampion = opp._has_champion ? 1 : 0;
  const hasEconBuyer = opp._has_econ_buyer ? 1 : 0;
  const Stk = 0.4 * hasChampion + 0.3 * hasEconBuyer + 0.3 * Math.min(activeLeadCount / 4, 1);

  const competitorCount = opp._competitor_count || 0;
  const advantage = opp._we_have_advantage ? 1 : 0;
  const Cmp = clamp01(1 - 0.2 * competitorCount + 0.2 * advantage);

  const amount = opp.sf_amount || 0;
  const Siz = 1 - clamp01(Math.abs(amount - MEDIAN_WON) / MEDIAN_WON);

  const score = Math.round(100 * (0.30 * Med + 0.20 * Rec + 0.20 * Stk + 0.15 * Cmp + 0.15 * Siz));
  return {
    score: Math.max(0, Math.min(100, score)),
    components: { medpicss: round2(Med), recency: round2(Rec), stakeholder: round2(Stk), competitive: round2(Cmp), size_fit: round2(Siz) },
    updated_at: now.toISOString()
  };
}

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function round2(n) { return Math.round(n * 1000) / 1000; }

module.exports = { compute, MEDIAN_WON };
