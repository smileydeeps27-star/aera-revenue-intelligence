const store = require('../store');

const COLL = 'leads';

async function list(req, res, { query }) {
  const all = await store.readAll(COLL);
  let out = all;
  if (query.account_id) out = out.filter(l => l.sf_account_id === query.account_id);
  if (query.role_in_deal) out = out.filter(l => l.role_in_deal === query.role_in_deal);
  if (query.active === 'true') out = out.filter(l => l.active !== false);
  if (query.active === 'false') out = out.filter(l => l.active === false);
  if (query.role) {
    const users = require('./users.routes');
    const scope = await users.scopeFor(query.role, query.user_id || (await users.defaultUserFor(query.role))?.id);
    // Keep orphan leads visible to CEO/CRO/RVP; CP + BDR only see leads on their scoped accounts.
    if (query.role === 'cp' || query.role === 'bdr') {
      out = out.filter(l => l.sf_account_id && scope.accountIds.has(l.sf_account_id));
    } else {
      out = out.filter(l => !l.sf_account_id || scope.accountIds.has(l.sf_account_id));
    }
  }
  return out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function create(row) {
  const next = {
    id: row.id || ('lead-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36)),
    sf_id: row.sf_id || null,
    sf_object: row.sf_object || 'Contact',
    sf_email: row.sf_email || row.email || null,
    sf_account_id: row.sf_account_id || null,
    name: row.name || 'Unknown',
    title: row.title || '',
    linkedin: row.linkedin || null,
    role_in_deal: row.role_in_deal || 'unknown',
    active: row.active !== false,
    last_interaction_at: row.last_interaction_at || null,
    signals: row.signals || [],
    engagement_score: row.engagement_score || 50
  };
  await store.append(COLL, next);
  return next;
}

async function createRoute(req, res, { body }) {
  return create(body);
}

async function update(req, res, { params, body }) {
  const existing = await store.readOne(COLL, params.id, 'id');
  if (!existing) { res.statusCode = 404; return { error: 'Not found' }; }
  const next = { ...existing, ...body, id: existing.id };
  await store.upsert(COLL, next, 'id');
  return next;
}

async function jobChange(req, res, { params, body }) {
  const lead = await store.readOne(COLL, params.id, 'id');
  if (!lead) { res.statusCode = 404; return { error: 'Not found' }; }
  const fromAccount = lead.sf_account_id;

  // Flip old lead to inactive but keep the record
  lead.active = false;
  lead.signals = lead.signals || [];
  lead.signals.push({ kind: 'job_change', from_account_id: fromAccount, to_company_name: body.new_company || 'New Company', detected_at: new Date().toISOString() });
  await store.upsert(COLL, lead, 'id');

  // Create a new orphan lead at the new company (no sf_account_id until attached)
  const newLead = await create({
    name: lead.name,
    title: body.new_title || lead.title,
    linkedin: lead.linkedin,
    sf_email: null,
    sf_account_id: null,
    role_in_deal: 'unknown',
    active: true,
    signals: [{ kind: 'job_change_from', from_lead_id: lead.id, from_company_id: fromAccount, to_company_name: body.new_company || 'New Company', detected_at: new Date().toISOString() }]
  });

  return { old: lead, new: newLead };
}

module.exports = { list, createRoute, create, update, jobChange, COLL };
