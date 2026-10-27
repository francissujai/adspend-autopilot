# Sponsor technology: how Ad Spend Autopilot uses Zetaris, Meterless and NVIDIA

Short answers first, then the evidence. Every claim points at a file, a test or a command you can run.

| Question | Answer |
|---|---|
| How is Zetaris integrated? | It is the agent's only data path. One SQL endpoint federates three Postgres sources (Meta Ads, Google Ads, the business's orders). The agent queries it **as its own Zetaris user** with role `autopilot_agent`, which Zetaris itself stops from reading customer data. A Unified Semantic Layer and a data-quality rule sit on top (`docs/ZETARIS_USL.md`). |
| Which Meterless Engines? | **Scout Intent**, **H-MEM** and **Markovian**, all implemented in TypeScript in `src/engines/`, all passing the official Meterless suites. **Nightshift** is the model runtime. |
| How does the app connect to Nightshift? | Through Nightshift's OpenAI-compatible Runtime endpoint (`http://127.0.0.1:8088/v1`) with its Runtime token. It is the primary and only model provider. |
| Where does NVIDIA contribute? | **Nemotron 3.5 Super VL 120B A12B** writes every "Why I did this" rationale. The lane that answered is recorded in each decision. |
| What is unique? | The model explains but never decides. Decisions are deterministic over evidence, so each one can be **replayed** from a signed ledger. Permissions are enforced twice: by Zetaris for what the agent can read and by Scout contracts for what it can do. |

## Zetaris

**Sources** (`data/zetaris/01_sources_create.sql`): three JDBC datasources over the `autopilot-pg` container:

| Datasource | Stands in for | Tables |
|---|---|---|
| `meta_pg` | Meta Ads export | `campaigns`, `adsets`, `adset_daily` (spend, platform-reported revenue, budget-limited share), `campaign_notes` (free text from the agency) |
| `google_pg` | Google Ads export | `campaigns`, `campaign_daily` (cost, conversion value, search impression share lost to budget) |
| `rev_pg` | the business's own orders | `orders` (with `customer_id`), `customers` (names, emails) |

Two Zetaris views join them: `autopilot.orders_attributed` (orders matched to ad lines by UTM, without customer identity) and `autopilot.revenue_by_line_daily` (backend revenue and orders per ad line per day).

**Governance** (`data/zetaris/02_governance.sql`): role `autopilot_agent` gets `SELECT` on the six ad tables and the two views, and nothing on `rev_pg`. A dedicated Zetaris user holds the role, and its API key is `AUTOPILOT_ZETARIS_API_KEY` (`src/autopilot/data.ts` `agentClient()`). The admin key is only used for setup.

**Evidence** (`src/autopilot/data.ts`): every cycle runs four queries through Zetaris (E1 Meta delivery, E2 Google delivery, E3 backend revenue through the governed view, E4 campaign notes). Each result is stored with its exact SQL, rows and a SHA-256 of the rows, and decisions cite evidence ids. Each cycle also runs a governance probe, `SELECT count(*) FROM rev_pg.customers`. Zetaris refuses it: *"User 'AUTOPILOT.AGENT@OPENAGENT.COM' does not have privileges to execute 'SELECT' on: REV_PG.customers"* (recorded in `docs/samples/C-20261025002424/ledger.jsonl`, entry 1). The app shows the result as a seal in its status bar.

**Unified Semantic Layer:** `data/zetaris/usl_create.sql` defines the semantic model over the three sources, with a registered data-quality rule. `npm run zetaris:usl` runs the exploration, DQ and USL queries. Results, the hand-coded comparison and our product feedback are in [`ZETARIS_USL.md`](ZETARIS_USL.md).

**A Zetaris bug we worked around:** a query that reads the same table twice (two CTEs or a self-join with different filters) returned the first read's rows for both. Every evidence query reads each table once and uses `SUM(CASE WHEN …)` for period comparisons.

## Meterless Engines

