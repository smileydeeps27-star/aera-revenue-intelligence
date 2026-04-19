const sfdc = require('../sfdc').getAdapter();
const store = require('../store');
const confidence = require('../engines/confidence');
const closeDate = require('../engines/close-date');
const accounts = require('./accounts.routes');

const COLL_ENRICH = 'opp_enrichment';
const COLL_WINPLANS = 'win_plans';

async function composeOpp(sfOpp) {
  if (!sfOpp) return null;
  const enrich = (await store.readOne(COLL_ENRICH, sfOpp.sf_id, 'sf_id')) || {};
  const acct = await accounts.compose(await sfdc.getAccount(sfOpp.sf_account_id));
  const leads = (await store.readAll('leads')).filter(l => l.sf_account_id === sfOpp.sf_account_id);
  const activities = (await store.readAll('activities')).filter(a => a.account_id === sfOpp.sf_account_id && (a.opportunity_id == null || a.opportunity_id === sfOpp.sf_id));

  const activeLeads = leads.filter(l => l.active !== false);
  const hasChampion = activeLeads.some(l => l.role_in_deal === 'champion');
  const hasEconBuyer = activeLeads.some(l => l.role_in_deal === 'decision_maker');

  // Competitor count from MEDPICSS competition note (naive split on comma/semicolon)
  const compNote = (acct && acct.medpicss && acct.medpicss.competition && acct.medpicss.competition.note) || '';
  const competitorCount = compNote.trim()
    ? compNote.split(/[,;]+/).map(s => s.trim()).filter(Boolean).length
    : 1;

  // Last activity — opp-scoped first, else account-scoped
  let lastActivity = enrich.last_activity_at || sfOpp.sf_created_date;
  if (activities.length) {
    const latest = activities.reduce((m, a) => a.occurred_at > m ? a.occurred_at : m, '0');
    if (latest > lastActivity) lastActivity = latest;
  }

  // Days in current stage
  const history = enrich.stage_history || [];
  const currentEntry = history.length ? history[history.length - 1] : null;
  const daysInStage = currentEntry
    ? Math.max(0, (Date.now() - new Date(currentEntry.entered_at).getTime()) / 86400000)
    : 0;

  // Velocity: accelerating when last 3 opp-account activities are tight
  const recent = activities
    .slice()
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
    .slice(0, 3);
  let velocity = 1.0;
  if (recent.length === 3) {
    const gaps = [];
    for (let i = 0; i < recent.length - 1; i++) {
      gaps.push((new Date(recent[i].occurred_at) - new Date(recent[i + 1].occurred_at)) / 86400000);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avgGap < 5) velocity = 0.85;
    else if (avgGap > 14) velocity = 1.25;
  }
  // Seed-time override (lets the generator spread projected close across quarters)
  if (enrich._velocity_override != null) velocity = enrich._velocity_override;

  const oppWithInternals = {
    ...sfOpp,
    internal_stage: enrich.internal_stage || mapSfStage(sfOpp.sf_stage_name),
    stage_history: history,
    source_plan_id: enrich.source_plan_id || null,
    source_white_space_idx: enrich.source_white_space_idx || null,
    win_plan_id: enrich.win_plan_id || null,
    confidence_narrative_id: enrich.confidence_narrative_id || null,
    _last_activity_at: lastActivity,
    _active_leads: activeLeads.length,
    _has_champion: hasChampion,
    _has_econ_buyer: hasEconBuyer,
    _competitor_count: competitorCount,
    _we_have_advantage: (acct && acct.account_plan_id) ? true : false,
    _days_in_stage: Math.round(daysInStage),
    _velocity_factor: velocity
  };
  const conf = confidence.compute(oppWithInternals, acct, { leads });
  conf.formula_score = conf.score;
  if (enrich.confidence_override != null) {
    conf.score = enrich.confidence_override;
    conf.override_source = 'meeting_notes_analysis';
  }
  if (enrich.confidence_narrative) {
    conf.narrative = enrich.confidence_narrative;
    conf.narrative_updated_at = enrich.confidence_narrative_updated_at || null;
  }
  oppWithInternals.confidence = conf;

  const projected = closeDate.project(oppWithInternals);
  projected.formula_date = projected.date;
  if (enrich.projected_close_override) {
    projected.date = enrich.projected_close_override;
    projected.delta_days_from_sf = sfOpp.sf_close_date
      ? Math.round((new Date(enrich.projected_close_override) - new Date(sfOpp.sf_close_date)) / 86400000)
      : 0;
    projected.override_source = 'meeting_notes_analysis';
  }
  oppWithInternals.projected_close = projected;

  oppWithInternals.analysis = enrich.analysis || null;
  oppWithInternals.stakeholders = activeLeads.map(l => ({ id: l.id, name: l.name, title: l.title, role: l.role_in_deal, linkedin: l.linkedin, last_interaction_at: l.last_interaction_at }));
  oppWithInternals._account = { sf_id: acct.sf_id, sf_name: acct.sf_name, medpicss_filled: acct.medpicss_filled };
  return oppWithInternals;
}

