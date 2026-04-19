const store = require('../server/store');
const fire = require('../server/engines/fire');
const medpicss = require('../server/engines/medpicss');
const { generate } = require('./generator');

async function load() {
  const data = generate({ fire, medpicss });

  await store.writeAll('sf_accounts', data.accounts);
  await store.writeAll('account_enrichment', data.enrichment);
  await store.writeAll('leads', data.leads);
  await store.writeAll('activities', data.activities);
  await store.writeAll('sf_opps', data.opps);
  await store.writeAll('opp_enrichment', data.oppEnrichment);
  await store.writeAll('win_plans', data.winPlans);
  await store.writeAll('account_plans', []);
  await store.writeAll('sf_contacts', []);
  await store.writeAll('users', data.users);
  await store.writeAll('transitions', data.transitions);
  await store.writeAll('meeting_notes', data.meetingNotes || []);
  await store.writeAll('regions', data.regions || []);

  return {
    users: data.users.length,
    accounts: data.accounts.length,
    leads: data.leads.length,
    activities: data.activities.length,
    opps: data.opps.length,
    winPlans: data.winPlans.length,
    transitions: data.transitions.length,
    meetingNotes: (data.meetingNotes || []).length
  };
}

module.exports = load;

if (require.main === module) {
  load().then(r => console.log('Seeded', r)).catch(e => { console.error(e); process.exit(1); });
}
