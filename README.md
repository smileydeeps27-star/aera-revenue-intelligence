# Revenue Intelligence Platform

End-to-end Revenue Intelligence tool for Aera Technology: Marketing Intelligence → Account Plans → Warm-up (FIRE + MEDPICSS) → Opportunities → Win Plans → Confidence + Projected Close → Role-scoped Dashboards. Backed by a mocked Salesforce adapter with a clean seam for a real connector.

## Quick start

```bash
npm run seed       # generate a deterministic 25-account demo dataset
npm start          # launch the server on http://localhost:3100
```

Open http://localhost:3100 and use the topbar `View as` chip to flip between roles:
CP → RVP → CRO → CEO → BDR. Each role sees scoped data and a role-specific dashboard.

### Optional: live Gemini

Set `GEMINI_API_KEY` in a `.env` or as an env var before `npm start`. The topbar badge flips from "Demo" to "Gemini live" and the 4-call Account Plan Agent, Market-Intel discovery, Win Plan, Confidence narrative, and MEDPICSS-suggest agents use real LLM calls. Without a key everything falls back to deterministic fixtures so the full flow still works.

```bash
export GEMINI_API_KEY=...
npm start
```

## What the demo shows

| Screen | URL hash | What's there |
|---|---|---|
| Dashboard | `#/dashboard` | Role-specific tiles: CP / RVP / CRO / CEO / BDR; pipeline-by-stage; forecast-risk list |
| Market Intel | `#/market-intel` | Campaign form → Gemini (or fallback) discovers 8 real companies with stakeholders → "Add to pipeline" creates SFDC account + leads |
| Warm-up | `#/warmup` | Scoped account list with FIRE + MEDPICSS-filled chips; gate for spin-out |
| Warm-up detail | `#/warmup/:id` | FIRE radial, MEDPICSS checklist (9 slots with per-slot validation), activity timeline, AI-suggest button |
| Account Plan | `#/account-assist/:id` | 4-call Aera-tuned agent (overview / news / white space / stakeholders / competitive / value / 10-30-60), streamed via SSE |
| Opportunities | `#/opps` | Drag-and-drop kanban by `internal_stage`; confidence bar + Δ-close chip per card |
| Opp detail | `#/opps/:id` | 5 tabs: Overview · Win plan · Confidence · Stakeholders · History |
| Leads | `#/leads` | Filterable table, in-line role edits, "Simulate job change" flips old lead inactive + creates orphan at new company |

## Architecture

```
Browser (vanilla JS SPA — RI.* namespace)
  Topbar: brand · tabs · role/user switcher · AI mode
  Runtime: EventBus · AppStore · Api · Role (scope helper) · Router
           Module files under js/modules/
                        │  REST JSON + SSE for agent progress
Node server (zero-dep http)
  /api/ai                    Gemini proxy
  /api/sfdc/*                SFDC adapter (mock | real-stub)
  /api/accounts|opps|leads   composed reads (sfdc + local enrichment + activities + leads)
  /api/activities            POST recomputes FIRE live
  /api/accounts/:id/medpicss PATCH slot, validation rules, triggers FIRE activity log
  /api/agents/*              account-plan (SSE), discover, win-plan, confidence-narrative, medpicss-suggest
  /api/dashboard/:role       role-scoped tiles (CP/RVP/CRO/CEO/BDR)
  /api/users                 hierarchy for role switcher

SFDC Mock Adapter (server/sfdc/)    ⇄    File JSON Store (data/)
  ISfdcAdapter interface                  sf_accounts, sf_opps, sf_contacts
  mock.js (default)                       account_enrichment, opp_enrichment
  real.js stub (501)                      leads, activities, win_plans, account_plans, users
```

## Scoring

All engines are pure, deterministic, and shared between server (source of truth) and client (optimistic preview).

### FIRE (0–100, per account)

`FIRE = 0.30·Fit + 0.25·Intent + 0.20·Recency + 0.25·Engagement`

| Sub-score | How it's built |
|---|---|
| **Fit** | industry match 40 · revenue band 25 · employee band 15 · geography 10 · lead coverage 10 |
| **Intent** | starts 30; `content_view` +3 cap +20, `event_attend` +12, `email_reply` +8, `bdr_call` +6, `meeting` +10; decays 2 pts/week |
| **Recency** | `100 − min(100, days_since_last_activity·2)` |
| **Engagement** | active leads × 8 (cap 40) + recent-interaction share × 30 + champion +20 + economic buyer +10 |

### MEDPICSS (9 slots)

Each slot has per-slot validation:
- `metrics` — note must include a number and unit
- `economic_buyer` — linked lead with `role_in_deal = decision_maker`
- `decision_criteria` — ≥ 2 criteria in note
- `champion` — linked active lead with `role_in_deal = champion`
- `competition` — ≥ 1 named competitor
- `success_criteria` — note with a measurable target

