const store = require('../store');
const fire = require('../engines/fire');
const accountsRoutes = require('./accounts.routes');

const COLL = 'activities';
const COLL_ENRICH = accountsRoutes.COLL_ENRICH;

const ALLOWED_KINDS = new Set([
  'email_sent', 'email_reply', 'email_reply_negative',
  'meeting', 'content_view', 'event_attend', 'bdr_call',
  'sfdc_stage_change', 'medpicss_update', 'note'
]);

async function list(req, res, { query }) {
  const all = await store.readAll(COLL);
  let out = all;
  if (query.account_id) out = out.filter(a => a.account_id === query.account_id);
  if (query.opportunity_id) out = out.filter(a => a.opportunity_id === query.opportunity_id);
  if (query.lead_id) out = out.filter(a => a.lead_id === query.lead_id);
  return out.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
}

async function create(req, res, { body }) {
  if (!body.account_id) { res.statusCode = 400; return { error: 'account_id required' }; }
  if (!ALLOWED_KINDS.has(body.kind)) { res.statusCode = 400; return { error: 'Unknown kind: ' + body.kind }; }

  const row = {
    id: 'act-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
    occurred_at: body.occurred_at || new Date().toISOString(),
    kind: body.kind,
    account_id: body.account_id,
    opportunity_id: body.opportunity_id || null,
    lead_id: body.lead_id || null,
    actor_user_id: body.actor_user_id || 'user-demo',
    payload: body.payload || {}
  };
  await store.append(COLL, row);

  // Recompute FIRE for the target account
  const enrich = (await store.readOne(COLL_ENRICH, body.account_id, 'sf_id')) || { sf_id: body.account_id };
  const allActivities = (await store.readAll(COLL)).filter(a => a.account_id === body.account_id);
  const leads = (await store.readAll('leads')).filter(l => l.sf_account_id === body.account_id);
  const acctForFit = { sf_industry: enrich._sf_industry, sf_annual_revenue: enrich._sf_annual_revenue, sf_employees: enrich._sf_employees, sf_billing_country: enrich._sf_billing_country, stakeholder_lead_ids: enrich.stakeholder_lead_ids, fire: enrich.fire };
  const nextFire = fire.recompute(acctForFit, allActivities, leads);
  enrich.fire = nextFire;
  await store.upsert(COLL_ENRICH, enrich, 'sf_id');

  return { activity: row, fire_after: nextFire };
}

module.exports = { list, create, ALLOWED_KINDS };
