const gemini = require('../gemini');
const { getSellerContext, SellerProfile } = require('../seller-profile');

const INDUSTRIES = ['Logistics', 'CPG', 'Pharma', 'Manufacturing', 'Retail', 'Hi-Tech', 'Financial Services', 'Automotive', 'Chemicals', 'Oil & Gas'];

// Aera-contextual fixture data. Each account carries:
//  - a primary_play: the lead Aera Skill that maps to their pain
//  - aera_plays[]: 2-3 Skills that fit
//  - aera_angle: one-sentence "why now, why Aera" thesis
//  - value_estimate: $-range grounded in Aera's published value metrics
//  - intent_signals[]: public evidence that the deal is ripe
//  - pain_hooks[]: specific pain language mapped from campaign pain_points
const FIXTURES = {
  CPG: [
    { company: 'Procter & Gamble', revenue: 84000000000, headcount: 107000, location: 'Cincinnati, OH', bombora: 78,
      summary: 'Global CPG leader under margin pressure from commodity volatility + SKU proliferation.',
      aera_angle: 'Post-2024 inventory write-downs + stated AI commitment on Q3 earnings make this a prime Demand Sensing target now.',
      primary_play: 'Demand Sensing',
      aera_plays: ['Demand Sensing', 'Inventory Optimization', 'Pricing Optimization'],
      value_estimate: '$40-80M/yr in working-capital release + 2-3 pt margin lift',
      intent_signals: ['CSCO cited forecast accuracy as top-3 priority on Q3 call', 'LinkedIn: hiring 12 AI/ML roles in supply chain', 'Bombora spike on "demand planning"'] },
    { company: 'Colgate-Palmolive', revenue: 20000000000, headcount: 33400, location: 'New York, NY', bombora: 62,
      summary: 'Mature CPG brand with 200+ market operating complexity.',
      aera_angle: 'Trade-promotion ROI + multi-echelon inventory are both 10-K-flagged margin levers that Aera directly solves.',
      primary_play: 'Trade Promotion',
      aera_plays: ['Trade Promotion', 'Demand Sensing', 'Inventory Optimization'],
      value_estimate: '$15-25M/yr promo lift + $5-8M E&O reduction',
      intent_signals: ['Analyst day flagged "digital supply chain" as 2026 investment theme', 'New CFO from Mondelez (Aera customer reference candidate)'] },
    { company: 'Kimberly-Clark', revenue: 20400000000, headcount: 42000, location: 'Irving, TX', bombora: 55,
      summary: 'Consumer health + hygiene with ongoing network redesign.',
      aera_angle: 'Announced supply-chain transformation program in Jan 2026 — the board is already bought in on decision intelligence.',
      primary_play: 'Inventory Optimization',
      aera_plays: ['Inventory Optimization', 'Demand Sensing', 'Control Tower'],
      value_estimate: '$10-18M/yr inventory working capital',
      intent_signals: ['Press release Jan 2026: "AI-driven supply chain" $200M commitment', 'CSCO publicly speaking at Gartner 2026'] },
    { company: 'Kraft Heinz', revenue: 26600000000, headcount: 37000, location: 'Chicago, IL', bombora: 48,
      summary: 'Food + beverage under gross-margin pressure.',
      aera_angle: 'Margin compression + 3G cost discipline make quantified decision automation an easier board conversation.',
      primary_play: 'Demand Sensing',
      aera_plays: ['Demand Sensing', 'Pricing Optimization'],
      value_estimate: '$8-15M/yr promo + planning lift',
      intent_signals: ['Q4 miss attributed to forecast gap', 'LinkedIn: VP Demand Planning role open >90 days'] }
  ],
  Logistics: [
    { company: 'DHL Supply Chain', revenue: 31000000000, headcount: 164000, location: 'Bonn, DE', bombora: 71,
      summary: 'Contract logistics giant investing in AI-driven warehouse orchestration.',
      aera_angle: 'Stated multi-year digital strategy + known Kinaxis dissatisfaction at a BU level opens a beachhead for Aera.',
      primary_play: 'Logistics Optimization',
      aera_plays: ['Logistics Optimization', 'Demand Sensing', 'Supplier Risk'],
      value_estimate: '$25-50M/yr network cost takeout',
      intent_signals: ['CEO: "AI-native operations" in FY27 strategy deck', 'Bombora: spike on "control tower" + "autonomous planning"'] },
    { company: 'CH Robinson', revenue: 17600000000, headcount: 17000, location: 'Eden Prairie, MN', bombora: 64,
      summary: 'Freight broker modernizing pricing and capacity matching with AI.',
      aera_angle: 'Pricing Optimization and dynamic capacity matching map 1:1 to their earnings-call priorities.',
      primary_play: 'Pricing Optimization',
      aera_plays: ['Pricing Optimization', 'Demand Sensing'],
      value_estimate: '$12-20M/yr margin lift on freight spread' },
    { company: 'XPO Logistics', revenue: 7800000000, headcount: 39000, location: 'Greenwich, CT', bombora: 58,
      summary: 'LTL operator pushing for network optimization and dynamic pricing.',
      aera_angle: 'LTL density optimization is a textbook Decision Intelligence problem — real-time routing + pricing closed loop.',
      primary_play: 'Logistics Optimization',
      aera_plays: ['Logistics Optimization', 'Pricing Optimization'],
      value_estimate: '$8-14M/yr network + pricing impact' },
    { company: 'Ryder System', revenue: 12000000000, headcount: 47000, location: 'Miami, FL', bombora: 52,
      summary: 'Fleet management + supply chain; digital transformation underway.',
      aera_angle: 'Fleet utilization + dedicated contract margin both unlock with Aera\'s closed-loop execution.',
      primary_play: 'Logistics Optimization',
      aera_plays: ['Logistics Optimization', 'Inventory Optimization'],
      value_estimate: '$10-18M/yr fleet + inventory optimization' }
  ],
  Pharma: [
    { company: 'Merck', revenue: 60100000000, headcount: 68000, location: 'Rahway, NJ', bombora: 68,
      summary: 'Top-tier pharma with complex global supply chain and strict compliance needs.',
      aera_angle: 'Serialization + cold-chain + forecast accuracy form a triangle Aera uniquely solves without ripping out SAP.',
      primary_play: 'Demand Sensing',
      aera_plays: ['Demand Sensing', 'Supplier Risk', 'Inventory Optimization'],
      value_estimate: '$30-60M/yr inventory + stock-out avoidance',
      intent_signals: ['CSCO public remarks on "intelligent planning" (Feb 2026)', 'Supplier risk (API single-source) board topic post-pandemic'] },
    { company: 'Bristol-Myers Squibb', revenue: 45000000000, headcount: 34300, location: 'Princeton, NJ', bombora: 62,
      summary: 'Pharma — demand planning lift and procurement optimization opportunities.',
      aera_angle: 'Patent-cliff-driven margin focus + new CFO create a window for a quantified Aera PoV.',
      primary_play: 'Demand Sensing',
      aera_plays: ['Demand Sensing', 'Procurement Optimization'],
      value_estimate: '$20-35M/yr combined' },
    { company: 'Gilead Sciences', revenue: 27100000000, headcount: 18000, location: 'Foster City, CA', bombora: 59,
      summary: 'Biotech leader investing in E2E supply visibility.',
      aera_angle: 'Small, fast-moving team — perfect Aera adoption profile. Control Tower first, then expand.',
      primary_play: 'Control Tower',
      aera_plays: ['Control Tower', 'Demand Sensing', 'Supplier Risk'],
      value_estimate: '$8-15M/yr visibility + response time improvement' }
  ],
  Manufacturing: [
    { company: 'Caterpillar', revenue: 67000000000, headcount: 113000, location: 'Deerfield, IL', bombora: 64,
      summary: 'Heavy machinery giant rationalizing inventory across 500+ dealers.',
      aera_angle: 'Dealer inventory + multi-echelon optimization is Aera\'s home pitch — we beat Kinaxis + Blue Yonder on explainability.',
      primary_play: 'Inventory Optimization',
      aera_plays: ['Inventory Optimization', 'Demand Sensing', 'Supplier Risk'],
      value_estimate: '$40-75M/yr dealer inventory + forecast lift' },
    { company: 'Illinois Tool Works', revenue: 16100000000, headcount: 45000, location: 'Glenview, IL', bombora: 54,
      summary: 'Diversified industrial; pricing optimization candidate.',
      aera_angle: 'ITW\'s 80/20 operating model lines up exactly with Aera\'s decision-automation thesis.',
      primary_play: 'Pricing Optimization',
      aera_plays: ['Pricing Optimization', 'Inventory Optimization'],
      value_estimate: '$12-22M/yr margin lift' }
  ],
  Retail: [
    { company: 'Target', revenue: 107400000000, headcount: 440000, location: 'Minneapolis, MN', bombora: 72,
      summary: 'Omni-channel retailer with well-publicized inventory pain in 2023-2024.',
      aera_angle: 'Public inventory pain + board-level focus on forecast accuracy = rare alignment for an enterprise-scale Aera deployment.',
      primary_play: 'Inventory Optimization',
      aera_plays: ['Inventory Optimization', 'Demand Sensing', 'Pricing Optimization'],
      value_estimate: '$80-150M/yr inventory + allocation',
      intent_signals: ['$2B inventory write-down Q2 2023', 'CIO public talk at NRF on "AI ops"'] },
    { company: 'Best Buy', revenue: 43500000000, headcount: 85000, location: 'Richfield, MN', bombora: 58,
      summary: 'Consumer electronics retailer — demand sensing + store-level allocation needs.',
      aera_angle: 'Consumer-electronics lifecycle volatility makes Demand Sensing a quantifiable quick win.',
      primary_play: 'Demand Sensing',
      aera_plays: ['Demand Sensing', 'Inventory Optimization'],
      value_estimate: '$15-28M/yr forecast + allocation' }
  ],
  'Hi-Tech': [
    { company: 'Dell Technologies', revenue: 102300000000, headcount: 133000, location: 'Round Rock, TX', bombora: 66,
      summary: 'Consumer + enterprise compute with build-to-order complexity.',
      aera_angle: 'Dell\'s BTO + component supply volatility + AI-server demand surge stacks perfectly for Aera\'s supply planning Skill.',
      primary_play: 'Supply Planning',
      aera_plays: ['Supply Planning', 'Demand Sensing', 'Pricing Optimization'],
      value_estimate: '$40-75M/yr supply + pricing' },
    { company: 'HP Inc.', revenue: 60000000000, headcount: 58000, location: 'Palo Alto, CA', bombora: 50,
      summary: 'Print + PC with margin pressure and inventory concentration risk.',
      aera_angle: 'Classic Aera target: mature ERP + planning stack, margin-pressured, quantified improvement opportunities.',
      primary_play: 'Demand Sensing',
      aera_plays: ['Demand Sensing', 'Inventory Optimization'],
      value_estimate: '$15-30M/yr' }
  ],
  'Financial Services': [
    { company: 'Capital One', revenue: 36700000000, headcount: 51000, location: 'McLean, VA', bombora: 48,
      summary: 'Consumer + commercial bank with significant tech spend.',
      aera_angle: 'FinServ angle for Aera is Spend Analytics + Working Capital — narrow but high-impact.',
      primary_play: 'Spend Analytics',
      aera_plays: ['Spend Analytics', 'Working Capital Optimization'],
      value_estimate: '$10-18M/yr working capital' },
    { company: 'Fidelity', revenue: 28200000000, headcount: 74000, location: 'Boston, MA', bombora: 42,
      summary: 'Financial services giant with complex procurement spend.',
      aera_angle: 'Procurement Optimization lands first; commercial pricing analytics can expand later.',
      primary_play: 'Procurement Optimization',
      aera_plays: ['Procurement Optimization', 'Spend Analytics'],
      value_estimate: '$6-12M/yr procurement savings' }
  ],
  Automotive: [
    { company: 'Ford', revenue: 158100000000, headcount: 177000, location: 'Dearborn, MI', bombora: 70,
      summary: 'Global OEM with supplier-risk exposure and EV transition.',
      aera_angle: 'EV ramp + chip exposure + stated "digital Ford" program make this a multi-Skill, multi-year Aera platform play.',
      primary_play: 'Supplier Risk',
      aera_plays: ['Supplier Risk', 'Demand Sensing', 'Logistics Optimization'],
      value_estimate: '$50-100M/yr supplier + inventory',
      intent_signals: ['Board-level AI commitment', 'Tier-2 supplier visibility a public issue post-2022'] },
    { company: 'Stellantis', revenue: 189500000000, headcount: 272000, location: 'Hoek van Holland, NL', bombora: 56,
      summary: 'Multi-brand OEM with complex global SKU / plant mix.',
      aera_angle: 'Plant allocation + brand-level demand sensing is a high-ROI, board-visible problem Aera is uniquely positioned for.',
      primary_play: 'Supply Planning',
      aera_plays: ['Supply Planning', 'Demand Sensing'],
      value_estimate: '$60-120M/yr plant + demand' }
  ],
  Chemicals: [
    { company: 'Dow', revenue: 44500000000, headcount: 35900, location: 'Midland, MI', bombora: 60,
      summary: 'Diversified chemicals with commodity exposure.',
      aera_angle: 'Price-mix optimization + feedstock supplier risk form a repeatable Aera entry.',
      primary_play: 'Pricing Optimization',
      aera_plays: ['Pricing Optimization', 'Supplier Risk'],
      value_estimate: '$20-35M/yr margin lift' }
  ],
  'Oil & Gas': [
    { company: 'Chevron', revenue: 196900000000, headcount: 43800, location: 'San Ramon, CA', bombora: 44,
      summary: 'Integrated oil major with significant procurement spend.',
      aera_angle: 'Procurement Optimization on non-hydrocarbon spend is the most tractable Aera first land.',
      primary_play: 'Procurement Optimization',
      aera_plays: ['Procurement Optimization', 'Spend Analytics'],
      value_estimate: '$15-30M/yr procurement savings' }
  ]
};

