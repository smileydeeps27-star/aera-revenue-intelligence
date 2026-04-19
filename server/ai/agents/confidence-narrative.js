const gemini = require('../gemini');
const { SellerProfile } = require('../seller-profile');

function fallback({ opp, account }) {
  const c = opp.confidence || { score: 0, components: {} };
  const cc = c.components || {};
  const bits = [];
  if (cc.medpicss >= 0.55) bits.push('MEDPICSS coverage is strong');
  else if (cc.medpicss >= 0.3) bits.push('MEDPICSS is partial — still qualifying');
  else bits.push('MEDPICSS is thin — pain/criteria unclear');

  if (cc.recency >= 0.8) bits.push('recent activity is warm');
  else if (cc.recency >= 0.4) bits.push('cadence has slowed');
  else bits.push('deal has gone quiet — schedule a touch');

  if (opp._has_champion && opp._has_econ_buyer) bits.push('champion + economic buyer are engaged');
  else if (opp._has_champion) bits.push('champion in place, econ buyer still to surface');
  else bits.push('no clear champion yet');

  if (cc.competitive >= 0.9) bits.push('competitive ground is ours');
  else if (cc.competitive <= 0.5) bits.push('competitors are active');

  if (cc.size_fit >= 0.7) bits.push('deal size lands near our win pattern');
  else bits.push('deal sits outside typical win size');

  return 'Confidence ' + c.score + '/100 on ' + (account ? account.sf_name : 'this account') + ': ' + bits.join('; ') + '.';
}

async function narrate({ opp, account }) {
  if (!gemini.keyConfigured()) return { narrative: fallback({ opp, account }), _demo: true };

  const c = opp.confidence || { score: 0, components: {} };
  const system = 'You are a seasoned Aera Client Partner. Write ONE short paragraph (3-4 sentences max) explaining the confidence score to a CRO. Cite specific numeric components. No preamble, no headings, no markdown. Plain prose only.';
  const msg = 'Opportunity: ' + opp.sf_name + ' · stage ' + opp.internal_stage + ' · $' + (opp.sf_amount || 0) + '\n' +
    'Confidence: ' + c.score + '/100\n' +
    'Components: MEDPICSS=' + (c.components.medpicss || 0).toFixed(2) + ', Recency=' + (c.components.recency || 0).toFixed(2) + ', Stakeholder=' + (c.components.stakeholder || 0).toFixed(2) + ', Competitive=' + (c.components.competitive || 0).toFixed(2) + ', Size=' + (c.components.size_fit || 0).toFixed(2) + '\n' +
    'Champion: ' + (opp._has_champion ? 'yes' : 'no') + ' · Econ buyer: ' + (opp._has_econ_buyer ? 'yes' : 'no') + ' · Competitors: ' + opp._competitor_count + '\n' +
    'Last activity: ' + opp._last_activity_at + '\n' +
    'Write the narrative now.';
  try {
    const text = await gemini.call(system, msg, 512);
    if (text && text.trim()) return { narrative: text.trim(), _demo: false };
  } catch (e) { /* fall through */ }
  return { narrative: fallback({ opp, account }), _demo: true };
}

module.exports = { narrate };
