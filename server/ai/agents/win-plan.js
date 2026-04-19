const gemini = require('../gemini');
const { SellerProfile, getSellerContext } = require('../seller-profile');

const STAGES = ['discovery', 'validation', 'proposal', 'negotiation'];

function fallback({ opp, account, plan }) {
  const winPlayKey = (plan && plan.whiteSpace && plan.whiteSpace[0] && plan.whiteSpace[0].area) || 'Decision Intelligence';
  return {
    next_best_action: 'Book econ-buyer meeting this week to validate success criteria',
    risks: [
      { text: 'Incumbent planning tool has multi-year commitment', severity: 'med' },
      { text: 'IT prioritization may queue behind ERP program', severity: 'med' }
    ],
    stage_playbooks: {
      discovery: {
        exit_criteria: ['Pain confirmed with quantified baseline', 'Champion identified + engaged', 'Initial competitive picture'],
        default_tasks: [
          'Run discovery workshop with supply-chain ops',
          'Quantify baseline for ' + winPlayKey + ' pain'
        ]
      },
      validation: {
        exit_criteria: ['Success criteria signed off', 'Economic buyer meeting held', 'Technical fit validated'],
        default_tasks: ['Co-author success criteria document with champion', 'Present tailored Aera Skills demo']
      },
      proposal: {
        exit_criteria: ['Commercials reviewed', 'ROI model agreed'],
        default_tasks: ['Deliver ROI readout', 'Circulate proposal to buying committee']
      },
      negotiation: {
        exit_criteria: ['Paper process mapped', 'Legal redlines resolved'],
        default_tasks: ['Align on legal/security review', 'Confirm procurement path']
      }
    },
    action_items: [
      { id: 'ai-d1', stage: 'discovery', text: 'Confirm pain and quantify baseline metrics', status: 'open' },
      { id: 'ai-d2', stage: 'discovery', text: 'Map decision process with champion', status: 'open' },
      { id: 'ai-d3', stage: 'discovery', text: 'Share ' + winPlayKey + ' reference story', status: 'open' },
      { id: 'ai-v1', stage: 'validation', text: 'Secure economic buyer intro via champion', status: 'open' },
      { id: 'ai-v2', stage: 'validation', text: 'Run tailored Aera Skills demo on their data', status: 'open' },
      { id: 'ai-p1', stage: 'proposal', text: 'Deliver quantified value model readout', status: 'open' },
      { id: 'ai-p2', stage: 'proposal', text: 'Align on success criteria with champion', status: 'open' },
      { id: 'ai-n1', stage: 'negotiation', text: 'Map paper process, confirm legal path', status: 'open' }
    ]
  };
}

async function generate({ opp, account, plan }) {
  if (!gemini.keyConfigured()) return { ...fallback({ opp, account, plan }), _demo: true };

  const seller = getSellerContext();
  const system = 'You are a world-class B2B sales strategist at ' + SellerProfile.companyName + '. Produce a stage-aware Win Plan for a live opportunity. Every action references specific stakeholders, Aera Skills, or concrete outcomes. Return ONLY valid JSON.' + seller;
  const stkText = (opp.stakeholders || []).slice(0, 6).map(s => s.name + ' (' + s.title + ', ' + s.role + ')').join('; ');
  const msg = 'Opportunity: ' + opp.sf_name + ' — ' + (opp.sf_amount ? '$' + opp.sf_amount : '') + '\n' +
    'Account: ' + account.sf_name + ' (' + account.sf_industry + ')\n' +
    'Current stage: ' + opp.internal_stage + '\n' +
    'Stakeholders: ' + (stkText || 'none mapped yet') + '\n' +
    (plan && plan.whiteSpace ? 'Top plays: ' + plan.whiteSpace.slice(0, 3).map(w => w.area).join(', ') + '\n' : '') +
    (plan && plan.valueHypothesis && plan.valueHypothesis.executivePitch ? 'Pitch: ' + plan.valueHypothesis.executivePitch + '\n' : '') +
    '\nReturn JSON:\n{' +
    '"next_best_action":"1 sentence, time-bound",' +
    '"risks":[{"text":"deal risk","severity":"low|med|high"}],' +
    '"stage_playbooks":{"discovery":{"exit_criteria":["..."],"default_tasks":["..."]},"validation":{...},"proposal":{...},"negotiation":{...}},' +
    '"action_items":[{"id":"ai-xxx","stage":"discovery|validation|proposal|negotiation","text":"actionable, names a stakeholder when possible","status":"open"}]}\n' +
    'Generate 2-3 action_items per stage. Exit criteria: 2-3 per stage.';

  try {
    const raw = await gemini.call(system, msg, 4096);
    const parsed = gemini.parseJSON(raw);
    if (parsed && parsed.action_items) return parsed;
  } catch (e) { /* fall through */ }
  return { ...fallback({ opp, account, plan }), _demo: true };
}

module.exports = { generate, STAGES };
