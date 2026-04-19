/**
 * Deterministic fallback account plan used when no GEMINI_API_KEY is configured.
 * Keeps the demo fully working offline.
 */
function fallbackPlan({ companyName, industry, revenue }) {
  const industryLabel = industry || 'Enterprise';
  return {
    companyName,
    generatedAt: new Date().toISOString(),
    _demo: true,
    overview: {
      industry: industryLabel,
      hqLocation: 'Various',
      annualRevenue: revenue || '$1B+',
      employeeCount: '10,000+',
      keySegments: [
        'Core business operations (65%)',
        'Growth initiatives (25%)',
        'Emerging markets (10%)'
      ],
      growthTrajectory: companyName + ' is navigating post-pandemic supply chain volatility while pursuing double-digit growth in adjacent markets. Leadership has committed to a multi-year digital transformation with AI and automation as central pillars. Recent earnings calls emphasize working-capital optimization and forecast accuracy as board-level priorities.',
      competitiveLandscape: 'Competes against three global incumbents plus two fast-moving challengers. Market share has been flat-to-up over the last 24 months despite margin compression. Differentiation increasingly hinges on data-driven operations rather than product breadth.',
      implicationForSeller: 'Aera\'s Demand Sensing, Inventory Optimization, and Control Tower Skills directly map to stated executive priorities. A Decision Intelligence layer over their existing ERP/planning stack would close the loop between insight and action without a full system replacement.'
    },
    news: [
      { date: 'Mar 2026', headline: 'Announced $200M investment in AI-driven supply chain', relevanceTag: 'High — direct signal of Decision Intelligence need', source: 'Company press release' },
      { date: 'Feb 2026', headline: 'Named new Chief Supply Chain Officer from CPG industry', relevanceTag: 'High — new exec typically reshapes tech stack within 12 months', source: 'Reuters' },
      { date: 'Jan 2026', headline: 'Q4 earnings miss attributed to inventory write-downs', relevanceTag: 'High — quantified pain Aera solves', source: 'WSJ' }
    ],
    whiteSpace: [
      { area: 'Demand Sensing', problem: 'Forecast accuracy sits at 62%, causing recurring stockouts on A-class SKUs and excess inventory on long-tail. Planners run weekly cycles that miss intra-week signal shifts.', aeraPlay: 'Aera Demand Sensing consumes POS, weather, and promotion signals to produce daily forecasts with causal explanations — embedded into existing planner workflow.', value: '$8-12M/yr', urgency: 'high' },
      { area: 'Inventory Optimization', problem: 'Safety stock is set by static rules that haven\'t been retuned in 3 years. E&O inventory has grown 18% YoY.', aeraPlay: 'Multi-echelon optimization with dynamic service-level targets. Pilots typically cut E&O by 15-30% within 2 quarters.', value: '$5-15M/yr', urgency: 'high' },
      { area: 'Supplier Risk', problem: 'Single-source dependencies in 4 critical component categories, with no real-time visibility into tier-2 suppliers.', aeraPlay: 'Supplier Risk Skill ingests news, ratings, and financial signals to surface disruptions 30-60 days earlier.', value: '$3-8M/yr', urgency: 'medium' }
    ],
    competitive: {
      positioning: 'Aera is the only Decision Intelligence platform that closes the loop from signal to action in real time. Kinaxis and Blue Yonder require humans in every planning cycle; Aera can execute bounded decisions autonomously with full explainability.',
      landscape: [
        { competitor: 'Kinaxis', weakness: 'Planning-heavy, not autonomous. Users must accept every recommendation manually.', aeraAdvantage: 'Autonomous execution + explainable recommendations. Faster time-to-value via pre-built Skills.' },
        { competitor: 'SAP IBP', weakness: 'Batch-driven, tightly coupled to SAP, complex implementation.', aeraAdvantage: 'Works alongside SAP without replacement. Real-time rather than nightly batch.' },
        { competitor: 'Blue Yonder', weakness: 'Legacy architecture, heavy implementation services.', aeraAdvantage: 'Cloud-native Decision Intelligence layer — deployable in weeks, not quarters.' }
      ]
    },
    stakeholders: [
      { name: 'Chief Supply Chain Officer', title: 'CSCO', roleInDeal: 'Executive Sponsor', relevance: 'High', notes: 'Newly appointed; explicit mandate to modernize planning. Will champion Aera if first 90 days deliver quantified insight.', linkedin: 'https://linkedin.com/in/example-csco' },
      { name: 'VP Demand Planning', title: 'VP Demand Planning', roleInDeal: 'Champion', relevance: 'High', notes: 'Owns forecast accuracy KPI — lives the pain daily. Natural champion and product evaluator.', linkedin: 'https://linkedin.com/in/example-demand' },
      { name: 'CIO', title: 'Chief Information Officer', roleInDeal: 'Evaluator', relevance: 'High', notes: 'Will evaluate integration with existing ERP and data lake. Key to getting security/architecture review through.', linkedin: 'https://linkedin.com/in/example-cio' },
      { name: 'CFO', title: 'Chief Financial Officer', roleInDeal: 'Economic Buyer', relevance: 'High', notes: 'Ultimately signs the PO. Motivated by working-capital and margin impact.', linkedin: 'https://linkedin.com/in/example-cfo' }
    ],
    valueHypothesis: {
      metrics: [
        { metric: '10-15 pt forecast accuracy lift', impact: '$8-12M working-capital release based on current inventory position', confidence: 'High' },
        { metric: '20% E&O reduction', impact: '$5-8M write-down avoidance over 24 months', confidence: 'Medium' },
        { metric: '60% faster planner decision cycle', impact: 'Equivalent to 15 FTE capacity reallocation', confidence: 'High' }
      ],
      executivePitch: companyName + '\'s stated priority of closing the insight-to-action gap maps directly onto Aera\'s Decision Intelligence platform. We can show a working pilot on your own data in under 60 days — quantifying forecast accuracy lift and inventory release before any platform commitment. Teams at peers have released $20M+ in working capital in year one.'
    },
    risks: [
      { risk: 'Incumbent (Kinaxis/Blue Yonder) has multi-year contract with high exit cost', mitigation: 'Position Aera as a Decision Intelligence layer over, not replacement of, the incumbent. Avoid platform-swap politics.' },
      { risk: 'IT prioritization — queue behind in-flight ERP upgrade', mitigation: 'Scope a thin pilot outside the ERP program. Secure CFO sponsorship to pull forward budget.' },
      { risk: 'Data quality blockers delay PoV', mitigation: 'Identify 2-3 SKU families with clean data for initial pilot. Use Aera data-readiness Skill.' }
    ],
    plan: {
      day10: { title: 'Research & Initial Outreach', actions: [
        'Send tailored outreach to VP Demand Planning referencing Q4 inventory write-down in public earnings',
        'Secure warm intro to CSCO via shared board connection',
        'Share Aera CPG customer reference (forecast accuracy lift story)',
        'Complete competitive differentiation one-pager vs. incumbent planning tool'
      ] },
      day30: { title: 'Engage & Qualify', actions: [
        'Run discovery workshop with demand planning team — quantify current forecast accuracy baseline',
        'Map stakeholder landscape; confirm CFO alignment on working-capital thesis',
        'Present tailored Aera Demand Sensing demo using sample data from their industry',
        'Secure commitment to scoped 60-day PoV on 2 SKU families'
      ] },
      day60: { title: 'Advance & Demonstrate', actions: [
        'Deliver PoV readout to CSCO + CFO with dollarized value model',
        'Co-author mutual action plan with VP Demand Planning',
        'Clear security/architecture review with CIO team',
        'Negotiate commercial terms; target signed pilot conversion by quarter end'
      ] }
    }
  };
}

module.exports = { fallbackPlan };
