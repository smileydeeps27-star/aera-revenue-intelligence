const STAGE_ORDER = ['discovery', 'validation', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
const STAGE_AVG_DAYS = { discovery: 21, validation: 22, proposal: 18, negotiation: 16 };

function project(opp, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const stage = opp.internal_stage || 'discovery';
  if (stage === 'closed_won' || stage === 'closed_lost') {
    return { date: (opp.sf_close_date || now.toISOString().slice(0, 10)), delta_days_from_sf: 0, reason: 'Closed' };
  }

  const idx = STAGE_ORDER.indexOf(stage);
  const remaining = STAGE_ORDER.slice(idx, 4);
  let days = 0;
  for (const s of remaining) days += STAGE_AVG_DAYS[s] || 20;

  const inStage = opp._days_in_stage || 0;
  days -= Math.min(inStage, (STAGE_AVG_DAYS[stage] || 20) / 2);

  const velocity = opp._velocity_factor || 1.0;
  const projected = new Date(now.getTime() + days * velocity * 86400000);
  const isoDate = projected.toISOString().slice(0, 10);

  const sfDate = opp.sf_close_date ? new Date(opp.sf_close_date) : null;
  const delta = sfDate ? Math.round((projected - sfDate) / 86400000) : 0;

  return {
    date: isoDate,
    delta_days_from_sf: delta,
    reason: 'Stages remaining: ' + remaining.join(', ') + '. Est ' + Math.round(days * velocity) + ' days.'
  };
}

module.exports = { project, STAGE_ORDER, STAGE_AVG_DAYS };
