const gemini = require('../gemini');
const { getSellerContext } = require('../seller-profile');
const medpicss = require('../../engines/medpicss');

function fallbackSuggestions(account, plan) {
  const wins = (plan && plan.whiteSpace) || [];
  const comps = (plan && plan.competitive && plan.competitive.landscape) || [];
  return [
    { slot: 'identify_pain', note: wins[0] ? wins[0].problem.slice(0, 180) : 'Pain from account plan overview' },
    { slot: 'metrics', note: wins[0] && wins[0].value ? wins[0].value + ' baseline — quantify current state' : 'Quantify current baseline number with unit' },
    { slot: 'competition', note: comps[0] ? comps.map(c => c.competitor).slice(0, 3).join(', ') : 'Kinaxis, Blue Yonder' },
    { slot: 'decision_criteria', note: 'Forecast accuracy lift; time-to-value; integration with existing ERP' },
    { slot: 'success_criteria', note: 'Forecast accuracy +10 pts within 90 days on pilot SKU family' }
  ];
}

async function suggest({ account, plan, activities, leads }) {
  const seller = getSellerContext();
  const empty = medpicss.SLOTS.filter(s => !(account.medpicss && account.medpicss[s] && account.medpicss[s].filled));
  if (!gemini.keyConfigured()) return { suggestions: fallbackSuggestions(account, plan), demo: true };

  const prompt = 'You are a world-class B2B sales strategist at Aera Technology helping a Client Partner qualify an account using MEDPICSS. Given the account plan, recent activities, and current MEDPICSS state, return concrete suggestions for which empty slots to mark filled and WHAT note to put in each. Return ONLY valid JSON.' + seller;
  const msg = 'Account: ' + account.sf_name + ' (' + account.sf_industry + ')\n' +
    (plan && plan.overview ? 'Implication for Aera: ' + (plan.overview.implicationForSeller || '') + '\n' : '') +
    (plan && plan.whiteSpace ? 'Top opportunities: ' + plan.whiteSpace.slice(0, 3).map(w => w.area + ' — ' + (w.value || '')).join('; ') + '\n' : '') +
    (plan && plan.competitive ? 'Competitors: ' + (plan.competitive.landscape || []).map(c => c.competitor).join(', ') + '\n' : '') +
    'Empty slots that need suggestions: ' + empty.join(', ') + '\n' +
    'Return JSON: {"suggestions":[{"slot":"metrics","note":"specific note, concise","stakeholder_id":null}]}\n' +
    'Be concrete. Each note should be directly pasteable.';

  try {
    const r = await gemini.call(prompt, msg, 2048);
    const p = gemini.parseJSON(r);
    if (p && Array.isArray(p.suggestions)) return { suggestions: p.suggestions.filter(s => medpicss.SLOTS.includes(s.slot)), demo: false };
  } catch (e) { /* fall through */ }
  return { suggestions: fallbackSuggestions(account, plan), demo: true };
}

module.exports = { suggest };