Opp spin-out is gated on `MEDPICSS ≥ 5/9 AND FIRE ≥ 60`.

### Confidence (0–100, per opportunity)

`C = 100·(0.30·Med + 0.20·Rec + 0.20·Stk + 0.15·Cmp + 0.15·Siz)`

All five components derive live from real account state (MEDPICSS completeness, last activity, active leads + champion/econ-buyer presence, competitor count parsed from MEDPICSS competition note, deal size vs. $800K median). A Gemini-backed agent produces a plain-English narrative on demand.

### Projected close

```
todayprojected = today + Σ(STAGE_AVG_DAYS[remaining]) · velocity_factor - in_stage_credit
velocity_factor = 0.85 if last 3 activities < 5d apart else (1.25 if > 14d else 1.0)
```

`|delta_days_from_sf| ≥ 30d` surfaces an opp on the dashboard's Forecast Risk panel.

## Role hierarchy

```
CEO — Frederic Laluyaux
  └─ CRO — Andrew Brown
       ├─ RVP East — Sarah Kim
       │    ├─ CP — Priya Chen
       │    └─ CP — Dave Rodriguez
       ├─ RVP West — Marcus Patel
       │    ├─ CP — Yuki Tanaka
       │    └─ CP — Ahmed Al-Fulani
       ├─ BDR — Alex Singh
       └─ BDR — Jordan Smith
```

Scope rules:

| Role | Sees |
|---|---|
| CEO / CRO | everything |
| RVP | accounts owned by any CP in their subtree |
| CP | accounts where `owner_user_id = user.id` |
| BDR | accounts where they have a logged activity |

## Salesforce adapter seam

Everything SFDC-shaped (Account / Opportunity / Contact / Lead) goes through the `ISfdcAdapter` interface in `server/sfdc/index.js`. Default implementation is `mock.js` (backed by `data/sf_*.json`). A real connector would implement the same methods and flip the env var:

```bash
RI_SFDC_IMPL=real npm start
```

The placeholder `real.js` stub throws a `501 "Real SFDC adapter not implemented"` for every method — nothing else crashes. Write your connector in `server/sfdc/real.js` to match the mock's signatures and the platform picks it up with no other changes. Verified by `npm run test:sfdc`.

## Tests

```bash
npm test                 # runs all three suites
npm run test:engines     # FIRE, MEDPICSS, Confidence, Close-date (12 tests)
npm run test:idempotency # seed twice → identical JSON hash
npm run test:sfdc        # real adapter stub returns 501 for every sObject method
```

## Seed

`npm run seed` produces a deterministic dataset (mulberry32 PRNG with fixed seed `20260417`):

- **10 users** (CEO, CRO, 2 RVPs, 4 CPs, 2 BDRs)
- **25 accounts** spanning 8 industries
- **60 leads** (2-4 per account, 5% inactive with job-change signals)
- **198 activities** (150 base + 48 opp-tied) over the last 90 days
- **12 opportunities** spread across all 5 stages with pre-populated MEDPICSS matching stage maturity
- **12 win plans** with stage-gated action items

Running `npm run seed` twice produces byte-identical files (test-enforced).

## Project layout

```
server.js                   # http entry, static file server
server/
  router.js                 # request dispatch
  store.js                  # JSON file store with per-file mutex
  sfdc/                     # ISfdcAdapter interface + mock + real stub
  ai/
    gemini.js               # proxy to generativelanguage.googleapis.com
    sse.js                  # minimal SSE framer
    agents/                 # account-plan, discover, win-plan,
                            # confidence-narrative, medpicss-suggest, fallback-plan
  engines/                  # fire, medpicss, confidence, close-date (pure)
  routes/                   # accounts, opps, leads, activities, medpicss,
                            # dashboard, users, market-intel

js/
  core/                     # utils, api, role, router
  modules/                  # dashboard, warmup, warmup-detail, account-assist,
                            # opportunities, market-intel, leads

css/                        # one file per screen + base/components/topbar

seed/
  generator.js              # deterministic data generator
  load-seed.js              # runner (npm run seed)
  tests/                    # engines, idempotency, sfdc-seam

data/                       # runtime JSON (gitignored except .gitkeep)
```

## Known limitations (prototype scope)

1. **Single-user demo.** Role switching is client-side; no auth. File-JSON store has a per-file mutex but is not safe for concurrent browser tabs writing simultaneously.
2. **All thresholds are judgment calls.** FIRE weights, gate cutoffs (`FIRE ≥ 60 ∧ MEDPICSS ≥ 5/9`), confidence weights, stage durations — all surfaced in code so they can be tuned without hunting.
3. **Gemini token cost in live mode.** The 4-call Account Plan Agent and the Market-Intel discovery can add up; demo mode is the default to keep costs zero.
4. **SFDC mock is not round-trippable** with a real Salesforce sandbox. The mock imitates sObject shape, not the full Bulk API / metadata stack.
