const sfdc = require('../sfdc').getAdapter();
const accounts = require('./accounts.routes');
const opps = require('./opps.routes');
const users = require('./users.routes');
const store = require('../store');

function formatCurrency(n) {
  if (!n || n < 1000) return '$' + (n || 0);
  if (n >= 1000000000) return '$' + (n / 1000000000).toFixed(1) + 'B';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  return '$' + Math.round(n / 1000) + 'K';
}

async function get(req, res, { params, query }) {
  const role = params.role || 'cp';
  const user = query.user_id
    ? await users.getById(query.user_id)
    : await users.defaultUserFor(role);
  const userId = user ? user.id : null;

  const scope = await users.scopeFor(role, userId);

  const sfAccounts = (await sfdc.listAccounts()).filter(a => scope.accountIds.has(a.sf_id));
  const composedAccounts = await Promise.all(sfAccounts.map(accounts.compose));
  const sfOpps = (await sfdc.listOpps()).filter(o => scope.accountIds.has(o.sf_account_id));
  const composedOpps = await Promise.all(sfOpps.map(opps.composeOpp));

  const allUsers = await store.readAll('users');

  const common = {
    role,
    user: user ? { id: user.id, name: user.name, role: user.role } : null,
    scopeLabel: scope.scopeLabel,
    scopeAccountCount: scope.accountIds.size,
    pipelineByStage: buildPipelineByStage(composedOpps),
    forecastRisk: buildForecastRisk(composedOpps),
    quarterly: buildQuarterly(composedOpps)
  };

  if (role === 'cp') return { ...common, ...cpView(composedAccounts, composedOpps) };
  if (role === 'rvp') return { ...common, ...rvpView(composedAccounts, composedOpps, allUsers, user) };
  if (role === 'cro') return { ...common, ...croView(composedAccounts, composedOpps, allUsers) };
  if (role === 'ceo') return { ...common, ...ceoView(composedAccounts, composedOpps, await store.readAll('activities')) };
  if (role === 'bdr') return { ...common, ...bdrView(composedAccounts, composedOpps, await store.readAll('activities'), userId) };
  return common;
}

// ---------- role-specific views ----------

function cpView(accts, opps) {
  const openOpps = opps.filter(o => !o.internal_stage.startsWith('closed'));
  const weighted = weightedForecast(openOpps);
  return {
    tiles: [
      { id: 'my_accounts', label: 'My accounts', value: accts.length, sub: accts.filter(a => a.warmup_stage === 'spun_out').length + ' spun out' },
      { id: 'open_opps', label: 'Open opportunities', value: openOpps.length, sub: formatCurrency(openOpps.reduce((s, o) => s + (o.sf_amount || 0), 0)) + ' total' },
      { id: 'forecast', label: 'Confidence-weighted forecast', value: formatCurrency(weighted), sub: openOpps.length + ' opps' },
      { id: 'avg_fire', label: 'Avg FIRE', value: accts.length ? Math.round(accts.reduce((s, a) => s + a.fire.score, 0) / accts.length) : 0, sub: 'My pipeline warmth' }
    ],
    topAccounts: accts.sort((a, b) => b.fire.score - a.fire.score).slice(0, 5).map(slimAccount),
    recentOpps: opps.slice(-5).reverse().map(slimOpp)
  };
}

function rvpView(accts, opps, allUsers, rvp) {
  const openOpps = opps.filter(o => !o.internal_stage.startsWith('closed'));
  const cps = allUsers.filter(u => u.role === 'cp' && u.parent_id === (rvp && rvp.id));
  const cpIds = new Set(cps.map(c => c.id));
  const atRisk = openOpps.filter(o => Math.abs(o.projected_close.delta_days_from_sf || 0) >= 30);
  const weighted = weightedForecast(openOpps);

  const byCp = cps.map(cp => {
    const cpAccts = accts.filter(a => a.owner_user_id === cp.id);
    const cpOpps = opps.filter(o => cpAccts.some(a => a.sf_id === o.sf_account_id) && !o.internal_stage.startsWith('closed'));
    return {
      user_id: cp.id,
      name: cp.name,
      accounts: cpAccts.length,
      opps: cpOpps.length,
      amount: cpOpps.reduce((s, o) => s + (o.sf_amount || 0), 0),
      weighted: cpOpps.reduce((s, o) => s + (o.sf_amount || 0) * (o.confidence.score || 0) / 100, 0),
      avgFire: cpAccts.length ? Math.round(cpAccts.reduce((s, a) => s + a.fire.score, 0) / cpAccts.length) : 0
    };
  });

  return {
    tiles: [
      { id: 'team_size', label: 'CPs on my team', value: cps.length, sub: accts.length + ' accounts across the team' },
      { id: 'open_opps', label: 'Team open opps', value: openOpps.length, sub: formatCurrency(openOpps.reduce((s, o) => s + (o.sf_amount || 0), 0)) + ' total' },
      { id: 'forecast', label: 'Weighted forecast', value: formatCurrency(weighted), sub: openOpps.length + ' opps' },
      { id: 'at_risk', label: 'At-risk deals', value: atRisk.length, sub: '|Δ close| ≥ 30 days' }
    ],
    teamRollup: byCp,
    atRisk: atRisk.map(slimOpp)
  };
}

