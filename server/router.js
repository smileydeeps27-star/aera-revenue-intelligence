const accountsRoutes = require('./routes/accounts.routes');
const oppsRoutes = require('./routes/opps.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const activitiesRoutes = require('./routes/activities.routes');
const medpicssRoutes = require('./routes/medpicss.routes');
const medpicssSuggest = require('./ai/agents/medpicss-suggest');
const discoverAgent = require('./ai/agents/discover');
const leadsRoutes = require('./routes/leads.routes');
const marketIntelRoutes = require('./routes/market-intel.routes');
const regionsRoutes = require('./routes/regions.routes');
const assignRoutes = require('./routes/assign.routes');
const winPlanAgent = require('./ai/agents/win-plan');
const confidenceNarrativeAgent = require('./ai/agents/confidence-narrative');
const analyzeOppAgent = require('./ai/agents/analyze-opp');
const executiveBriefingAgent = require('./ai/agents/executive-briefing');
const meetingNotesRoutes = require('./routes/meeting-notes.routes');
const usersRoutes = require('./routes/users.routes');
const store = require('./store');
const gemini = require('./ai/gemini');
const accountPlanAgent = require('./ai/agents/account-plan');
const fallbackPlan = require('./ai/agents/fallback-plan');
const sfdc = require('./sfdc').getAdapter();

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function parseUrl(u) {
  const [pathname, qs] = u.split('?');
  const query = {};
  if (qs) {
    for (const kv of qs.split('&')) {
      const [k, v] = kv.split('=');
      query[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
    }
  }
  return { pathname, query };
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handle(req, res) {
  const { pathname, query } = parseUrl(req.url);
  const method = req.method;

  try {
    // Gemini proxy (legacy-compatible)
    if (method === 'POST' && pathname === '/api/ai') {
      const body = await readBody(req);
      const parsed = body ? JSON.parse(body) : {};
      try {
        const text = await gemini.call(parsed.system || '', (parsed.messages && parsed.messages[0] && parsed.messages[0].content) || '', parsed.max_tokens || 4096);
        return json(res, 200, { text });
      } catch (e) {
        return json(res, e.statusCode || 500, { error: e.message });
      }
    }

    if (method === 'GET' && pathname === '/api/key-status') {
      return json(res, 200, { configured: gemini.keyConfigured() });
    }

    // Account routes
    if (method === 'GET' && pathname === '/api/accounts') {
      return json(res, 200, await accountsRoutes.list(req, res, { query }));
    }
    const acctMatch = pathname.match(/^\/api\/accounts\/([^/]+)$/);
    if (method === 'GET' && acctMatch) {
      return json(res, res.statusCode || 200, await accountsRoutes.get(req, res, { params: { id: acctMatch[1] } }));
    }
    if (method === 'POST' && pathname === '/api/accounts') {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 201, await accountsRoutes.create(req, res, { body }));
    }

    // Regions + territory planning
    if (method === 'GET' && pathname === '/api/regions') {
      return json(res, 200, await regionsRoutes.list());
    }
    if (method === 'GET' && pathname === '/api/regions/rollup') {
      return json(res, 200, await regionsRoutes.rollup());
    }
    const regionOneMatch = pathname.match(/^\/api\/regions\/([^/]+)$/);
    if (method === 'PATCH' && regionOneMatch) {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 200, await regionsRoutes.update(req, res, { params: { id: regionOneMatch[1] }, body }));
    }

    // Account assignment
    const assignMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/assign-cp$/);
    if (method === 'PATCH' && assignMatch) {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 200, await assignRoutes.assignCp(req, res, { params: { id: assignMatch[1] }, body }));
    }

    // Users
    if (method === 'GET' && pathname === '/api/users') {
      return json(res, 200, await usersRoutes.list(req, res, { query }));
    }

    // Leads
    if (method === 'GET' && pathname === '/api/leads') {
      return json(res, 200, await leadsRoutes.list(req, res, { query }));
    }
    if (method === 'POST' && pathname === '/api/leads') {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 201, await leadsRoutes.createRoute(req, res, { body }));
    }
    const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);
    if (method === 'PATCH' && leadMatch) {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 200, await leadsRoutes.update(req, res, { params: { id: leadMatch[1] }, body }));
    }
    const jcMatch = pathname.match(/^\/api\/leads\/([^/]+)\/job-change$/);
    if (method === 'PATCH' && jcMatch) {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 200, await leadsRoutes.jobChange(req, res, { params: { id: jcMatch[1] }, body }));
    }

    // Meeting notes
    const notesListMatch = pathname.match(/^\/api\/opps\/([^/]+)\/notes$/);
    if (method === 'GET' && notesListMatch) {
      return json(res, 200, await meetingNotesRoutes.list(req, res, { query: { opportunity_id: notesListMatch[1] } }));
    }
    if (method === 'POST' && notesListMatch) {
      const body = JSON.parse((await readBody(req)) || '{}');
      body.opportunity_id = notesListMatch[1];
      const sfOpp = await sfdc.getOpp(notesListMatch[1]);
      if (!sfOpp) return json(res, 404, { error: 'Opportunity not found' });
      body.account_id = sfOpp.sf_account_id;
      return json(res, 201, await meetingNotesRoutes.create(req, res, { body }));
    }
    const noteOneMatch = pathname.match(/^\/api\/opps\/([^/]+)\/notes\/([^/]+)$/);
    if (method === 'DELETE' && noteOneMatch) {
      return json(res, 200, await meetingNotesRoutes.remove(req, res, { params: { id: noteOneMatch[2] } }));
    }
    if (method === 'PATCH' && noteOneMatch) {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 200, await meetingNotesRoutes.update(req, res, { params: { id: noteOneMatch[2] }, body }));
    }

    // Executive briefing (A12) — scoped by role + user + selected quarter keys
    const briefingMatch = pathname.match(/^\/api\/agents\/executive-briefing\/([^/]+)$/);
    if (method === 'POST' && briefingMatch) {
      const role = briefingMatch[1];
      const body = JSON.parse((await readBody(req)) || '{}');
      const user = body.user_id ? await usersRoutes.getById(body.user_id) : await usersRoutes.defaultUserFor(role);
      const scope = await usersRoutes.scopeFor(role, user ? user.id : null);
      const allSfOpps = await sfdc.listOpps();
      const allOpps = await Promise.all(allSfOpps.map(oppsRoutes.composeOpp));
      const opps = allOpps.filter(o => scope.accountIds.has(o.sf_account_id));
      const allActivities = await store.readAll('activities');
      const activities = allActivities.filter(a => scope.accountIds.has(a.account_id));
      const selectedQuarters = Array.isArray(body.selected_quarters) ? body.selected_quarters : null;
      const briefing = await executiveBriefingAgent.generate({ role, user, opps, activities, selectedQuarters, allOpps });
      return json(res, 200, briefing);
    }

    // Analyze opp (A11)
    const analyzeMatch = pathname.match(/^\/api\/agents\/analyze-opp\/([^/]+)$/);
    if (method === 'POST' && analyzeMatch) {
      const oppId = analyzeMatch[1];
      const sfOpp = await sfdc.getOpp(oppId);
      if (!sfOpp) return json(res, 404, { error: 'Opportunity not found' });

      const notes = await meetingNotesRoutes.list(null, { statusCode: 200 }, { query: { opportunity_id: oppId } });
      // Temporarily clear any prior overrides so composeOpp gives us the formula-driven baseline
      const enrichBefore = (await store.readOne('opp_enrichment', oppId, 'sf_id')) || { sf_id: oppId };
      const enrichForBase = { ...enrichBefore, confidence_override: null, projected_close_override: null };
      await store.upsert('opp_enrichment', enrichForBase, 'sf_id');
      const opp = await oppsRoutes.composeOpp(sfOpp);
      const account = await accountsRoutes.compose(await sfdc.getAccount(sfOpp.sf_account_id));
      const allSfOpps = await sfdc.listOpps();
      const allOpps = await Promise.all(allSfOpps.map(oppsRoutes.composeOpp));
      const allAccountsRows = await sfdc.listAccounts();
      const accountsById = new Map(allAccountsRows.map(a => [a.sf_id, a]));
      // Put back prior overrides before analysis stored new ones
      await store.upsert('opp_enrichment', enrichBefore, 'sf_id');

      const analysis = await analyzeOppAgent.analyze({
        opp, account, notes, allOpps, accountsById,
        baseConfidence: opp.confidence, basProjectedClose: opp.projected_close
      });

      const enrich = (await store.readOne('opp_enrichment', oppId, 'sf_id')) || { sf_id: oppId };
      enrich.analysis = analysis;
      enrich.confidence_override = analysis.confidence_override;
      enrich.projected_close_override = analysis.projected_close_override;
      enrich.analysis_updated_at = analysis.generated_at;
      await store.upsert('opp_enrichment', enrich, 'sf_id');

      return json(res, 200, analysis);
    }

    // Win Plan (A8)
    const wpGenMatch = pathname.match(/^\/api\/agents\/win-plan\/([^/]+)$/);
    if (method === 'POST' && wpGenMatch) {
      const oppId = wpGenMatch[1];
      const sfOpp = await sfdc.getOpp(oppId);
      if (!sfOpp) return json(res, 404, { error: 'Opportunity not found' });
      const opp = await oppsRoutes.composeOpp(sfOpp);
      const account = await accountsRoutes.compose(await sfdc.getAccount(sfOpp.sf_account_id));
      const plan = account.account_plan_id ? await store.readOne('account_plans', account.account_plan_id, 'id') : null;
      const wp = await winPlanAgent.generate({ opp, account, plan });
      wp.id = opp.win_plan_id || ('wp-' + Date.now().toString(36));
      wp.opportunity_id = oppId;
      wp.updated_at = new Date().toISOString();
      await store.upsert('win_plans', wp, 'id');
      if (!opp.win_plan_id) {
        const enrich = (await store.readOne('opp_enrichment', oppId, 'sf_id')) || { sf_id: oppId };
        enrich.win_plan_id = wp.id;
        await store.upsert('opp_enrichment', enrich, 'sf_id');
      }
      return json(res, 200, wp);
    }

    // Confidence narrative (A9)
    const cnMatch = pathname.match(/^\/api\/agents\/confidence-narrative\/([^/]+)$/);
    if (method === 'POST' && cnMatch) {
      const oppId = cnMatch[1];
      const sfOpp = await sfdc.getOpp(oppId);
      if (!sfOpp) return json(res, 404, { error: 'Opportunity not found' });
      const opp = await oppsRoutes.composeOpp(sfOpp);
      const account = await accountsRoutes.compose(await sfdc.getAccount(sfOpp.sf_account_id));
      const r = await confidenceNarrativeAgent.narrate({ opp, account });
      const enrich = (await store.readOne('opp_enrichment', oppId, 'sf_id')) || { sf_id: oppId };
      enrich.confidence_narrative = r.narrative;
      enrich.confidence_narrative_updated_at = new Date().toISOString();
      await store.upsert('opp_enrichment', enrich, 'sf_id');
      return json(res, 200, r);
    }

    // Market Intel — discover agent
    if (method === 'POST' && pathname === '/api/agents/discover') {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 200, await discoverAgent.discover(body));
    }
    if (method === 'POST' && pathname === '/api/market-intel/add') {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 201, await marketIntelRoutes.addToPipeline(req, res, { body }));
    }

    // Activities
    if (method === 'GET' && pathname === '/api/activities') {
      return json(res, 200, await activitiesRoutes.list(req, res, { query }));
    }
    if (method === 'POST' && pathname === '/api/activities') {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 201, await activitiesRoutes.create(req, res, { body }));
    }

    // MEDPICSS patch
    const medpMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/medpicss$/);
    if (method === 'PATCH' && medpMatch) {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 200, await medpicssRoutes.patchSlot(req, res, { params: { id: medpMatch[1] }, body }));
    }

    // MEDPICSS suggest (A6)
    const medpSuggestMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/medpicss\/suggest$/);
    if (method === 'POST' && medpSuggestMatch) {
      const sfId = medpSuggestMatch[1];
      const sf = await sfdc.getAccount(sfId);
      if (!sf) return json(res, 404, { error: 'Account not found' });
      const account = await accountsRoutes.compose(sf);
      let plan = null;
      if (account.account_plan_id) plan = await store.readOne('account_plans', account.account_plan_id, 'id');
      const activities = (await store.readAll('activities')).filter(a => a.account_id === sfId);
      const leads = (await store.readAll('leads')).filter(l => l.sf_account_id === sfId);
      return json(res, 200, await medpicssSuggest.suggest({ account, plan, activities, leads }));
    }

    // Opps
    if (method === 'GET' && pathname === '/api/opps') {
      return json(res, 200, await oppsRoutes.list(req, res, { query }));
    }
    const oppMatch = pathname.match(/^\/api\/opps\/([^/]+)$/);
    if (method === 'GET' && oppMatch) {
      return json(res, res.statusCode || 200, await oppsRoutes.get(req, res, { params: { id: oppMatch[1] } }));
    }
    const stageMatch = pathname.match(/^\/api\/opps\/([^/]+)\/stage$/);
    if (method === 'PATCH' && stageMatch) {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 200, await oppsRoutes.updateStage(req, res, { params: { id: stageMatch[1] }, body }));
    }
    if (method === 'POST' && pathname === '/api/opps') {
      const body = JSON.parse((await readBody(req)) || '{}');
      return json(res, 201, await oppsRoutes.create(req, res, { body }));
    }

    // Dashboards
    const dashMatch = pathname.match(/^\/api\/dashboard\/([^/]+)$/);
    if (method === 'GET' && dashMatch) {
      return json(res, 200, await dashboardRoutes.get(req, res, { params: { role: dashMatch[1] }, query }));
    }

    // Win plan store
    const wpMatch = pathname.match(/^\/api\/win_plans\/([^/]+)$/);
    if (method === 'GET' && wpMatch) {
      const wp = await store.readOne('win_plans', wpMatch[1], 'id');
      return wp ? json(res, 200, wp) : json(res, 404, { error: 'Not found' });
    }
    if (method === 'PUT' && wpMatch) {
      const body = JSON.parse((await readBody(req)) || '{}');
      body.id = wpMatch[1];
      await store.upsert('win_plans', body, 'id');
      return json(res, 200, body);
    }

    // Account plan store
    const apMatch = pathname.match(/^\/api\/account_plans\/([^/]+)$/);
    if (method === 'GET' && apMatch) {
      const p = await store.readOne('account_plans', apMatch[1], 'id');
      return p ? json(res, 200, p) : json(res, 404, { error: 'Not found' });
    }

    // Account plan agent (SSE streaming)
    if (method === 'POST' && pathname === '/api/agents/account-plan') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.company_name) return json(res, 400, { error: 'company_name required' });

      // Streaming response
      const sse = require('./ai/sse');
      sse.open(res);
      try {
        let plan;
        if (gemini.keyConfigured() && !body.demo) {
          plan = await accountPlanAgent.runPlan({
            companyName: body.company_name,
            industry: body.industry,
            revenue: body.revenue
          }, { onProgress: p => sse.send(res, 'progress', p) });
        } else {
          // Demo path — simulate progress for same UX
          for (let i = 0; i < 4; i++) {
            sse.send(res, 'progress', { current: i, total: 4, phase: demoPhaseLabel(i, body.company_name) });
            await new Promise(r => setTimeout(r, 350));
          }
          plan = fallbackPlan.fallbackPlan({ companyName: body.company_name, industry: body.industry, revenue: body.revenue });
          sse.send(res, 'progress', { current: 4, total: 4, phase: 'Done' });
        }

        // Persist the plan + link to account
        const planId = 'ap-' + Date.now().toString(36);
        plan.id = planId;
        plan.sf_account_id = body.sf_account_id || null;
        await store.upsert('account_plans', plan, 'id');
        if (body.sf_account_id) await accountsRoutes.linkPlan(body.sf_account_id, planId);

        sse.send(res, 'done', { plan });
      } catch (e) {
        sse.send(res, 'error', { message: e.message });
      } finally {
        sse.close(res);
      }
      return;
    }

    // Generic store CRUD
    const collMatch = pathname.match(/^\/api\/store\/([^/]+)(?:\/([^/]+))?$/);
    if (collMatch) {
      const [, collection, id] = collMatch;
      if (method === 'GET' && !id) return json(res, 200, await store.readAll(collection));
      if (method === 'GET' && id) {
        const row = await store.readOne(collection, id, 'id');
        return row ? json(res, 200, row) : json(res, 404, { error: 'Not found' });
      }
      if (method === 'PUT' && id) {
        const body = JSON.parse((await readBody(req)) || '{}');
        body.id = id;
        await store.upsert(collection, body, 'id');
        return json(res, 200, body);
      }
      if (method === 'DELETE' && id) {
        return json(res, 200, await store.remove(collection, id, 'id'));
      }
    }

    // Admin seed
    if (method === 'POST' && pathname === '/api/admin/seed') {
      if (req.headers['x-ri-admin'] !== '1') return json(res, 403, { error: 'Forbidden' });
      const loadSeed = require('../seed/load-seed');
      await loadSeed();
      return json(res, 200, { loaded: true });
    }

    // Not an API — hand off to static handler
    return null;
  } catch (e) {
    console.error('[router] error', e);
    return json(res, 500, { error: e.message || 'Server error' });
  }
}

function demoPhaseLabel(i, name) {
  return [
    'Researching ' + name + ' overview & news…',
    'Identifying white space & competitive landscape…',
    'Mapping stakeholders, value & risks…',
    'Building 10-30-60 day engagement plan…'
  ][i];
}

module.exports = { handle };