const DEFAULT_STAKEHOLDERS = [
  { name: 'Chief Supply Chain Officer', title: 'CSCO', role: 'Executive Sponsor', linkedin_suffix: 'csco' },
  { name: 'VP Demand Planning', title: 'VP Demand Planning', role: 'Champion', linkedin_suffix: 'demand' },
  { name: 'CFO', title: 'Chief Financial Officer', role: 'Economic Buyer', linkedin_suffix: 'cfo' },
  { name: 'CIO', title: 'Chief Information Officer', role: 'Evaluator', linkedin_suffix: 'cio' }
];

const DEFAULT_INTENT_SIGNALS = ['Recent earnings-call mention of forecast accuracy', 'LinkedIn: open planning roles', 'Bombora: spike on "decision intelligence"'];

function fallback(input) {
  const industry = input.industry || 'CPG';
  const n = Math.max(1, Math.min(20, Number(input.count) || 8));
  const list = FIXTURES[industry] || FIXTURES.CPG;
  // Cycle to cover requested N even if fixture is smaller (with dedupe suffixes)
  const cycled = [];
  for (let i = 0; i < n; i++) {
    const base = list[i % list.length];
    cycled.push(i < list.length ? base : { ...base, company: base.company + ' (' + Math.floor(i / list.length + 1) + ')' });
  }
  return cycled.map((c, i) => ({
    ...c,
    industry,
    tech_stack: ['SAP', 'Oracle', 'Snowflake'],
    bombora_score: c.bombora,
    recent_searches: ['decision intelligence', 'demand sensing'],
    acv_potential: 200000 + i * 150000,
    stakeholders: DEFAULT_STAKEHOLDERS.map((s, idx) => ({
      name: s.name,
      title: s.title,
      role: s.role,
      linkedin: 'https://linkedin.com/in/' + (c.company.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'x') + '-' + s.linkedin_suffix + '-' + idx
    })),
    news: [
      { date: '2026-03-01', headline: c.company + ' announces supply chain modernization program', source: 'Reuters' }
    ],
    funding: 'Public',
    founded: '1900',
    ceo: 'CEO',
    intent_signals: c.intent_signals || DEFAULT_INTENT_SIGNALS,
    pain_hooks: painHooksFor(input.pain_points || [])
  }));
}