function croView(accts, opps, allUsers) {
  const openOpps = opps.filter(o => !o.internal_stage.startsWith('closed'));
  const rvps = allUsers.filter(u => u.role === 'rvp');

  const byRvp = rvps.map(rvp => {
    const cpIds = allUsers.filter(u => u.role === 'cp' && u.parent_id === rvp.id).map(u => u.id);
    const rvpAccts = accts.filter(a => cpIds.includes(a.owner_user_id));
    const rvpOpps = opps.filter(o => rvpAccts.some(a => a.sf_id === o.sf_account_id) && !o.internal_stage.startsWith('closed'));
    return {
      user_id: rvp.id,
      name: rvp.name,
      cps: cpIds.length,
      accounts: rvpAccts.length,
      opps: rvpOpps.length,
      amount: rvpOpps.reduce((s, o) => s + (o.sf_amount || 0), 0),
      weighted: rvpOpps.reduce((s, o) => s + (o.sf_amount || 0) * (o.confidence.score || 0) / 100, 0)
    };
  });

  const won = opps.filter(o => o.internal_stage === 'closed_won');
  const lost = opps.filter(o => o.internal_stage === 'closed_lost');
  const winRate = (won.length + lost.length) > 0 ? won.length / (won.length + lost.length) : 0;

  return {
    tiles: [
      { id: 'open_opps', label: 'Open pipeline', value: openOpps.length, sub: formatCurrency(openOpps.reduce((s, o) => s + (o.sf_amount || 0), 0)) + ' total' },
      { id: 'weighted', label: 'Weighted forecast', value: formatCurrency(weightedForecast(openOpps)), sub: 'Confidence-weighted' },
      { id: 'win_rate', label: 'Win rate (LTD)', value: Math.round(winRate * 100) + '%', sub: won.length + 'W · ' + lost.length + 'L' },
      { id: 'at_risk', label: 'At-risk deals', value: openOpps.filter(o => Math.abs(o.projected_close.delta_days_from_sf || 0) >= 30).length, sub: '|Δ close| ≥ 30 days' }
    ],
    rvpRollup: byRvp
  };
}

function ceoView(accts, opps, activities) {
  const openOpps = opps.filter(o => !o.internal_stage.startsWith('closed'));
  const weighted = weightedForecast(openOpps);
  // Marketing → pipeline influence: count opps preceded by marketing activity within 60 days
  const MKT_KINDS = new Set(['content_view', 'event_attend']);
  const mktByAccount = {};
  for (const a of activities) {
    if (MKT_KINDS.has(a.kind)) {
      mktByAccount[a.account_id] = mktByAccount[a.account_id] || [];
      mktByAccount[a.account_id].push(new Date(a.occurred_at).getTime());
    }
  }
  const mktInfluenced = opps.filter(o => {
    const ts = mktByAccount[o.sf_account_id] || [];
    const created = new Date(o.sf_created_date).getTime();
    return ts.some(t => created - t > 0 && created - t <= 60 * 86400000);
  });
  const mktAmount = mktInfluenced.reduce((s, o) => s + (o.sf_amount || 0), 0);
  const totalAmount = opps.reduce((s, o) => s + (o.sf_amount || 0), 0);

  return {
    tiles: [
      { id: 'pipeline', label: 'Total pipeline', value: formatCurrency(openOpps.reduce((s, o) => s + (o.sf_amount || 0), 0)), sub: openOpps.length + ' open opps across ' + accts.length + ' accounts' },
      { id: 'weighted', label: 'Confidence-weighted forecast', value: formatCurrency(weighted), sub: 'Aggregated across org' },
      { id: 'mkt_influence', label: 'Marketing-influenced', value: Math.round((mktInfluenced.length / Math.max(opps.length, 1)) * 100) + '%', sub: mktInfluenced.length + ' opps · ' + formatCurrency(mktAmount) },
      { id: 'risk', label: 'At-risk pipeline', value: formatCurrency(openOpps.filter(o => Math.abs(o.projected_close.delta_days_from_sf || 0) >= 30).reduce((s, o) => s + (o.sf_amount || 0), 0)), sub: 'Deals slipping ≥ 30d' }
    ],
    influenceBreakdown: {
      influenced_opps: mktInfluenced.length,
      total_opps: opps.length,
      influenced_amount: mktAmount,
      total_amount: totalAmount
    }
  };
}

