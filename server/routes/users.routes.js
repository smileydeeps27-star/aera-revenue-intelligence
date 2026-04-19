const store = require('../store');
const accountsRoutes = require('./accounts.routes');

async function list(req, res, { query }) {
  const all = await store.readAll('users');
  let out = all;
  if (query.role) out = out.filter(u => u.role === query.role);
  return out;
}

async function getById(id) { return store.readOne('users', id, 'id'); }

async function descendants(userId) {
  const all = await store.readAll('users');
  const out = new Set([userId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const u of all) {
      if (u.parent_id && out.has(u.parent_id) && !out.has(u.id)) { out.add(u.id); changed = true; }
    }
  }
  return Array.from(out);
}

/**
 * Compute which SFDC account ids the given (role, user) can see.
 * - CEO / CRO: everything
 * - RVP: accounts owned by any CP whose parent chain includes this RVP
 * - CP: accounts where owner_user_id === user.id
 * - BDR: accounts where activities.actor_user_id === user.id
 * Returns { accountIds: Set<string>, userIds: Set<string> }
 */
async function scopeFor(role, userId) {
  const users = await store.readAll('users');
  const byId = new Map(users.map(u => [u.id, u]));

  if (role === 'ceo' || role === 'cro') {
    const sf = await store.readAll('sf_accounts');
    return { accountIds: new Set(sf.map(a => a.sf_id)), userIds: new Set(users.map(u => u.id)), scopeLabel: role === 'ceo' ? 'All accounts' : 'All accounts (CRO view)' };
  }

  if (role === 'rvp') {
    const subtree = await descendants(userId);
    const enrich = await store.readAll('account_enrichment');
    const accountIds = new Set(enrich.filter(e => e.owner_user_id && subtree.includes(e.owner_user_id)).map(e => e.sf_id));
    return { accountIds, userIds: new Set(subtree), scopeLabel: (byId.get(userId)?.name || 'RVP') + ' — team' };
  }

  if (role === 'cp') {
    const enrich = await store.readAll('account_enrichment');
    const accountIds = new Set(enrich.filter(e => e.owner_user_id === userId).map(e => e.sf_id));
    return { accountIds, userIds: new Set([userId]), scopeLabel: (byId.get(userId)?.name || 'CP') + ' — my accounts' };
  }

  if (role === 'bdr') {
    const activities = await store.readAll('activities');
    const accountIds = new Set(activities.filter(a => a.actor_user_id === userId).map(a => a.account_id));
    return { accountIds, userIds: new Set([userId]), scopeLabel: (byId.get(userId)?.name || 'BDR') + ' — engaged accounts' };
  }

  // Fallback: nothing
  return { accountIds: new Set(), userIds: new Set(), scopeLabel: 'No scope' };
}

/**
 * Default user for a given role (first one found). Lets the topbar chip work
 * without a separate user selector.
 */
async function defaultUserFor(role) {
  const users = await store.readAll('users');
  return users.find(u => u.role === role) || null;
}

module.exports = { list, getById, descendants, scopeFor, defaultUserFor };
