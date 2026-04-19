/**
 * Seed generator — loads the territory-plan.json fixture (produced from the
 * FY27 Territory Plan xlsx by seed/import-territory-plan.py) and translates it
 * into the platform's data shape.
 *
 * Deterministic: a fixed PRNG seed makes every run byte-identical so long as
 * the fixture is byte-identical.
 */
const fs = require('fs');
const path = require('path');

const FIXTURE = path.join(__dirname, 'fixtures', 'territory-plan.json');

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

let rnd = mulberry32(20260417);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => Math.floor(rnd() * (hi - lo + 1)) + lo;
const chance = (p) => rnd() < p;

// --- Regions: country-code → territory mapping (drives auto-assignment) ---
const REGIONS = [
  {
    id: 'amer-central',
    name: 'Amer Central',
    rvp_user_id: 'user-rvp-amer-central',
    countries: ['US-central', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE'],
    description: 'US Central + LATAM'
  },
  {
    id: 'amer-east',
    name: 'Amer East',
    rvp_user_id: 'user-rvp-amer-east',
    countries: ['US', 'CA'],
    description: 'US East Coast + Canada'
  },
  {
    id: 'europe',
    name: 'Europe',
    rvp_user_id: 'user-rvp-europe',
    countries: ['FR', 'DE', 'CH', 'IT', 'ES', 'AT', 'BE', 'NL', 'PT', 'LU', 'CZ', 'PL'],
    description: 'Continental Europe (DACH + SEMEA)'
  },
  {
    id: 'emea-north',
    name: 'UK',
    rvp_user_id: 'user-rvp-emea-north',
    countries: ['GB', 'IE', 'SE', 'NO', 'DK', 'FI', 'IS'],
    description: 'UK, Ireland, Nordics'
  },
  {
    id: 'apac',
    name: 'APAC',
    rvp_user_id: 'user-rvp-apac',
    countries: ['AU', 'NZ', 'JP', 'SG', 'IN', 'CN', 'KR', 'TH', 'MY', 'ID', 'HK', 'TW', 'VN', 'PH'],
    description: 'Australia, Japan, India, ASEAN'
  }
];

// --- Hierarchy above the CPs ---
const CEO = { id: 'user-ceo-01', name: 'Frederic Laluyaux', role: 'ceo', parent_id: null, sf_user_id: '005AXRI0CEO00001' };
const CRO = { id: 'user-cro-01', name: 'Gonzalo Benedit', role: 'cro', parent_id: 'user-ceo-01', sf_user_id: '005AXRI0CRO00001' };
const RVPS = [
  { id: 'user-rvp-amer-central', name: 'Paul Schmidt (RVP Amer Central)',          role: 'rvp', parent_id: 'user-cro-01', sf_user_id: '005AXRI0RVP00001', territory: 'Amer Central' },
  { id: 'user-rvp-amer-east',    name: 'Pete Quimby (RVP Amer East)',               role: 'rvp', parent_id: 'user-cro-01', sf_user_id: '005AXRI0RVP00002', territory: 'Amer East' },
  { id: 'user-rvp-europe',       name: 'Jerome Froment Curtil (RVP Europe)',        role: 'rvp', parent_id: 'user-cro-01', sf_user_id: '005AXRI0RVP00003', territory: 'Europe' },
  { id: 'user-rvp-emea-north',   name: 'Matt York (RVP UK)',                        role: 'rvp', parent_id: 'user-cro-01', sf_user_id: '005AXRI0RVP00004', territory: 'UK' },
  { id: 'user-rvp-apac',         name: 'Rajeev Mitroo (RVP APAC)',                  role: 'rvp', parent_id: 'user-cro-01', sf_user_id: '005AXRI0RVP00005', territory: 'APAC' }
];
const BDRS = [
  { id: 'user-bdr-01', name: 'Alex Singh', role: 'bdr', parent_id: 'user-cro-01', sf_user_id: '005AXRI0BDR00001' },
  { id: 'user-bdr-02', name: 'Jordan Smith', role: 'bdr', parent_id: 'user-cro-01', sf_user_id: '005AXRI0BDR00002' },
  { id: 'user-bdr-03', name: 'Priya Ravi',   role: 'bdr', parent_id: 'user-cro-01', sf_user_id: '005AXRI0BDR00003' }
];

function territoryRvpId(territory) {
  const norm = (territory || '').toLowerCase();
  if (norm.includes('central')) return 'user-rvp-amer-central';
  if (norm.includes('east')) return 'user-rvp-amer-east';
  if (norm.includes('emea north')) return 'user-rvp-emea-north';
  if (norm.includes('europe')) return 'user-rvp-europe';
  if (norm.includes('apac')) return 'user-rvp-apac';
  return 'user-rvp-amer-central';
}
function territoryToRegionId(territory) {
  const norm = (territory || '').toLowerCase();
  if (norm.includes('central')) return 'amer-central';
  if (norm.includes('east')) return 'amer-east';
  if (norm.includes('emea north')) return 'emea-north';
  if (norm.includes('europe')) return 'europe';
  if (norm.includes('apac')) return 'apac';
  return null;
}

function cpIdFromName(name) {
  if (!name) return null;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/g, '').replace(/^-+/, '');
  return 'user-cp-' + slug.slice(0, 40);
}