function bdrView(accts, opps, allActivities, bdrUserId) {
  const myActivities = allActivities.filter(a => a.actor_user_id === bdrUserId);
  const byKind = {};
  for (const a of myActivities) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
  const meetingsBooked = byKind['meeting'] || 0;
  const callsMade = byKind['bdr_call'] || 0;
  const emails = (byKind['email_sent'] || 0);
  const replies = (byKind['email_reply'] || 0) + (byKind['email_reply_negative'] || 0);
  const replyRate = emails > 0 ? replies / emails : 0;

  // Activities/day over last 30d
  const cutoff = Date.now() - 30 * 86400000;
  const recent = myActivities.filter(a => new Date(a.occurred_at).getTime() >= cutoff);
  const perDay = (recent.length / 30).toFixed(1);

  const byAccount = {};
  for (const a of myActivities) byAccount[a.account_id] = (byAccount[a.account_id] || 0) + 1;
  const topAccts = Object.entries(byAccount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sfId, count]) => {
      const acct = accts.find(x => x.sf_id === sfId);
      return acct ? { sf_id: sfId, sf_name: acct.sf_name, fire: acct.fire.score, activities: count } : null;
    })
    .filter(Boolean);

  return {
    tiles: [
      { id: 'activities', label: 'Activities (30d)', value: recent.length, sub: perDay + '/day' },
      { id: 'meetings', label: 'Meetings booked', value: meetingsBooked, sub: callsMade + ' BDR calls' },
      { id: 'reply_rate', label: 'Email reply rate', value: Math.round(replyRate * 100) + '%', sub: replies + ' replies of ' + emails + ' sent' },
      { id: 'accts', label: 'Accounts touched', value: Object.keys(byAccount).length, sub: 'Unique accounts with my activity' }
    ],
    activityMix: byKind,
    topAccounts: topAccts
  };
}

// ---------- helpers ----------
function weightedForecast(opps) {
  return Math.round(opps.reduce((s, o) => s + (o.sf_amount || 0) * ((o.confidence && o.confidence.score) || 0) / 100, 0));
}
function buildPipelineByStage(opps) {
  const out = {};
  for (const o of opps) {
    const k = o.internal_stage;
    out[k] = out[k] || { count: 0, amount: 0 };
    out[k].count += 1;
    out[k].amount += (o.sf_amount || 0);
  }
  return out;
}
function buildForecastRisk(opps) {
  return opps
    .filter(o => o.projected_close && Math.abs(o.projected_close.delta_days_from_sf || 0) >= 30 && !o.internal_stage.startsWith('closed'))
    .map(o => ({ sf_id: o.sf_id, sf_name: o.sf_name, amount: o.sf_amount, confidence: o.confidence.score, delta: o.projected_close.delta_days_from_sf, internal_stage: o.internal_stage }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);
}
// Aera's fiscal year runs Feb → Jan. FY27 = Feb 2026 – Jan 2027, named by its end year.
const FY_START_MONTH = 1; // 0-indexed: February

function fyShort(fy) { return fy % 100; }
function quarterOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  const m = d.getUTCMonth();
  const y = d.getUTCFullYear();
  const fm = (m - FY_START_MONTH + 12) % 12;         // Feb → 0, Jan → 11
  const fy = m >= FY_START_MONTH ? y + 1 : y;        // Feb 2026 is in FY2027
  const q = Math.floor(fm / 3) + 1;
  return { key: 'FY' + fyShort(fy) + '-Q' + q, label: 'Q' + q + ' FY' + fyShort(fy), year: fy, quarter: q };
}
function startOfQuarter(fy, q) {
  const startMonth = FY_START_MONTH + (q - 1) * 3;   // 1, 4, 7, 10 (Feb, May, Aug, Nov)
  return new Date(Date.UTC(fy - 1, startMonth, 1));
}
function endOfQuarter(fy, q) {
  const startMonth = FY_START_MONTH + (q - 1) * 3;
  const endMonthIdx = startMonth + 3;                 // first day of the NEXT quarter
  const endYear = (fy - 1) + Math.floor(endMonthIdx / 12);
  const endMonth = endMonthIdx % 12;
  return new Date(Date.UTC(endYear, endMonth, 0, 23, 59, 59)); // day 0 = last day of previous month
}
function addQuarters(fy, q, n) {
  const total = fy * 4 + (q - 1) + n;
  return { year: Math.floor(total / 4), quarter: (total % 4) + 1 };
}

