const gemini = require('../gemini');
const { SellerProfile, getSellerContext } = require('../seller-profile');
const sse = require('../sse');

async function runPlan({ companyName, industry, revenue }, { onProgress } = {}) {
  const sellerCtx = getSellerContext();
  const sp = SellerProfile;
  const progress = (current, total, phase) => onProgress && onProgress({ current, total, phase });

  const plan = {
    companyName,
    generatedAt: new Date().toISOString(),
    overview: null, news: [], whiteSpace: [],
    competitive: null, stakeholders: [], valueHypothesis: null,
    risks: [], plan: null
  };

  let ctx = 'Company: ' + companyName + '\n';
  if (industry) ctx += 'Industry: ' + industry + '\n';
  if (revenue) ctx += 'Approximate Revenue: ' + revenue + '\n';

  // --- Call 1: Overview + News ---
  progress(0, 4, 'Researching ' + companyName + ' overview & news…');
  const overviewPrompt = 'You are a world-class B2B enterprise sales strategist at ' + sp.companyName + ' — the Decision Intelligence company. You have deep knowledge of every major company. Return ONLY valid JSON.' + sellerCtx;
  const overviewMsg = 'Build a deeply researched account profile for:\n\n' + ctx +
    '\nReturn JSON:\n{' +
    '"overview":{"industry":"...","hqLocation":"...","annualRevenue":"...","employeeCount":"...","keySegments":["..."],"growthTrajectory":"3-4 detailed sentences","competitiveLandscape":"3-4 detailed sentences naming top 3-4 competitors","implicationForSeller":"2-3 sentences referencing specific Aera Skills by name"},' +
    '"news":[{"date":"Mon YYYY","headline":"specific headline","relevanceTag":"High — reason","source":"Publication"}]}';
  try {
    const r = await gemini.call(overviewPrompt, overviewMsg, 8192);
    const p = gemini.parseJSON(r);
    if (p) { plan.overview = p.overview || null; plan.news = p.news || []; }
  } catch (e) { plan._errors = (plan._errors || []); plan._errors.push({ phase: 'overview', message: e.message }); }

  // --- Call 2: White Space + Competitive ---
  progress(1, 4, 'Identifying white space & competitive landscape…');
  const wsPrompt = 'You are a world-class B2B sales strategist at ' + sp.companyName + '. Identify white space and build a competitive battle card. Return ONLY valid JSON.' + sellerCtx;
  const wsMsg = 'Build white space and competitive analysis for:\n\n' + ctx +
    (plan.overview ? 'Growth: ' + (plan.overview.growthTrajectory || '') + '\nMarket: ' + (plan.overview.competitiveLandscape || '') + '\n' : '') +
    'Return JSON:\n{' +
    '"whiteSpace":[{"area":"...","problem":"3-4 sentences","aeraPlay":"2-3 sentences referencing specific Aera Skills","value":"$X-Y M/yr","urgency":"high|medium|low"}],' +
    '"competitive":{"positioning":"3-4 sentences","landscape":[{"competitor":"Name","weakness":"2-3 sentences","aeraAdvantage":"2-3 sentences"}]}}\n' +
    'Generate 5-7 white space items and 4-6 competitors.';
  try {
    const r = await gemini.call(wsPrompt, wsMsg, 8192);
    const p = gemini.parseJSON(r);
    if (p) { plan.whiteSpace = p.whiteSpace || []; plan.competitive = p.competitive || null; }
  } catch (e) { plan._errors = (plan._errors || []); plan._errors.push({ phase: 'whitespace', message: e.message }); }

  // --- Call 3: Stakeholders + Value + Risks ---
  progress(2, 4, 'Mapping stakeholders, value & risks…');
  const stPrompt = 'You are a world-class B2B sales strategist at ' + sp.companyName + '. Map the buying committee, build a value hypothesis with dollar estimates, and identify deal risks. Return ONLY valid JSON.' + sellerCtx;
  const stMsg = 'Build stakeholder map, value hypothesis, and risks for:\n\n' + ctx +
    (plan.whiteSpace.length ? 'Top Opportunities:\n' + plan.whiteSpace.slice(0, 3).map(w => '- ' + w.area).join('\n') + '\n' : '') +
    'Return JSON:\n{' +
    '"stakeholders":[{"name":"Real executive name if known","title":"Title","roleInDeal":"Executive Sponsor|Champion|Evaluator|Influencer|Blocker","relevance":"High|Medium|Low","notes":"2-3 sentences","linkedin":"https://linkedin.com/in/slug"}],' +
    '"valueHypothesis":{"metrics":[{"metric":"improvement","impact":"$ value with math","confidence":"High|Medium|Low"}],"executivePitch":"3-4 powerful sentences for a CEO/COO email"},' +
    '"risks":[{"risk":"specific deal risk","mitigation":"2-3 sentences"}]}\n' +
    'Generate 5-7 stakeholders, 4-6 metrics, 4-6 risks.';
  try {
    const r = await gemini.call(stPrompt, stMsg, 8192);
    const p = gemini.parseJSON(r);
    if (p) { plan.stakeholders = p.stakeholders || []; plan.valueHypothesis = p.valueHypothesis || null; plan.risks = p.risks || []; }
  } catch (e) { plan._errors = (plan._errors || []); plan._errors.push({ phase: 'stakeholders', message: e.message }); }

  // --- Call 4: 10-30-60 Day Plan ---
  progress(3, 4, 'Building 10-30-60 day engagement plan…');
  const plPrompt = 'You are a world-class B2B sales strategist at ' + sp.companyName + '. Create a detailed, ACTIONABLE 10-30-60 day engagement plan. Every action must reference specific stakeholders or Aera Skills by name. Return ONLY valid JSON.' + sellerCtx;
  const plMsg = 'Create a 10-30-60 day plan to penetrate:\n\n' + ctx +
    (plan.stakeholders.length ? 'Stakeholders:\n' + plan.stakeholders.slice(0, 5).map(s => '- ' + s.name + ' (' + s.title + ')').join('\n') + '\n' : '') +
    'Return JSON:\n{' +
    '"plan":{"day10":{"title":"Research & Initial Outreach","actions":["6-8 detailed actions"]},"day30":{"title":"Engage & Qualify","actions":["6-8 actions"]},"day60":{"title":"Advance & Demonstrate","actions":["6-8 actions"]}}}';
  try {
    const r = await gemini.call(plPrompt, plMsg, 8192);
    const p = gemini.parseJSON(r);
    if (p && p.plan) plan.plan = p.plan;
  } catch (e) { plan._errors = (plan._errors || []); plan._errors.push({ phase: 'plan', message: e.message }); }

  if (!plan.plan) {
    plan.plan = {
      day10: { title: 'Research & Initial Outreach', actions: ['Finalize account plan', 'Map warm intros', 'Send personalized outreach to 2-3 execs', 'Share relevant Aera content'] },
      day30: { title: 'Engage & Qualify', actions: ['Secure discovery meeting', 'Present tailored value narrative', 'Validate stakeholder map', 'Identify pilot use case'] },
      day60: { title: 'Advance & Demonstrate', actions: ['Executive briefing', 'Propose scoped PoV', 'Align on success criteria', 'Develop mutual action plan'] }
    };
  }

  progress(4, 4, 'Done');
  return plan;
}

async function streamPlan(req, res, payload) {
  sse.open(res);
  try {
    const plan = await runPlan(payload, {
      onProgress: (p) => sse.send(res, 'progress', p)
    });
    sse.send(res, 'done', { plan });
  } catch (e) {
    sse.send(res, 'error', { message: e.message });
  } finally {
    sse.close(res);
  }
}

module.exports = { runPlan, streamPlan };