| Engine | What it does here | Code | Proof |
|---|---|---|---|
| **Scout Intent** | Classifies each proposed budget move into an intent (`budget.shift`, `budget.increase`, …) and scores it (lexical, semantic, contextual, recency, risk penalty). It runs layered guards over the request **and the untrusted text it depends on** (injection patterns, RBAC, scope limits with auto and hard maxima, required approvals), then issues an HMAC-SHA256 **execution contract** with a 5-minute expiry, or blocks. Meterless publishes Scout as a spec plus an eval harness; this implementation was written for this entry. | `src/engines/scout/`, registry `src/autopilot/registry.json`, policy packs `src/engines/scout/packs.ts` | `npm run conformance`: Scout eval harness PASS. On the harness's fixture suite (corpus v1, 32 examples), intent top-1, intent top-3 recall, injection precision, injection recall and tool precision are all 1.000, with a clarification rate of 0.094 (`conformance/results/scout.txt`) |
| Scout contract gate | The sandbox platforms refuse any budget write without a contract that verifies: correct signature, unexpired, within its dollar scope, approved when high-risk. Approval issues a fresh contract. | `src/autopilot/executor.ts`, `src/autopilot/autopilot.ts` `review()` | test `contracts: executor refuses tampered, expired or unapproved contracts` |
| Scout guards in the pipeline | The planted agency note becomes decision D-0003 and is blocked with 6 flags (instruction-override, agent-directed, audit-evasion, budget-takeover, scope). No contract is issued. | `src/autopilot/policy.ts` | test `policy: auto-execute the safe shift, hold the $5k chase, block the injected note`; `docs/samples/README.md` |
| **H-MEM** | Trust memory. Human approvals and rejections become memories with provenance (decision id, reviewer, note). Before scoring, the autopilot recalls rejections on the same ad line and move type, and each one lowers confidence. In the demo, rejecting the $5,000 move drops the next cycle's confidence on it from 0.46 to 0.25. | `src/engines/hmem/`, `src/autopilot/trust.ts` | `npm run conformance`: **13/13** official H-MEM checks (`conformance/results/hmem.txt`); test `a human rejection in trust memory lowers confidence on the same move` |
| **Markovian** | Writes the rationales as bounded steps: one chunk per decision, with a carryover that tracks the portfolio (what already moved), so later explanations know about earlier ones without re-reading their prompts. | `src/engines/markovian/`, `src/autopilot/rationale.ts` | `npm run conformance`: **8/8** official Markovian checks (`conformance/results/markovian.txt`); test `template rationale cites evidence and never invents an amount` (the fallback path) |

The official runners are copied unchanged from meterless/meterless@1742dec (Apache-2.0, see `NOTICE`). `npm run conformance` points them at this repo's implementations through `MARKOVIAN_IMPL`, `HMEM_IMPL` and `SCOUT_IMPL` (`scripts/conformance.ts`).

Other offline tests (`npm test`, 12 tests): `optimizer proposes the $500 efficiency shift, the platform-signal chase and the note suggestion`; `ledger: hash chain and Ed25519 signatures detect edits, deletions and reordering`; `a cycle with Zetaris unreachable fails loudly and writes nothing to the ledger`; `demo reset archives the ledger, memory and budgets but keeps keys and recordings`; and four sample-mode tests in `test/sample.test.ts`, including `sample cycle: every decision replays exactly from the stored evidence`.

## Meterless Nightshift

`src/llm/meterless.ts` follows Meterless's "add Meterless as a provider" contract:

- `MODEL_PROVIDER=meterless` is the only provider. There is no fallback to another vendor; without Nightshift, rationales are template text labelled as such.
- Requests go to Nightshift's Runtime (`MODEL_BASE_URL`, default `http://127.0.0.1:8088/v1`, auto-detected on 8088, 8090, 8787 and 11434) with `Authorization: Bearer <Runtime token>`, `meterless-app: adspend-autopilot` and `meterless-scope: user`. The placeholder token `rt-local` is rejected.
- Model `meterless/deep` routes to the cloud Nemotron lanes configured in Nightshift (`meterless/text.local` for a local lane). Calls use a 180 s timeout by default and retry 429s and transient 502s after 2, 4 and 8 s.
- Nightshift's compute receipt (`routed_model`, lane label, cloud or local) is read from each response.

## NVIDIA Nemotron

Nemotron writes every "Why I did this": three sentences per decision that cite evidence ids, explain the outcome and say what would change it. The model sees only the decision facts, after the decision is made, and cannot change it. The lane label from Nightshift's receipt is stored in each decision record (`rationale.by = "nemotron"`, `rationale.model = "Nemotron 3.5 Super VL 120B A12B"` in the sample cycle) and shown in the decision drawer. If the model is unavailable, the record gets a template rationale marked `by: "template"`.

## What is unique

- **The LLM proposes nothing and decides nothing.** A deterministic optimizer proposes, Scout and policy decide, and Nemotron explains. Because of that split, `npm run replay -- D-0001` can rebuild the inputs from the ledger and reproduce the action, amount, intent, risk, confidence and status exactly.
- **Two independent permission layers.** Zetaris roles bound what the agent can read. Scout contracts bound what it can do, and the executor checks them.
- **Untrusted text is treated as data.** Campaign notes are scanned by the same guards as the request, quoted in the record and never obeyed.
- **Tamper-evident record.** Every ledger entry is `Ed25519(SHA-256(canonical JSON + prevHash))`. Editing, deleting or reordering any entry fails verification (`npm run tamper-demo`, and the Ledger page in the app).
- **Platform vs backend agreement as a risk signal.** Zetaris lets the agent compare what Meta and Google claim with what the business's orders show, and confidence falls when they disagree. That is why the 5.58x "ROAS" lookalike move was held.