function buildQuarterly(opps, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const current = quarterOf(now);

  function emptyBucket(year, quarter, offset) {
    // `year` is the fiscal year (FY27 = 2027). Labels show short FYxx form.
    const key = 'FY' + fyShort(year) + '-Q' + quarter;
    return {
      key,
      label: 'Q' + quarter + ' FY' + fyShort(year),
      year, quarter,
      is_current: offset === 0,
      is_past: offset < 0,
      offset,
      start: startOfQuarter(year, quarter).toISOString().slice(0, 10),
      end: endOfQuarter(year, quarter).toISOString().slice(0, 10),
      count: 0,
      amount: 0,
      weighted: 0,
      won_amount: 0,
      lost_amount: 0,
      stage_mix: { discovery: 0, validation: 0, proposal: 0, negotiation: 0, closed_won: 0, closed_lost: 0 }
    };
  }

  // Default window: prior Q through +3
  const byKey = new Map();
  for (const off of [-1, 0, 1, 2, 3]) {
    const { year, quarter } = addQuarters(current.year, current.quarter, off);
    const b = emptyBucket(year, quarter, off);
    byKey.set(b.key, b);
  }

  // Walk every opp and ensure its quarter exists
  for (const o of opps) {
    let targetDate;
    if (o.internal_stage === 'closed_won' || o.internal_stage === 'closed_lost') {
      targetDate = new Date(o.sf_close_date);
    } else {
      targetDate = new Date(o.projected_close && o.projected_close.date || o.sf_close_date);
    }
    const { key, year, quarter } = quarterOf(targetDate);
    if (!byKey.has(key)) {
      const diffQ = (year - current.year) * 4 + (quarter - current.quarter);
      byKey.set(key, emptyBucket(year, quarter, diffQ));
    }
    const b = byKey.get(key);
    b.count += 1;
    b.amount += (o.sf_amount || 0);
    b.weighted += (o.sf_amount || 0) * ((o.confidence && o.confidence.score) || 0) / 100;
    b.stage_mix[o.internal_stage] = (b.stage_mix[o.internal_stage] || 0) + (o.sf_amount || 0);
    if (o.internal_stage === 'closed_won') b.won_amount += (o.sf_amount || 0);
    if (o.internal_stage === 'closed_lost') b.lost_amount += (o.sf_amount || 0);
  }

  const buckets = Array.from(byKey.values()).sort((a, b) => a.offset - b.offset);
  for (const b of buckets) {
    b.amount = Math.round(b.amount);
    b.weighted = Math.round(b.weighted);
    b.won_amount = Math.round(b.won_amount);
    b.lost_amount = Math.round(b.lost_amount);
  }
  // Default selection: current + next 2 quarters (keeps the strip useful out of the box)
  const default_selected = buckets
    .filter(b => b.offset >= 0 && b.offset <= 2)
    .map(b => b.key);
  return { current_key: current.key, buckets, default_selected };
}

function slimAccount(a) { return { sf_id: a.sf_id, sf_name: a.sf_name, fire: a.fire.score, stage: a.warmup_stage }; }
function slimOpp(o) { return { sf_id: o.sf_id, sf_name: o.sf_name, amount: o.sf_amount, confidence: o.confidence.score, internal_stage: o.internal_stage, projected_close: o.projected_close.date, delta: o.projected_close.delta_days_from_sf }; }

module.exports = { get };
