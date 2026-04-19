const SLOTS = ['metrics', 'economic_buyer', 'decision_criteria', 'decision_process', 'paper_process', 'identify_pain', 'champion', 'competition', 'success_criteria'];

const LABELS = {
  metrics: 'Metrics',
  economic_buyer: 'Economic Buyer',
  decision_criteria: 'Decision Criteria',
  decision_process: 'Decision Process',
  paper_process: 'Paper Process',
  identify_pain: 'Identify Pain',
  champion: 'Champion',
  competition: 'Competition',
  success_criteria: 'Success Criteria'
};

const DESCRIPTIONS = {
  metrics: 'Quantified baseline number with unit (e.g. "forecast accuracy 62%")',
  economic_buyer: 'Linked lead with role_in_deal = decision_maker',
  decision_criteria: 'Note listing ≥ 2 criteria',
  decision_process: 'Note describing the decision workflow',
  paper_process: 'Note on procurement / legal process',
  identify_pain: 'Note describing the core pain',
  champion: 'Linked lead with role_in_deal = champion and active',
  competition: 'Note naming ≥ 1 competitor',
  success_criteria: 'Note with measurable target'
};

function empty() {
  const o = {};
  for (const s of SLOTS) o[s] = { filled: false };
  return o;
}

/**
 * Validate that a slot is truly "filled" per the per-slot rules.
 * Returns { filled: bool, reasons: string[] } — reasons explain why it's not filled if false.
 */
function validateSlot(slot, value, leads = []) {
  if (!value || value.filled !== true) return { filled: false, reasons: ['Not marked filled'] };
  const reasons = [];

  switch (slot) {
    case 'economic_buyer': {
      const lead = leads.find(l => l.id === value.stakeholder_id);
      if (!lead) reasons.push('Needs a linked lead');
      else if (lead.role_in_deal !== 'decision_maker') reasons.push('Linked lead must be decision_maker');
      break;
    }
    case 'champion': {
      const lead = leads.find(l => l.id === value.stakeholder_id);
      if (!lead) reasons.push('Needs a linked lead');
      else if (lead.role_in_deal !== 'champion') reasons.push('Linked lead must be champion');
      else if (lead.active === false) reasons.push('Champion must be active');
      break;
    }
    case 'metrics': {
      const n = (value.note || '').trim();
      if (n.length < 6) reasons.push('Note must describe baseline + unit');
      else if (!/\d/.test(n)) reasons.push('Include a number');
      break;
    }
    case 'competition': {
      const n = (value.note || '').trim();
      if (n.length < 3) reasons.push('Name at least one competitor');
      break;
    }
    case 'decision_criteria': {
      const n = (value.note || '').trim();
      if (n.length < 8) reasons.push('List ≥ 2 criteria');
      break;
    }
    case 'success_criteria': {
      const n = (value.note || '').trim();
      if (n.length < 6) reasons.push('Include a measurable target');
      else if (!/\d|%/.test(n)) reasons.push('Quantify the target');
      break;
    }
    default: {
      const n = (value.note || '').trim();
      if (n.length < 4) reasons.push('Note required');
    }
  }

  return { filled: reasons.length === 0, reasons };
}

function completeness(m, leads = []) {
  if (!m) return 0;
  let n = 0;
  for (const s of SLOTS) {
    const v = m[s];
    if (v && validateSlot(s, v, leads).filled) n += 1;
  }
  return n / SLOTS.length;
}

function filledCount(m, leads = []) {
  return Math.round(completeness(m, leads) * SLOTS.length);
}

module.exports = { SLOTS, LABELS, DESCRIPTIONS, empty, completeness, filledCount, validateSlot };
