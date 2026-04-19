const accountsRoutes = require('./accounts.routes');
const leadsRoutes = require('./leads.routes');
const regionsRoutes = require('./regions.routes');
const store = require('../store');
const sfdc = require('../sfdc').getAdapter();

async function addToPipeline(req, res, { body }) {
  const acc = body.account || {};
  const countryGuess = deriveCountry(acc.location || '');
  const region = await regionsRoutes.getForCountry(countryGuess);

  // Check for duplicate by name
  const existing = (await sfdc.listAccounts()).find(a => a.sf_name === acc.company);
  let composed;
  if (existing) {
    composed = await accountsRoutes.compose(existing);
  } else {
    composed = await accountsRoutes.create(null, { statusCode: 200 }, {
      body: {
        sf_name: acc.company,
        sf_industry: acc.industry || 'Unknown',
        sf_annual_revenue: acc.revenue || 0,
        sf_employees: acc.headcount || 0,
        sf_billing_country: countryGuess || 'US',
        source: 'market_intel',
        campaign_id: body.campaign_id || 'cmp-market-intel'
      }
    });
    // Apply region auto-assignment: RVP becomes the owner pending CP assignment
    if (region) {
      const enrich = (await store.readOne('account_enrichment', composed.sf_id, 'sf_id')) || { sf_id: composed.sf_id };
      enrich.region_id = region.id;
      enrich.territory = region.name;
      enrich.owner_user_id = region.rvp_user_id;
      enrich.owner_role = 'rvp';
      enrich.assignment_status = 'rvp_assigned';
      await store.upsert('account_enrichment', enrich, 'sf_id');
      composed = await accountsRoutes.compose(await sfdc.getAccount(composed.sf_id));
    }
  }

  // Attach stakeholders as leads
  const leads = [];
  for (const s of (acc.stakeholders || [])) {
    const role = mapRole(s.role || s.title || '');
    const lead = await leadsRoutes.create({
      sf_account_id: composed.sf_id,
      sf_object: 'Contact',
      name: s.name || 'Unknown',
      title: s.title || s.role || '',
      linkedin: s.linkedin || null,
      role_in_deal: role,
      active: true,
      engagement_score: 55
    });
    leads.push(lead);
  }

  return { account: composed, leads, created: !existing, region };
}

function deriveCountry(location) {
  if (!location) return 'US';
  const bits = location.split(',').map(s => s.trim());
  const last = bits[bits.length - 1];

  // 2-letter ISO code match on the last token
  const ISO = ['US', 'CA', 'MX', 'GB', 'IE', 'FR', 'DE', 'CH', 'NL', 'BE', 'LU', 'IT', 'ES', 'PT', 'AT', 'CZ', 'PL',
               'DK', 'SE', 'NO', 'FI', 'IS', 'AU', 'NZ', 'JP', 'CN', 'IN', 'SG', 'KR', 'TH', 'MY', 'ID', 'HK', 'TW',
               'VN', 'PH', 'BR', 'AR', 'CL', 'CO', 'PE'];
  if (last && ISO.includes(last.toUpperCase())) return last.toUpperCase();

  // Full-name hints
  const HINTS = {
    'UK': 'GB', 'United Kingdom': 'GB', 'England': 'GB', 'Scotland': 'GB', 'Wales': 'GB', 'Ireland': 'IE',
    'Germany': 'DE', 'France': 'FR', 'Switzerland': 'CH', 'Netherlands': 'NL', 'Spain': 'ES', 'Italy': 'IT',
    'Australia': 'AU', 'Japan': 'JP', 'China': 'CN', 'India': 'IN', 'Singapore': 'SG',
    'Canada': 'CA', 'Mexico': 'MX', 'Brazil': 'BR',
    'Denmark': 'DK', 'Sweden': 'SE', 'Norway': 'NO', 'Finland': 'FI',
    'Austria': 'AT', 'Belgium': 'BE', 'Portugal': 'PT'
  };
  for (const [hint, iso] of Object.entries(HINTS)) {
    if (location.toLowerCase().includes(hint.toLowerCase())) return iso;
  }

  // US state → US
  const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
  if (last && US_STATES.includes(last.toUpperCase())) return 'US';

  return 'US';
}

function mapRole(text) {
  const t = text.toLowerCase();
  if (t.includes('champion')) return 'champion';
  if (t.includes('economic') || t.includes('buyer') || t.includes('cfo')) return 'decision_maker';
  if (t.includes('evaluator') || t.includes('influencer')) return 'user';
  if (t.includes('blocker')) return 'blocker';
  if (t.includes('executive sponsor') || t.includes('sponsor')) return 'decision_maker';
  if (t.includes('cio') || t.includes('cto') || t.includes('vp') || t.includes('director')) return 'user';
  return 'unknown';
}

module.exports = { addToPipeline };
