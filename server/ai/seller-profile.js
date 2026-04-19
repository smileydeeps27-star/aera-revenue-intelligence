const SellerProfile = {
  companyName: 'Aera Technology',
  tagline: 'The Decision Intelligence Platform',
  description: 'Aera Technology is the Decision Intelligence company. Aera\'s platform senses, thinks, and acts — enabling enterprises to make better, faster decisions across supply chain, finance, procurement, and commercial operations.',
  capabilities: [
    { domain: 'Supply Chain', skills: ['Demand Sensing & Forecasting', 'Inventory Optimization (Multi-echelon)', 'Supply Planning & Allocation', 'Logistics Optimization', 'Control Tower & Visibility'] },
    { domain: 'Finance', skills: ['Revenue Management', 'Cost Optimization', 'Working Capital Optimization', 'Financial Planning & Analysis'] },
    { domain: 'Procurement', skills: ['Spend Analytics', 'Supplier Risk Management', 'Procurement Optimization', 'Contract Compliance'] },
    { domain: 'Commercial', skills: ['Pricing Optimization', 'Promotion Effectiveness', 'Trade Promotion Management', 'Customer Segmentation'] }
  ],
  keyDifferentiators: [
    'Real-time decisioning (not batch planning) — senses changes and recommends actions in real time',
    'Closed-loop execution — doesn\'t just recommend, it can execute decisions autonomously',
    'Explainable AI — every recommendation comes with reasoning, critical for executive trust',
    'Platform approach — single Decision Intelligence layer across supply chain, finance, procurement, commercial',
    'Pre-built Skills — ready-to-deploy decision models that accelerate time-to-value'
  ],
  competitors: [
    { name: 'Kinaxis', weakness: 'Planning-heavy, not autonomous. Strong in supply chain planning but lacks real-time decisioning and closed-loop execution.' },
    { name: 'SAP IBP', weakness: 'Batch-driven, slower time-to-insight. Tightly coupled to SAP ecosystem. Complex implementation.' },
    { name: 'Blue Yonder', weakness: 'Legacy architecture, complex implementations. Strong in WMS/TMS but weaker in decision intelligence.' },
    { name: 'o9 Solutions', weakness: 'Planning-focused, less mature in autonomous execution. Newer platform with less enterprise track record.' },
    { name: 'Custom AI/ML', weakness: 'Hard to scale globally, requires heavy data science investment. No pre-built decision models.' }
  ],
  idealCustomerProfile: 'Large enterprises ($500M+ revenue) with complex, global operations in CPG, manufacturing, retail, pharma, hi-tech, or financial services.',
  valueMetrics: [
    '2-5% reduction in inventory holding costs',
    '10-20% improvement in forecast accuracy',
    '15-30% reduction in excess & obsolete inventory',
    '$5-50M annual working capital improvement',
    '60-80% faster decision cycle times'
  ]
};

function getSellerContext() {
  const sp = SellerProfile;
  const capText = sp.capabilities.map(c => c.domain + ': ' + c.skills.join(', ')).join('\n  ');
  const compText = sp.competitors.map(c => c.name + ' — ' + c.weakness).join('\n  ');
  return '\n--- SELLER CONTEXT (Who We Are) ---\n' +
    'Company: ' + sp.companyName + ' — ' + sp.tagline + '\n' +
    'Description: ' + sp.description + '\n' +
    'Capabilities:\n  ' + capText + '\n' +
    'Key Differentiators:\n  - ' + sp.keyDifferentiators.join('\n  - ') + '\n' +
    'Competitors:\n  ' + compText + '\n' +
    'Value Metrics: ' + sp.valueMetrics.join('; ') + '\n' +
    'ICP: ' + sp.idealCustomerProfile + '\n' +
    '---\n';
}

module.exports = { SellerProfile, getSellerContext };
