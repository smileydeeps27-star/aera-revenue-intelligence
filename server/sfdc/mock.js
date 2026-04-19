const store = require('../store');

const SF_ACCOUNTS = 'sf_accounts';
const SF_OPPS = 'sf_opps';
const SF_CONTACTS = 'sf_contacts';

let seq = Date.now();
function sfId(prefix) {
  seq += 1;
  return prefix + seq.toString(16).padStart(12, '0').slice(-12).toUpperCase();
}

async function listAccounts(filter = {}) {
  const rows = await store.readAll(SF_ACCOUNTS);
  return rows.filter(r => !filter.industry || r.sf_industry === filter.industry);
}

async function getAccount(id) {
  return store.readOne(SF_ACCOUNTS, id, 'sf_id');
}

async function createAccount(payload) {
  const rec = {
    sf_id: payload.sf_id || sfId('001AX'),
    sf_name: payload.sf_name,
    sf_industry: payload.sf_industry || 'Unknown',
    sf_annual_revenue: payload.sf_annual_revenue || 0,
    sf_employees: payload.sf_employees || 0,
    sf_billing_country: payload.sf_billing_country || 'US',
    sf_owner_id: payload.sf_owner_id || '005A0000000Gpqr',
    sf_created_date: new Date().toISOString()
  };
  await store.upsert(SF_ACCOUNTS, rec, 'sf_id');
  return rec;
}

async function updateAccount(id, patch) {
  const existing = await getAccount(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  await store.upsert(SF_ACCOUNTS, next, 'sf_id');
  return next;
}

async function listOpps(filter = {}) {
  const rows = await store.readAll(SF_OPPS);
  return rows.filter(r => !filter.account_id || r.sf_account_id === filter.account_id);
}

async function getOpp(id) {
  return store.readOne(SF_OPPS, id, 'sf_id');
}

async function createOpp(payload) {
  const rec = {
    sf_id: payload.sf_id || sfId('006AX'),
    sf_account_id: payload.sf_account_id,
    sf_name: payload.sf_name,
    sf_amount: payload.sf_amount || 0,
    sf_stage_name: payload.sf_stage_name || 'Discovery',
    sf_close_date: payload.sf_close_date || addDays(new Date(), 120).toISOString().slice(0, 10),
    sf_probability: payload.sf_probability || 20,
    sf_owner_id: payload.sf_owner_id || '005A0000000Gpqr',
    sf_created_date: new Date().toISOString()
  };
  await store.upsert(SF_OPPS, rec, 'sf_id');
  return rec;
}

async function updateOpp(id, patch) {
  const existing = await getOpp(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  await store.upsert(SF_OPPS, next, 'sf_id');
  return next;
}

async function listContacts(filter = {}) {
  const rows = await store.readAll(SF_CONTACTS);
  return rows.filter(r => !filter.account_id || r.sf_account_id === filter.account_id);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

module.exports = {
  listAccounts, getAccount, createAccount, updateAccount,
  listOpps, getOpp, createOpp, updateOpp,
  listContacts
};
