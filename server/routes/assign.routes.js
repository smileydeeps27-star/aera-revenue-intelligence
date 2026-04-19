const store = require('../store');
const accountsRoutes = require('./accounts.routes');
const sfdc = require('../sfdc').getAdapter();

const COLL_ENRICH = accountsRoutes.COLL_ENRICH;

async function assignCp(req, res, { params, body }) {
  const sfId = params.id;
  const cpUserId = body.cp_user_id || null;

  const sf = await sfdc.getAccount(sfId);
  if (!sf) { res.statusCode = 404; return { error: 'Account not found' }; }

  const enrich = (await store.readOne(COLL_ENRICH, sfId, 'sf_id')) || { sf_id: sfId };

  if (cpUserId) {
    const user = await store.readOne('users', cpUserId, 'id');
    if (!user || user.role !== 'cp') { res.statusCode = 400; return { error: 'cp_user_id must reference a CP user' }; }
    enrich.owner_user_id = cpUserId;
    enrich.owner_role = 'cp';
    enrich.assignment_status = 'cp_assigned';
  } else {
    // Unassigning CP — fall back to region RVP if known
    const regions = await store.readAll('regions');
    const region = regions.find(r => r.id === enrich.region_id);
    if (region) {
      enrich.owner_user_id = region.rvp_user_id;
      enrich.owner_role = 'rvp';
      enrich.assignment_status = 'rvp_assigned';
    } else {
      enrich.owner_user_id = null;
      enrich.owner_role = null;
      enrich.assignment_status = 'unassigned';
    }
  }

  enrich.assigned_at = new Date().toISOString();
  await store.upsert(COLL_ENRICH, enrich, 'sf_id');
  return accountsRoutes.compose(sf);
}

module.exports = { assignCp };