// Raw 0-3 → 0-100 (33/67/100)
function scaleSubscore(raw) {
  if (raw == null) return 0;
  return Math.min(100, Math.round((raw / 3) * 100));
}

function daysAgo(n) {
  const d = new Date('2026-04-17T12:00:00Z');
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function buildMeetingsForStage(oppId, stage, acc) {
  const SEED_NOW = new Date('2026-04-17T12:00:00Z');
  const daysFromNow = (n, hour = 10, minute = 0) => {
    const d = new Date(SEED_NOW);
    d.setDate(d.getDate() + n);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString().slice(0, 16);
  };
  const company = (acc && acc.sf_name) ? acc.sf_name : 'Account';
  const scheduled = [];
  const toSchedule = [];

  if (stage === 'discovery') {
    scheduled.push({
      id: 'mtg-' + oppId + '-s1', title: 'Discovery workshop — ' + company + ' Supply Chain team',
      datetime: daysFromNow(3, 10, 0), duration_min: 60,
      attendees: ['VP Demand Planning (Champion)', 'Aera CP', 'Aera Solution Architect'],
      agenda: 'Pain discovery, current-state demand + S&OP, quantify baseline', status: 'confirmed'
    });
    toSchedule.push({
      id: 'pend-' + oppId + '-p1', title: 'Economic buyer intro — CSCO',
      purpose: 'Secure economic buyer sponsorship + budget ownership conversation',
      proposed_attendees: ['CSCO', 'Aera CP'], priority: 'high', target_window: '2-weeks'
    });
  } else if (stage === 'validation') {
    scheduled.push({
      id: 'mtg-' + oppId + '-s1', title: 'Success criteria review with champion',
      datetime: daysFromNow(2, 14, 30), duration_min: 45,
      attendees: ['Champion - VP Demand Planning', 'Aera CP'],
      agenda: 'Lock in success metrics, POC scope, acceptance criteria', status: 'confirmed'
    });
    scheduled.push({
      id: 'mtg-' + oppId + '-s2', title: 'Technical deep-dive with IT',
      datetime: daysFromNow(6, 11, 0), duration_min: 60,
      attendees: ['VP Data & Analytics', 'IT Architect', 'Aera SA'],
      agenda: 'Data integration, security, rollout approach', status: 'tentative'
    });
    toSchedule.push({
      id: 'pend-' + oppId + '-p1', title: 'Executive briefing — CFO alignment',
      purpose: 'Bring in CFO to validate ROI model before proposal stage',
      proposed_attendees: ['CFO', 'CSCO', 'Aera CRO'], priority: 'high', target_window: 'this-week'
    });
  } else if (stage === 'proposal') {
    scheduled.push({
      id: 'mtg-' + oppId + '-s1', title: 'Value model readout',
      datetime: daysFromNow(1, 9, 0), duration_min: 60,
      attendees: ['CSCO', 'CFO', 'VP Demand Planning', 'Aera CP', 'Aera CRO'],
      agenda: 'Walk through ROI model, phased value capture, risk-adjusted case', status: 'confirmed'
    });
    scheduled.push({
      id: 'mtg-' + oppId + '-s2', title: 'Procurement kickoff',
      datetime: daysFromNow(5, 15, 0), duration_min: 30,
      attendees: ['Procurement Lead', 'Aera CP'],
      agenda: 'Paper process, required docs, typical cycle times', status: 'tentative'
    });
    toSchedule.push({
      id: 'pend-' + oppId + '-p1', title: 'Reference call with similar industry customer',
      purpose: 'Build conviction on outcomes before signature',
      proposed_attendees: ['CSCO', 'VP Demand Planning', 'Reference customer CSCO'],
      priority: 'med', target_window: '2-weeks'
    });
  } else if (stage === 'negotiation') {
    scheduled.push({
      id: 'mtg-' + oppId + '-s1', title: 'Legal redline walkthrough',
      datetime: daysFromNow(1, 13, 0), duration_min: 45,
      attendees: ['Legal - ' + company, 'Aera Legal', 'Aera CP'],
      agenda: 'Walk MSA + DPA redlines, identify blockers', status: 'confirmed'
    });
    scheduled.push({
      id: 'mtg-' + oppId + '-s2', title: 'Executive close call',
      datetime: daysFromNow(4, 16, 0), duration_min: 30,
      attendees: ['CSCO', 'Aera CRO'],
      agenda: 'Final terms + close date alignment', status: 'confirmed'
    });
    toSchedule.push({
      id: 'pend-' + oppId + '-p1', title: 'Post-signature kickoff with implementation',
      purpose: 'Line up onboarding + first 30-day success milestones',
      proposed_attendees: ['VP Demand Planning', 'Aera Implementation Lead', 'Aera CS'],
      priority: 'med', target_window: 'next-month'
    });
  } else if (stage === 'closed_won') {
    scheduled.push({
      id: 'mtg-' + oppId + '-s1', title: 'Kickoff + success plan review',
      datetime: daysFromNow(2, 10, 0), duration_min: 60,
      attendees: ['VP Demand Planning', 'IT Architect', 'Aera CS', 'Aera Implementation'],
      agenda: 'Align on go-live plan, milestones, success metrics', status: 'confirmed'
    });
  }

  return { scheduled, to_schedule: toSchedule };
}

const ACTIVITY_KINDS = ['content_view', 'event_attend', 'email_sent', 'email_reply', 'bdr_call', 'meeting'];
const WARMUP_BY_FIRE = (score) => score >= 80 ? 'qualified' : score >= 55 ? 'engaged' : score >= 30 ? 'prospecting' : 'dormant';
const INTERNAL_STAGES = ['discovery', 'validation', 'proposal', 'negotiation'];

const INDUSTRY_PLAYS = {
  'Consumer Products': ['demand_sensing', 'pricing_optimization', 'trade_promotion'],
  'Industrial Manufacturing': ['demand_sensing', 'inventory_optimization', 'supplier_risk'],
  'Life Sciences': ['demand_sensing', 'inventory_optimization', 'supplier_risk'],
  'Healthcare': ['demand_sensing', 'supplier_risk'],
  'Retail': ['demand_sensing', 'pricing_optimization', 'inventory_optimization'],
  'Wholesale Distribution': ['demand_sensing', 'inventory_optimization'],
  'High Tech': ['pricing_optimization', 'supply_planning'],
  'Telecommunications': ['pricing_optimization', 'supply_planning'],
  'Chemicals': ['demand_sensing', 'supplier_risk', 'inventory_optimization'],
  'Oil, Gas and Energy': ['supplier_risk', 'logistics_optimization'],
  'Utilities': ['supplier_risk'],
  'Mining': ['supplier_risk', 'logistics_optimization'],
  'Automotive': ['demand_sensing', 'supplier_risk', 'logistics_optimization'],
  'Aerospace & Defense': ['inventory_optimization', 'supplier_risk'],
  'Transportation & Warehousing': ['logistics_optimization', 'demand_sensing'],
  'Travel and Transportation': ['logistics_optimization', 'demand_sensing'],
  'Financial Services': ['working_capital_optimization', 'spend_analytics'],
  'Business Services': ['working_capital_optimization'],
  'Non Profit': [],
  'Education': [],
  'Agribusiness': ['demand_sensing', 'logistics_optimization']
};

const TITLES = [
  { title: 'CEO', role: 'decision_maker' },
  { title: 'CFO', role: 'decision_maker' },
  { title: 'Chief Supply Chain Officer', role: 'decision_maker' },
  { title: 'VP Supply Chain Planning', role: 'champion' },
  { title: 'VP Demand Planning', role: 'champion' },
  { title: 'Head of S&OP', role: 'user' },
  { title: 'Director of Planning', role: 'user' },
  { title: 'CIO', role: 'user' },
  { title: 'Senior Director Procurement', role: 'user' }
];
const FIRST = ['Alex', 'Priya', 'Jordan', 'Sam', 'Morgan', 'Taylor', 'Chris', 'Pat', 'Jamie', 'Drew', 'Casey', 'Dana', 'Lee', 'Ryan', 'Robin', 'Avery'];
const LAST = ['Kim', 'Patel', 'Nguyen', 'Garcia', 'Johnson', 'Chen', 'Smith', 'Wilson', 'Brown', 'Lee', 'Khan', 'Singh', 'Tanaka', 'Schmidt'];

function leadIdFromSeq(n) { return 'lead-' + String(n).padStart(6, '0'); }
function accountIdFromSfId(sfId, i) { return sfId; }

const COUNTRY_PHONE = {
  US: '+1', CA: '+1',
  GB: '+44', IE: '+353',
  FR: '+33', DE: '+49', CH: '+41', NL: '+31', BE: '+32',
  DK: '+45', SE: '+46', NO: '+47', FI: '+358',
  IT: '+39', ES: '+34', PT: '+351', AT: '+43',
  AU: '+61', NZ: '+64',
  JP: '+81', CN: '+86', IN: '+91', SG: '+65', KR: '+82',
  MX: '+52', BR: '+55', AR: '+54'
};
const COUNTRY_TZ = {
  US: 'ET', CA: 'ET',
  GB: 'GMT', IE: 'GMT', PT: 'GMT',
  FR: 'CET', DE: 'CET', CH: 'CET', NL: 'CET', BE: 'CET',
  DK: 'CET', SE: 'CET', NO: 'CET', FI: 'EET',
  IT: 'CET', ES: 'CET', AT: 'CET',
  AU: 'AET', NZ: 'NZT',
  JP: 'JST', CN: 'CST', IN: 'IST', SG: 'SGT', KR: 'KST',
  MX: 'CT', BR: 'BRT', AR: 'ART'
};

function generatePhone(country, seed) {
  const prefix = COUNTRY_PHONE[country] || '+1';
  // deterministic-ish 9-digit body from seed
  const body = String(Math.abs(Math.sin(seed * 9301 + 49297) * 1_000_000_000)).slice(0, 9).padEnd(9, '0');
  if (prefix === '+1') return prefix + ' (' + body.slice(0, 3) + ') ' + body.slice(3, 6) + '-' + body.slice(6, 9);
  if (prefix === '+44') return prefix + ' ' + body.slice(0, 4) + ' ' + body.slice(4, 9);
  return prefix + ' ' + body.slice(0, 3) + ' ' + body.slice(3, 6) + ' ' + body.slice(6, 9);
}

function timezoneFor(country) { return COUNTRY_TZ[country] || 'UTC'; }

function generate({ fire, medpicss }) {
  rnd = mulberry32(20260417);
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

  // Users
  const cpUsers = fixture.cps.map((c, idx) => ({
    id: cpIdFromName(c.name),
    name: c.name,
    role: 'cp',
    parent_id: territoryRvpId(c.territory),
    sf_user_id: '005AXRICP' + String(idx + 1).padStart(7, '0'),
    territory: c.territory
  }));

  const users = [CEO, CRO, ...RVPS, ...cpUsers, ...BDRS];

  // Accounts + enrichment
  const accounts = [];
  const enrichment = [];
  for (let i = 0; i < fixture.accounts.length; i++) {
    const a = fixture.accounts[i];
    const ownerCp = cpUsers.find(u => u.name === a.cp_name) || null;
    const rvpId = territoryRvpId(a.territory);
    const sfOwnerId = ownerCp ? ownerCp.sf_user_id : (users.find(u => u.id === rvpId)?.sf_user_id || CRO.sf_user_id);
    const createdAgoDays = between(15, 180);

    const sfAcct = {
      sf_id: a.sf_id,
      sf_name: a.name,
      sf_industry: a.gtm_industry,
      sf_sub_industry: a.sub_industry || null,
      sf_annual_revenue: a.est_revenue,
      sf_employees: a.est_employees,
      sf_billing_country: a.country,
      sf_billing_location: a.hq_label,
      sf_owner_id: sfOwnerId,
      sf_account_type: a.account_type,
      sf_created_date: daysAgo(createdAgoDays)
    };
    accounts.push(sfAcct);

    // FIRE components from the sheet's raw sub-scores
    const fitPlatform = scaleSubscore(a.fit_raw);
    const intentRaw = Math.max(a.intent_zoom_raw || 0, a.intent_ln_raw || 0);
    const intentPlatform = scaleSubscore(intentRaw);
    const recencyPlatform = scaleSubscore(a.relationship_raw);
    const engagementPlatform = scaleSubscore(a.engagement_raw);
    const fireComputed = fire.compute({
      fit: fitPlatform,
      intent: intentPlatform,
      recency: recencyPlatform,
      engagement: engagementPlatform,
      updated_at: daysAgo(between(0, 10))
    });

    const plays = INDUSTRY_PLAYS[a.gtm_industry] || [];
    enrichment.push({
      sf_id: a.sf_id,
      fire: fireComputed,
      medpicss: medpicss.empty(),
      warmup_stage: WARMUP_BY_FIRE(fireComputed.score),
      aera_plays: plays.slice(0, between(1, Math.max(1, plays.length))),
      source: 'territory_plan_fy27',
      campaign_id: 'cmp-fy27-territory',
      owner_role: 'cp',
      owner_user_id: ownerCp ? ownerCp.id : null,
      territory: a.territory,
      region_id: territoryToRegionId(a.territory),
      account_type: a.account_type,
      total_fire_raw: a.total_fire_raw,
      notes: a.notes,
      ln_intent_raw: a.intent_ln_raw,
      assignment_status: ownerCp ? 'cp_assigned' : (rvpId ? 'rvp_assigned' : 'unassigned'),
      stakeholder_lead_ids: [],
      opportunity_ids: []
    });
  }

  // Leads — every account gets at least 1, Key/Target get 3-4
  const leads = [];
  let leadSeq = 0;
  for (let i = 0; i < accounts.length; i++) {
    const acct = accounts[i];
    const e = enrichment[i];
    const count = /Key|Target/i.test(e.account_type) ? between(3, 4)
      : /Growth/i.test(e.account_type) ? between(1, 2)
      : between(1, 2);
    for (let k = 0; k < count; k++) {
      const t = TITLES[(leadSeq + k) % TITLES.length];
      const first = FIRST[(leadSeq * 7 + k * 3) % FIRST.length];
      const last = LAST[(leadSeq * 11 + k) % LAST.length];
      const name = first + ' ' + last;
      const role = (k === 0) ? t.role : (k === 1 ? 'user' : t.role);
      const isInactive = chance(0.03);
      leads.push({
        id: leadIdFromSeq(++leadSeq),
        sf_id: '003AXRI' + String(leadSeq).padStart(9, '0'),
        sf_object: 'Contact',
        sf_email: first.toLowerCase() + '.' + last.toLowerCase() + '@' + acct.sf_name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com',
        sf_phone: generatePhone(acct.sf_billing_country, leadSeq),
        sf_mobile: generatePhone(acct.sf_billing_country, leadSeq * 3 + 7),
        sf_account_id: acct.sf_id,
        name,
        title: t.title,
        linkedin: 'https://linkedin.com/in/' + first.toLowerCase() + last.toLowerCase() + '-ri',
        role_in_deal: role,
        active: !isInactive,
        last_interaction_at: chance(0.5) ? daysAgo(between(1, 60)) : null,
        signals: isInactive ? [{ kind: 'job_change', from_account_id: acct.sf_id, to_company_name: 'Acme Co', detected_at: daysAgo(between(7, 60)) }] : [],
        engagement_score: between(30, 88),
        timezone: timezoneFor(acct.sf_billing_country)
      });
    }
  }

  // Activities — 1200 events across the portfolio, weighted toward Key/Target but every account gets some touch.
  const activities = [];
  const weightedAccts = [];
  for (let i = 0; i < accounts.length; i++) {
    const e = enrichment[i];
    const w = /Key/i.test(e.account_type) ? 5
      : /Target/i.test(e.account_type) ? 3
      : /Growth/i.test(e.account_type) ? 2
      : 1;
    for (let k = 0; k < w; k++) weightedAccts.push(accounts[i]);
  }
  for (let i = 0; i < 1200; i++) {
    const acct = weightedAccts[i % weightedAccts.length];
    const kind = ACTIVITY_KINDS[i % ACTIVITY_KINDS.length];
    const isMarketingKind = (kind === 'content_view' || kind === 'event_attend' || kind === 'email_sent');
    const actor = isMarketingKind ? BDRS[i % BDRS.length].id : (acct.sf_owner_id && cpUsers.find(u => u.sf_user_id === acct.sf_owner_id)?.id) || BDRS[0].id;
    const days = between(0, 89);
    const acctLeads = leads.filter(l => l.sf_account_id === acct.sf_id);
    const lead = acctLeads.length ? acctLeads[i % acctLeads.length] : null;
    activities.push({
      id: 'act-' + String(10000 + i),
      occurred_at: daysAgo(days),
      kind,
      account_id: acct.sf_id,
      opportunity_id: null,
      lead_id: lead ? lead.id : null,
      actor_user_id: actor,
      payload: {}
    });
  }

  // Opportunities — spin out 3-4 per CP so every dashboard has pipeline.
  // Stages and velocity are rotated so projected-close dates spread across
  // the current quarter and the next 2-3 quarters.
  const STAGE_ROTATION = [
    // stage, velocity override, description
    { stage: 'negotiation', velocity: 0.85 }, // closes this Q
    { stage: 'validation', velocity: 1.0 },   // closes next Q
    { stage: 'discovery', velocity: 1.35 },   // slips to next+1 Q
    { stage: 'proposal', velocity: 1.1 }      // closes next Q
  ];
  const CLOSED_EVERY_NTH = 6;  // ~1 in 6 seeded opps is closed_won
  const CLOSED_LOST_EVERY_NTH = 11; // ~1 in 11 is closed_lost

  // Group accounts by CP, sort by FIRE within each CP
  const accountsByCp = new Map();
  for (let i = 0; i < accounts.length; i++) {
    const e = enrichment[i];
    if (!e.owner_user_id) continue;
    if (!/Key|Target|Growth/i.test(e.account_type)) continue;
    const list = accountsByCp.get(e.owner_user_id) || [];
    list.push({ acc: accounts[i], e, fireScore: e.fire.score });
    accountsByCp.set(e.owner_user_id, list);
  }

  const candidate = [];
  for (const [cpId, list] of accountsByCp) {
    list.sort((a, b) => b.fireScore - a.fireScore);
    const n = Math.min(list.length, between(2, 4));
    for (let k = 0; k < n; k++) candidate.push(list[k]);
  }

  const opps = [];
  const oppEnrichment = [];
  const winPlans = [];

  for (let i = 0; i < candidate.length; i++) {
    const { acc, e } = candidate[i];
    const rot = STAGE_ROTATION[i % STAGE_ROTATION.length];
    const isClosedWon = i % CLOSED_EVERY_NTH === CLOSED_EVERY_NTH - 1;
    const isClosedLost = !isClosedWon && (i % CLOSED_LOST_EVERY_NTH === CLOSED_LOST_EVERY_NTH - 1);
    const stage = isClosedWon ? 'closed_won' : (isClosedLost ? 'closed_lost' : rot.stage);
    const velocityOverride = (isClosedWon || isClosedLost) ? null : rot.velocity;
    const oppId = '006AXRI00' + String(100 + i).padStart(5, '0');
    const amount = between(600000, 3500000);
    const daysToClose = stage === 'closed_won' ? -between(3, 30)
      : stage === 'closed_lost' ? -between(10, 60)
      : between(45, 240);
    const close = new Date('2026-04-17T12:00:00Z');
    close.setDate(close.getDate() + daysToClose);
    const createdAgo = stage === 'negotiation' ? between(55, 90)
      : stage === 'proposal' ? between(30, 55)
      : stage === 'validation' ? between(15, 35)
      : stage === 'closed_won' ? between(120, 200)
      : stage === 'closed_lost' ? between(60, 180)
      : between(3, 15);

    opps.push({
      sf_id: oppId,
      sf_account_id: acc.sf_id,
      sf_name: acc.sf_name + ' — ' + pick(['Demand Sensing PoV', 'Inventory Optimization Pilot', 'Supply Control Tower', 'Pricing Optimization Pilot', 'E2E Plan & Execute']),
      sf_amount: amount,
      sf_stage_name: capitalize(stage.replace('_', ' ')),
      sf_close_date: close.toISOString().slice(0, 10),
      sf_probability: stage === 'discovery' ? 20 : stage === 'validation' ? 40 : stage === 'proposal' ? 60 : stage === 'negotiation' ? 75 : 100,
      sf_owner_id: acc.sf_owner_id,
      sf_created_date: daysAgo(createdAgo)
    });

    // Pre-populate MEDPICSS to reflect stage maturity
    const enrichRef = enrichment.find(x => x.sf_id === acc.sf_id);
    if (enrichRef && stage !== 'closed_won') {
      const fillSlots = stage === 'discovery' ? ['metrics', 'identify_pain'] :
        stage === 'validation' ? ['metrics', 'identify_pain', 'decision_criteria', 'competition', 'champion'] :
        stage === 'proposal' ? ['metrics', 'identify_pain', 'decision_criteria', 'competition', 'champion', 'economic_buyer', 'success_criteria'] :
        ['metrics', 'identify_pain', 'decision_criteria', 'decision_process', 'competition', 'champion', 'economic_buyer', 'success_criteria'];
      for (const slot of fillSlots) {
        if (slot === 'champion' || slot === 'economic_buyer') {
          const acctLeads = leads.filter(l => l.sf_account_id === acc.sf_id && l.active !== false);
          const wanted = slot === 'champion' ? 'champion' : 'decision_maker';
          const match = acctLeads.find(l => l.role_in_deal === wanted) || acctLeads[0];
          if (match) {
            if (slot === 'champion') match.role_in_deal = 'champion';
            if (slot === 'economic_buyer') match.role_in_deal = 'decision_maker';
            enrichRef.medpicss[slot] = { filled: true, stakeholder_id: match.id, updated_at: daysAgo(between(1, 30)) };
          }
        } else {
          enrichRef.medpicss[slot] = { filled: true, note: defaultNote(slot), updated_at: daysAgo(between(1, 30)) };
        }
      }
    }

    const history = [];
    const order = ['discovery', 'validation', 'proposal', 'negotiation', stage === 'closed_lost' ? 'closed_lost' : 'closed_won'];
    const sIdx = order.indexOf(stage);
    for (let s = 0; s <= sIdx; s++) {
      history.push({
        stage: order[s],
        entered_at: daysAgo(createdAgo - s * 14),
        exited_at: s < sIdx ? daysAgo(createdAgo - (s + 1) * 14) : undefined
      });
    }

    const winPlanId = 'wp-' + oppId;
    winPlans.push({
      id: winPlanId,
      opportunity_id: oppId,
      created_at: daysAgo(createdAgo),
      action_items: [
        { id: 'ai-' + oppId + '-1', stage: 'discovery', text: 'Confirm pain + quantify baseline', status: 'done' },
        { id: 'ai-' + oppId + '-2', stage: 'validation', text: 'Success criteria review with champion', status: stage === 'discovery' ? 'open' : 'done' },
        { id: 'ai-' + oppId + '-3', stage: 'proposal', text: 'Deliver value model readout', status: (stage === 'proposal' || stage === 'negotiation' || stage === 'closed_won') ? 'in_progress' : 'open' },
        { id: 'ai-' + oppId + '-4', stage: 'negotiation', text: 'Map paper process', status: stage === 'negotiation' || stage === 'closed_won' ? 'in_progress' : 'open' }
      ],
      stage_playbooks: {
        discovery: { exit_criteria: ['Pain confirmed', 'Champion identified'], default_tasks: [] },
        validation: { exit_criteria: ['Success criteria signed', 'Econ buyer meeting'], default_tasks: [] },
        proposal: { exit_criteria: ['ROI model agreed'], default_tasks: [] },
        negotiation: { exit_criteria: ['Paper process mapped'], default_tasks: [] }
      },
      risks: [{ text: 'Incumbent planning tool entrenched', severity: 'med' }],
      next_best_action: stage === 'discovery' ? 'Book economic buyer intro' :
        stage === 'validation' ? 'Lock in success criteria with champion' :
        stage === 'proposal' ? 'Pull ROI readout forward' :
        stage === 'negotiation' ? 'Close legal redlines this week' :
        'Onboarding kickoff',
      meetings: buildMeetingsForStage(oppId, stage, acc)
    });

    oppEnrichment.push({
      sf_id: oppId,
      internal_stage: stage,
      stage_history: history,
      source_plan_id: null,
      source_white_space_idx: null,
      win_plan_id: winPlanId,
      last_activity_at: daysAgo(between(0, 10)),
      _velocity_override: velocityOverride
    });

    if (enrichRef) {
      enrichRef.opportunity_ids.push(oppId);
      enrichRef.warmup_stage = 'spun_out';
    }

    // Add a few opp-tied activities
    for (let a = 0; a < 3; a++) {
      activities.push({
        id: 'act-opp-' + oppId + '-' + a,
        occurred_at: daysAgo(between(0, createdAgo)),
        kind: pick(['meeting', 'email_reply', 'bdr_call']),
        account_id: acc.sf_id,
        opportunity_id: oppId,
        lead_id: null,
        actor_user_id: acc.sf_owner_id && cpUsers.find(u => u.sf_user_id === acc.sf_owner_id)?.id || BDRS[0].id,
        payload: {}
      });
    }
  }

  // Meeting notes — pre-seed a couple on the first negotiation-stage opp so the
  // analysis flow has a realistic starting point.
  const meetingNotes = [];
  const negotiationOpp = opps.find((o, i) => oppEnrichment[i].internal_stage === 'negotiation');
  if (negotiationOpp) {
    const idx = opps.indexOf(negotiationOpp);
    const owner = negotiationOpp.sf_owner_id;
    const cpId = cpUsers.find(u => u.sf_user_id === owner)?.id || 'user-cp-01';
    meetingNotes.push({
      id: 'mn-seed-1',
      opportunity_id: negotiationOpp.sf_id,
      account_id: negotiationOpp.sf_account_id,
      author_user_id: cpId,
      meeting_date: daysAgo(10).slice(0, 10),
      meeting_type: 'discovery',
      participants: ['Champion - VP Demand Planning', 'Aera - CP', 'Aera - Solution Architect'],
      notes: 'Great session with the VP Demand Planning. Champion confirmed they have power to sign up to $2M without CFO escalation. They shared Kinaxis as their incumbent but said they are actively evaluating replacements after last quarter’s forecast miss. Success criteria agreed: +10 pts forecast accuracy on pilot SKUs within 90 days. Decision criteria shared — accuracy lift, time-to-value, ERP integration.',
      created_at: daysAgo(10)
    });
    meetingNotes.push({
      id: 'mn-seed-2',
      opportunity_id: negotiationOpp.sf_id,
      account_id: negotiationOpp.sf_account_id,
      author_user_id: cpId,
      meeting_date: daysAgo(3).slice(0, 10),
      meeting_type: 'exec_alignment',
      participants: ['CFO - Economic Buyer', 'CSCO', 'Aera - CP'],
      notes: 'Econ buyer meeting secured and held. CFO aligned on working-capital impact. Legal flagged a 60-day review cycle on master services agreement — pushes signature risk. Kinaxis eliminated — they heard our story on autonomous execution and confirmed their team is no longer evaluating the incumbent for this use case. Verbal commitment received pending legal.',
      created_at: daysAgo(3)
    });
  }

  // Transition signals — convert sheet's transition plan into job-change-like notes
  // on account enrichment so RVPs can see "account being re-homed" flags.
  const transitions = (fixture.transitions || []).map(t => ({
    account_name: t.account,
    current_region: t.current_region,
    future_region: t.future_region,
    transition_when: t.transition_when,
    notes: t.notes
  }));
  for (const t of transitions) {
    const acct = accounts.find(a => a.sf_name.toLowerCase().trim() === (t.account_name || '').toLowerCase().trim());
    if (acct) {
      const er = enrichment.find(e => e.sf_id === acct.sf_id);
      if (er) {
        er.transition = {
          current_region: t.current_region,
          future_region: t.future_region,
          when: t.transition_when,
          notes: t.notes
        };
      }
    }
  }

  return { users, accounts, enrichment, leads, activities, opps, oppEnrichment, winPlans, transitions, meetingNotes, regions: REGIONS };
}

function defaultNote(slot) {
  switch (slot) {
    case 'metrics': return 'Forecast accuracy 62%, target 75%';
    case 'identify_pain': return 'Demand volatility driving stockouts + E&O';
    case 'decision_criteria': return 'Forecast accuracy; time-to-value; ERP integration';
    case 'decision_process': return 'Champion → CSCO → CFO → CIO security review';
    case 'paper_process': return 'Master services agreement via procurement';
    case 'competition': return 'Kinaxis, Blue Yonder';
    case 'success_criteria': return 'Forecast +10 pts in 90-day pilot';
    default: return '';
  }
}

module.exports = { generate };
