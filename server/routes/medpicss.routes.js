const store = require('../store');
const medpicss = require('../engines/medpicss');
const accountsRoutes = require('./accounts.routes');
const activitiesRoutes = require('./activities.routes');

const COLL_ENRICH = accountsRoutes.COLL_ENRICH;

async function patchSlot(req, res, { params, body }) {
  const sfId = params.id;
  if (!body.slot || !medpicss.SLOTS.includes(body.slot)) {
    res.statusCode = 400; return { error: 'slot required (one of: ' + medpicss.SLOTS.join(',') + ')' };
  }
  const enrich = (await store.readOne(COLL_ENRICH, sfId, 'sf_id')) || { sf_id: sfId, medpicss: medpicss.empty() };
  enrich.medpicss = enrich.medpicss || medpicss.empty();
  const prev = enrich.medpicss[body.slot] || {};
  const merged = {
    ...prev,
    filled: body.filled != null ? !!body.filled : prev.filled || false,
    note: body.note != null ? body.note : prev.note,
    stakeholder_id: body.stakeholder_id != null ? body.stakeholder_id : prev.stakeholder_id,
    updated_at: new Date().toISOString()
  };

  const leads = (await store.readAll('leads')).filter(l => l.sf_account_id === sfId);
  const validation = medpicss.validateSlot(body.slot, merged, leads);
  if (merged.filled && !validation.filled) {
    // Tried to mark filled but validation rejects — keep user intent but flag unresolved
    merged.filled = false;
    merged._validation_errors = validation.reasons;
  } else {
    delete merged._validation_errors;
  }

  enrich.medpicss[body.slot] = merged;
  await store.upsert(COLL_ENRICH, enrich, 'sf_id');

  // Log as an activity so FIRE tracks engagement recency
  await activitiesRoutes.create(null, { statusCode: 200 }, {
    body: {
      account_id: sfId,
      kind: 'medpicss_update',
      payload: { slot: body.slot, filled: merged.filled }
    }
  }).catch(() => { /* non-fatal */ });

  return {
    slot: body.slot,
    value: merged,
    validation,
    medpicss: enrich.medpicss,
    completeness: medpicss.filledCount(enrich.medpicss, leads)
  };
}

module.exports = { patchSlot };
