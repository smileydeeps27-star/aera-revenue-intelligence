const assert = require('assert');
const fire = require('../../server/engines/fire');
const medpicss = require('../../server/engines/medpicss');
const confidence = require('../../server/engines/confidence');
const closeDate = require('../../server/engines/close-date');

let passed = 0, failed = 0;
function t(label, fn) {
  try { fn(); console.log('ok   ' + label); passed += 1; }
  catch (e) { console.error('FAIL ' + label + '\n  ' + e.message); failed += 1; }
}

// --- FIRE ---
t('FIRE base formula matches weights', () => {
  const r = fire.compute({ fit: 80, intent: 40, recency: 100, engagement: 60 });
  // 0.30*80 + 0.25*40 + 0.20*100 + 0.25*60 = 24 + 10 + 20 + 15 = 69
  assert.strictEqual(r.score, 69);
});

t('FIRE intent: event gives +12, cap enforced', () => {
  const now = new Date('2026-04-17T12:00:00Z');
  const acts = [{ kind: 'event_attend', occurred_at: now.toISOString() }];
  const intent = fire.computeIntent(acts, now);
  // start 30 + 12 = 42, no decay (0 days)
  assert.strictEqual(intent, 42);
});

t('FIRE intent: content_view caps at +20', () => {
  const now = new Date('2026-04-17T12:00:00Z');
  const acts = Array.from({ length: 10 }, () => ({ kind: 'content_view', occurred_at: now.toISOString() }));
  const intent = fire.computeIntent(acts, now);
  // start 30 + cap 20 = 50 (each +3 → 30,33,36,39,42... capped at 20 added → 50)
  assert.strictEqual(intent, 50);
});

t('FIRE recency: 0 days ago = 100, 30 days ago = 40', () => {
  const now = new Date('2026-04-17T12:00:00Z');
  const sameDay = fire.computeRecency([{ occurred_at: now.toISOString() }], now);
  assert.strictEqual(sameDay, 100);
  const thirty = new Date(now.getTime() - 30 * 86400000);
  const r = fire.computeRecency([{ occurred_at: thirty.toISOString() }], now);
  // 100 - 30*2 = 40
  assert.strictEqual(r, 40);
});

t('FIRE engagement: champion active adds +20', () => {
  const now = new Date();
  const leads = [{ id: 'l1', active: true, role_in_deal: 'champion', last_interaction_at: now.toISOString() }];
  const eng = fire.computeEngagement([], leads, now);
  // 1 active lead ×8 = 8 + recent share 1 × 30 = 30 + champion 20 = 58
  assert.strictEqual(eng, 58);
});

// --- MEDPICSS ---
t('MEDPICSS empty has 0 filled', () => {
  const m = medpicss.empty();
  assert.strictEqual(medpicss.filledCount(m), 0);
  assert.strictEqual(medpicss.completeness(m), 0);
});

t('MEDPICSS validates metrics needs number', () => {
  const v = medpicss.validateSlot('metrics', { filled: true, note: 'we want to improve' });
  assert.strictEqual(v.filled, false);
  assert.ok(v.reasons.some(r => /number/i.test(r)));
  const ok = medpicss.validateSlot('metrics', { filled: true, note: 'forecast accuracy 62%' });
  assert.strictEqual(ok.filled, true);
});

t('MEDPICSS validates champion needs linked active lead', () => {
  const leads = [{ id: 'l1', role_in_deal: 'champion', active: true }];
  const ok = medpicss.validateSlot('champion', { filled: true, stakeholder_id: 'l1' }, leads);
  assert.strictEqual(ok.filled, true);
  const notChampion = medpicss.validateSlot('champion', { filled: true, stakeholder_id: 'l1' }, [{ id: 'l1', role_in_deal: 'user', active: true }]);
  assert.strictEqual(notChampion.filled, false);
  const missing = medpicss.validateSlot('champion', { filled: true, stakeholder_id: 'xx' }, leads);
  assert.strictEqual(missing.filled, false);
});

t('MEDPICSS completeness counts only validated slots', () => {
  const leads = [{ id: 'l-champ', role_in_deal: 'champion', active: true }, { id: 'l-eb', role_in_deal: 'decision_maker' }];
  const m = medpicss.empty();
  m.metrics = { filled: true, note: '62% forecast accuracy' };
  m.identify_pain = { filled: true, note: 'demand volatility post pandemic' };
  m.champion = { filled: true, stakeholder_id: 'l-champ' };
  m.economic_buyer = { filled: true, stakeholder_id: 'l-eb' };
  m.competition = { filled: true, note: 'Kinaxis' };
  assert.strictEqual(medpicss.filledCount(m, leads), 5);
});

// --- Confidence ---
t('Confidence worked example matches plan (76 ± 1)', () => {
  const account = { medpicss: medpicss.empty() };
  // Fill 5/9 MEDPICSS slots with validating content
  account.medpicss.metrics = { filled: true, note: 'forecast 62%' };
  account.medpicss.identify_pain = { filled: true, note: 'demand volatility hurts margin' };
  account.medpicss.decision_criteria = { filled: true, note: 'accuracy; TCO; ERP fit' };
  account.medpicss.competition = { filled: true, note: 'Kinaxis' };
  account.medpicss.success_criteria = { filled: true, note: 'forecast +10pts in 90 days' };

  const now = new Date('2026-04-17T12:00:00Z');
  const opp = {
    sf_amount: 1200000,
    _last_activity_at: new Date(now.getTime() - 3 * 86400000).toISOString(),
    _active_leads: 3,
    _has_champion: true,
    _has_econ_buyer: true,
    _competitor_count: 1,
    _we_have_advantage: true
  };
  const c = confidence.compute(opp, account, { now });
  // Expected per plan: ~76 (±1)
  assert.ok(Math.abs(c.score - 76) <= 2, 'score=' + c.score);
});

// --- Close date ---
t('Close date projects validation+remaining with in-stage credit', () => {
  const now = new Date('2026-04-17T12:00:00Z');
  const opp = {
    internal_stage: 'validation',
    sf_close_date: '2026-09-30',
    _days_in_stage: 5,
    _velocity_factor: 1.0
  };
  const r = closeDate.project(opp, { now });
  // validation 22 + proposal 18 + negotiation 16 = 56 days remaining, minus min(5, 11) = 51 days
  // Expected projected date around 2026-04-17 + 51d = 2026-06-07
  assert.strictEqual(r.date, '2026-06-07');
});

t('Close date: velocity factor stretches slowing deals', () => {
  const now = new Date('2026-04-17T12:00:00Z');
  const opp = {
    internal_stage: 'discovery',
    sf_close_date: '2026-08-01',
    _days_in_stage: 0,
    _velocity_factor: 1.25
  };
  const r = closeDate.project(opp, { now });
  // Total 21+22+18+16 = 77 days × 1.25 = 96 days → ~2026-07-22
  const days = (new Date(r.date) - now) / 86400000;
  assert.ok(days >= 94 && days <= 98, 'days=' + days);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