function mapSfStage(s) {
  if (!s) return 'discovery';
  const x = s.toLowerCase();
  if (x.includes('discover')) return 'discovery';
  if (x.includes('valid')) return 'validation';
  if (x.includes('propos')) return 'proposal';
  if (x.includes('negot')) return 'negotiation';
  if (x.includes('won')) return 'closed_won';
  if (x.includes('lost')) return 'closed_lost';
  return 'discovery';
}

async function list(req, res, { query }) {
  const sfOpps = await sfdc.listOpps({ account_id: query.account_id });
  let out = await Promise.all(sfOpps.map(composeOpp));
  if (query.role) {
    const users = require('./users.routes');
    const scope = await users.scopeFor(query.role, query.user_id || (await users.defaultUserFor(query.role))?.id);
    out = out.filter(o => scope.accountIds.has(o.sf_account_id));
  }
  return out;
}

async function get(req, res, { params }) {
  const sf = await sfdc.getOpp(params.id);
  if (!sf) { res.statusCode = 404; return { error: 'Not found' }; }
  return composeOpp(sf);
}

async function create(req, res, { body }) {
  const sf = await sfdc.createOpp({
    sf_account_id: body.account_id,
    sf_name: body.name,
    sf_amount: body.amount || 500000,
    sf_stage_name: 'Discovery',
    sf_close_date: body.close_date || addDays(120)
  });

  const winPlanId = 'wp-' + Date.now().toString(36);
  const winPlan = {
    id: winPlanId,
    opportunity_id: sf.sf_id,
    created_at: new Date().toISOString(),
    action_items: [
      { id: 'ai-1', stage: 'discovery', text: 'Confirm pain and quantify baseline metrics', status: 'open' },
      { id: 'ai-2', stage: 'discovery', text: 'Identify champion and economic buyer', status: 'open' }
    ],
    stage_playbooks: {
      discovery: { exit_criteria: ['Pain confirmed', 'Champion identified'], default_tasks: [] },
      validation: { exit_criteria: ['Success criteria signed', 'Econ buyer meeting'], default_tasks: [] },
      proposal: { exit_criteria: ['Commercials reviewed'], default_tasks: [] },
      negotiation: { exit_criteria: ['Paper process mapped'], default_tasks: [] }
    },
    risks: [],
    next_best_action: 'Schedule discovery meeting with champion'
  };
  await store.upsert(COLL_WINPLANS, winPlan, 'id');

  await store.upsert(COLL_ENRICH, {
    sf_id: sf.sf_id,
    internal_stage: 'discovery',
    stage_history: [{ stage: 'discovery', entered_at: new Date().toISOString() }],
    source_plan_id: body.source_plan_id || null,
    source_white_space_idx: body.source_white_space_idx || null,
    win_plan_id: winPlanId,
    last_activity_at: new Date().toISOString()
  }, 'sf_id');

  await accounts.linkOpp(body.account_id, sf.sf_id);
  return composeOpp(sf);
}

async function updateStage(req, res, { params, body }) {
  const sf = await sfdc.getOpp(params.id);
  if (!sf) { res.statusCode = 404; return { error: 'Not found' }; }
  const enrich = (await store.readOne(COLL_ENRICH, params.id, 'sf_id')) || { sf_id: params.id, stage_history: [] };
  const prev = enrich.internal_stage || 'discovery';
  const next = body.internal_stage;
  enrich.internal_stage = next;
  enrich.stage_history = enrich.stage_history || [];
  if (enrich.stage_history.length) enrich.stage_history[enrich.stage_history.length - 1].exited_at = new Date().toISOString();
  enrich.stage_history.push({ stage: next, entered_at: new Date().toISOString(), from: prev });
  await store.upsert(COLL_ENRICH, enrich, 'sf_id');

  await sfdc.updateOpp(params.id, { sf_stage_name: capitalize(next.replace('_', ' ')) });
  return composeOpp(await sfdc.getOpp(params.id));
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

module.exports = { list, get, create, updateStage, composeOpp };
