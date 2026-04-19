const sfdc = require('../sfdc').getAdapter();
const store = require('../store');
const fire = require('../engines/fire');
const medpicss = require('../engines/medpicss');

const COLL_ENRICH = 'account_enrichment';

async function compose(sfAccount) {
  if (!sfAccount) return null;
  const enrich = (await store.readOne(COLL_ENRICH, sfAccount.sf_id, 'sf_id')) || {};
  const activities = (await store.readAll('activities')).filter(a => a.account_id === sfAccount.sf_id);
  const leads = (await store.readAll('leads')).filter(l => l.sf_account_id === sfAccount.sf_id);
  const baseFire = enrich.fire || fire.initial(sfAccount);
  // Keep stored fit; recompute live intent/recency/engagement from activities so chips stay fresh.
  const liveFire = activities.length || leads.length
    ? fire.recompute({ ...sfAccount, fire: baseFire, stakeholder_lead_ids: enrich.stakeholder_lead_ids || [] }, activities, leads)
    : baseFire;

  return {
    ...sfAccount,
    fire: liveFire,
    medpicss: enrich.medpicss || medpicss.empty(),
    medpicss_filled: medpicss.filledCount(enrich.medpicss, leads),
    warmup_stage: enrich.warmup_stage || 'prospecting',
    aera_plays: enrich.aera_plays || [],
    stakeholder_lead_ids: enrich.stakeholder_lead_ids || [],
    account_plan_id: enrich.account_plan_id || null,
    opportunity_ids: enrich.opportunity_ids || [],
    source: enrich.source || null,
    campaign_id: enrich.campaign_id || null,
    owner_role: enrich.owner_role || 'cp',
    owner_user_id: enrich.owner_user_id || null,
    region_id: enrich.region_id || null,
    assignment_status: enrich.assignment_status || (enrich.owner_user_id ? 'cp_assigned' : 'unassigned'),
    _activity_count: activities.length,
    _last_activity_at: activities.length ? activities.reduce((m, a) => a.occurred_at > m ? a.occurred_at : m, '0') : null
  };
}

async function list(req, res, { query }) {
  const sfAccounts = await sfdc.listAccounts({ industry: query.industry });
  let composed = await Promise.all(sfAccounts.map(compose));

  if (query.role) {
    const users = require('./users.routes');
    const scope = await users.scopeFor(query.role, query.user_id || (await users.defaultUserFor(query.role))?.id);
    composed = composed.filter(a => scope.accountIds.has(a.sf_id));
  }

  let out = composed;
  if (query.stage) out = out.filter(a => a.warmup_stage === query.stage);
  if (query.minFire) out = out.filter(a => a.fire.score >= Number(query.minFire));
  return out;
}

async function get(req, res, { params }) {
  const sf = await sfdc.getAccount(params.id);
  if (!sf) { res.statusCode = 404; return { error: 'Not found' }; }
  return compose(sf);
}

async function create(req, res, { body }) {
  const sf = await sfdc.createAccount({
    sf_name: body.sf_name || body.name,
    sf_industry: body.sf_industry || body.industry || 'Unknown',
    sf_annual_revenue: body.sf_annual_revenue || body.annual_revenue || 0,
    sf_employees: body.sf_employees || body.employees || 0,
    sf_billing_country: body.sf_billing_country || body.country || 'US'
  });
  await store.upsert(COLL_ENRICH, {
    sf_id: sf.sf_id,
    fire: fire.initial(sf),
    medpicss: medpicss.empty(),
    warmup_stage: body.warmup_stage || 'prospecting',
    aera_plays: body.aera_plays || [],
    source: body.source || 'manual',
    campaign_id: body.campaign_id || null,
    owner_role: body.owner_role || 'cp',
    stakeholder_lead_ids: [],
    opportunity_ids: []
  }, 'sf_id');
  return compose(sf);
}

async function linkPlan(sfId, planId) {
  const enrich = (await store.readOne(COLL_ENRICH, sfId, 'sf_id')) || { sf_id: sfId };
  enrich.account_plan_id = planId;
  await store.upsert(COLL_ENRICH, enrich, 'sf_id');
}

async function linkOpp(sfId, oppId) {
  const enrich = (await store.readOne(COLL_ENRICH, sfId, 'sf_id')) || { sf_id: sfId };
  const list = enrich.opportunity_ids || [];
  if (!list.includes(oppId)) list.push(oppId);
  enrich.opportunity_ids = list;
  enrich.warmup_stage = 'spun_out';
  await store.upsert(COLL_ENRICH, enrich, 'sf_id');
}

module.exports = { list, get, create, compose, linkPlan, linkOpp, COLL_ENRICH };
