const store = require('../store');

const COLL = 'meeting_notes';

async function list(req, res, { query }) {
  const all = await store.readAll(COLL);
  let out = all;
  if (query.opportunity_id) out = out.filter(n => n.opportunity_id === query.opportunity_id);
  if (query.account_id) out = out.filter(n => n.account_id === query.account_id);
  return out.sort((a, b) => new Date(b.meeting_date || b.created_at) - new Date(a.meeting_date || a.created_at));
}

async function create(req, res, { body }) {
  if (!body.opportunity_id) { res.statusCode = 400; return { error: 'opportunity_id required' }; }
  const row = {
    id: 'mn-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
    opportunity_id: body.opportunity_id,
    account_id: body.account_id || null,
    author_user_id: body.author_user_id || 'user-demo',
    meeting_date: body.meeting_date || new Date().toISOString().slice(0, 10),
    meeting_type: body.meeting_type || 'discovery',
    participants: body.participants || [],
    notes: body.notes || '',
    created_at: new Date().toISOString()
  };
  await store.append(COLL, row);
  return row;
}

async function remove(req, res, { params }) {
  const r = await store.remove(COLL, params.id, 'id');
  if (r.removed === 0) { res.statusCode = 404; return { error: 'Not found' }; }
  return r;
}

async function update(req, res, { params, body }) {
  const existing = await store.readOne(COLL, params.id, 'id');
  if (!existing) { res.statusCode = 404; return { error: 'Not found' }; }
  const next = { ...existing, ...body, id: existing.id, updated_at: new Date().toISOString() };
  await store.upsert(COLL, next, 'id');
  return next;
}

module.exports = { list, create, remove, update, COLL };
