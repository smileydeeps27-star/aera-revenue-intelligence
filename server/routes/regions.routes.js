const store = require('../store');

const COLL = 'regions';

async function list() {
  return store.readAll(COLL);
}

async function getForCountry(country) {
  if (!country) return null;
  const regions = await store.readAll(COLL);
  for (const r of regions) {
    if ((r.countries || []).includes(country)) return r;
  }
  return null;
}

async function update(req, res, { params, body }) {
  const existing = await store.readOne(COLL, params.id, 'id');
  if (!existing) { res.statusCode = 404; return { error: 'Region not found' }; }
  const next = { ...existing, ...body, id: existing.id };
  await store.upsert(COLL, next, 'id');
  return next;
}

async function rollup() {
  const regions = await store.readAll(COLL);
  const users = await store.readAll('users');
  const accounts = await store.readAll('sf_accounts');
  const enrichment = await store.readAll('account_enrichment');
  const enrichById = new Map(enrichment.map(e => [e.sf_id, e]));
  const cps = users.filter(u => u.role === 'cp');

  return regions.map(r => {
    const rvp = users.find(u => u.id === r.rvp_user_id);
    const rvpCps = cps.filter(c => c.parent_id === r.rvp_user_id);
    const regionAccounts = accounts.filter(a => {
      const e = enrichById.get(a.sf_id);
      return e && e.region_id === r.id;
    });
    const unassigned = regionAccounts.filter(a => {
      const e = enrichById.get(a.sf_id) || {};
      return e.assignment_status !== 'cp_assigned';
    });
    const keyAccounts = regionAccounts.filter(a => {
      const e = enrichById.get(a.sf_id) || {};
      return /Key/i.test(e.account_type || '');
    });
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      countries: r.countries || [],
      rvp: rvp ? { id: rvp.id, name: rvp.name } : null,
      cps: rvpCps.map(c => ({ id: c.id, name: c.name })),
      total_accounts: regionAccounts.length,
      key_accounts: keyAccounts.length,
      unassigned_count: unassigned.length
    };
  });
}

module.exports = { list, getForCountry, update, rollup, COLL };