function painHooksFor(pains) {
  const map = {
    forecast_accuracy: 'Forecast accuracy < 70% creates chronic stockout + E&O tension',
    inventory_optimization: 'Static safety-stock rules no longer match demand volatility',
    supplier_risk: 'Single-source exposure in critical categories surfaces quarterly',
    pricing: 'Pricing decisions still driven by spreadsheets + quarterly cycles',
    working_capital: 'Working-capital release is a board-level commitment for FY27',
    demand_volatility: 'Post-pandemic demand volatility breaking weekly planning cadence'
  };
  return pains.map(p => map[p]).filter(Boolean);
}

async function discover(input) {
  const industry = input.industry || 'CPG';
  const pains = (input.pain_points || []).join(', ') || 'forecast accuracy, inventory optimization';
  const seniority = input.seniority || 'VP';
  const persona = input.persona || 'VP Supply Chain';
  const count = Math.max(1, Math.min(20, Number(input.count) || 8));

  if (!gemini.keyConfigured()) {
    return { accounts: fallback(input), demo: true };
  }

  const seller = getSellerContext();
  const system = 'You are a B2B sales intelligence analyst at ' + SellerProfile.companyName + ' — the Decision Intelligence company. Your job is market research, but every result must be framed through Aera\'s lens: which Aera Skill fits, why NOW, quantified value, and public evidence of buying intent. Return ONLY valid JSON.' + seller;
  const msg = 'Find ' + count + ' REAL companies for this Aera campaign. For each, the payload must make it obvious WHY Aera wins.\n\n' +
    'Industry: ' + industry + '\n' +
    'Target Persona: ' + persona + ' (' + seniority + ')\n' +
    'Pain Points: ' + pains + '\n\n' +
    'Return JSON:\n' +
    '{"accounts":[{' +
    '"company":"Real Company","industry":"' + industry + '","revenue":50000000,"headcount":250,"location":"City, ST",' +
    '"tech_stack":["SAP","Snowflake"],"bombora_score":65,' +
    '"summary":"2-3 sentence business-context description",' +
    '"aera_angle":"ONE sharp sentence: why Aera wins here, right now",' +
    '"primary_play":"the lead Aera Skill (one of: Demand Sensing, Inventory Optimization, Supply Planning, Logistics Optimization, Control Tower, Supplier Risk, Pricing Optimization, Trade Promotion, Procurement Optimization, Spend Analytics, Working Capital Optimization)",' +
    '"aera_plays":["2-3 Aera Skills that fit"],' +
    '"value_estimate":"$X-Y M/yr grounded in Aera value metrics",' +
    '"intent_signals":["2-3 SPECIFIC public signals that this deal is ripe (earnings call quote, exec change, press release, Bombora spike)"],' +
    '"pain_hooks":["1-2 sentences tying the campaign pain points to their specific business"],' +
    '"stakeholders":[{"name":"Real Executive","title":"CSCO","role":"Executive Sponsor","linkedin":"https://linkedin.com/in/slug"}],' +
    '"news":[{"headline":"Recent real headline","source":"WSJ","date":"2026-02-01"}]' +
    '}]}\n' +
    'Use REAL companies. Mix 2 large ($1B+), 3 mid ($100M-1B), 3 smaller ($20-100M). 3-4 stakeholders per account. aera_angle must name a specific Aera Skill and a specific buying trigger.';

  try {
    const raw = await gemini.call(system, msg, 8192);
    const parsed = gemini.parseJSON(raw);
    if (parsed && Array.isArray(parsed.accounts) && parsed.accounts.length) {
      return { accounts: parsed.accounts.slice(0, count), demo: false };
    }
  } catch (e) { /* fall through */ }
  return { accounts: fallback(input), demo: true };
}

module.exports = { discover, INDUSTRIES };
