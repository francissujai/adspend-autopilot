# Zetaris Unified Semantic Layer: Ad Spend Autopilot

Everything below was run against the local Zetaris instance (2.4.3.1, Docker, REST API on `localhost:8888`) on 2026-10-27, using the admin key (`ZETARIS_API_KEY`). The tables are copied from real runner output. Anything that was not verified live, or that is a mock, is labelled as such.

| Command | What it does |
|---|---|
| `npm run zetaris:usl` | Runs the exploratory queries, then RUN DQ, then the USL queries, and prints each result as a table |
| `npm run zetaris:usl -- --create` | Builds or rebuilds the USL first (namespace, COMPILE, ACTIVATE, REGISTER DQ), then runs the steps above |
| `npm run zetaris:usl -- --only explore\|create\|dq\|queries` | Runs a single phase |
| `npm run zetaris:usl -- --sql "<statement>"` | Runs one ad hoc statement |
| `npm run zetaris:handcoded` | Builds the same per-line ROAS result without Zetaris, then compares it cell by cell with USL query Q1 |

Files: `data/zetaris/explore_{meta,google,rev}_pg.sql`, `data/zetaris/usl_create.sql`, `data/zetaris/usl_dq.sql`, `data/zetaris/usl_queries.sql`, `scripts/zetaris-usl.ts`, `scripts/handcoded-compare.ts`.

---

## 1a. Use case and sources

The autopilot moves daily budget between ad lines. Before it moves anything, it needs to know which lines actually make money. The ad platforms grade their own homework: Meta and Google each report the revenue they claim to have driven. The business's order book records what was actually sold. Neither platform can see that.

| Zetaris source | Postgres database | Tables | What it holds |
|---|---|---|---|
| `meta_pg` | `metadb` | `campaigns`, `adsets`, `adset_daily`, `campaign_notes` | Meta export. The ad line is the **ad set**, and the budget sits on the ad set. Columns: `spend_usd`, `revenue_reported_usd`, `budget_lost_share` |
| `google_pg` | `googledb` | `campaigns`, `campaign_daily` | Google export. The ad line is the **campaign**, which also holds the budget. Columns: `cost_usd`, `conv_value_reported_usd`, `search_lost_is_budget` |
| `rev_pg` | `revdb` | `orders`, `customers` | Backend truth. Each order is tied to an ad line by `utm_id`. `customers` holds personal data (email, full name) |

The two platforms hold the same concepts under different names, keys and hierarchy levels. The revenue we can trust sits next to personal data that the agent must never read. A semantic layer is meant to fix exactly this: one shape for "ad line" and "daily delivery", and a backend-revenue table that carries no identity.

## 1b. Exploratory queries and captured results

Three queries per source. The full SQL, with intent and result comments, is in `data/zetaris/explore_*.sql`.

**meta_pg**

| Query | Result |
|---|---|
| Coverage of `adset_daily` | 140 rows = 5 ad sets x 28 days (2026-09-21 to 2026-10-18). Spend 91,237.29; Meta-reported revenue 277,576.20 |
| Ad sets with their campaign, budget and platform ROAS (3-table join) | Cart Abandoners 5.45, Site Visitors 3.72, Lookalike 3% 2.03, Interests 2.78, UGC Video 2.04 |
| Days on which at least 30% of delivery was lost to budget | 23851190001: 26 of 28 days (avg 0.446). Others: 10, 12, 3 and 0 days. Range 0 to 0.60, so the value is a 0..1 share |

**google_pg**

| Query | Result |
|---|---|
| Coverage of `campaign_daily` | 112 rows = 4 campaigns x 28 days, same window as Meta. Cost 90,640.91; reported conversion value 253,885.08 |
| Campaigns by channel: cost, CPC, platform ROAS | Brand 6.37, Generic 2.11, Display 0.84 (CPC 0.56), PMax 2.65 |
| Impression share lost to budget | g-1002 is capped on 5 days and g-1004 on 3; maximum 0.62. Same 0..1 meaning as Meta's `budget_lost_share` |

**rev_pg** (admin only; `autopilot_agent` is never granted `rev_pg`)

| Query | Result |
|---|---|
| Orders by `utm_source` | google: 2,564 orders, 4 lines, 219,049.94. meta: 2,343 orders, 5 lines, 201,320.96. organic: 1,194 orders, 102,807.18. direct: 771 orders, 65,209.52. organic and direct have an empty `utm_id` |
| Federated orphan check: `rev_pg.orders` LEFT JOIN `meta_pg.adsets` LEFT JOIN `google_pg.campaigns` | **0 rows.** Every attributed order points at a known ad line, so `utm_id` can be declared a foreign key |
| Customers by country, joined to orders | 4,200 customers (US 1,680; GB, CA and AU 840 each), each with an email and full name. The USL must not carry these columns |

## 1c. USL: DDL, activation, active queries, data quality

### DDL (`data/zetaris/usl_create.sql`), sent as one COMPILE request

USL `adspend` in namespace `lightning.metastore.autopilot_usl`:

```sql
COMPILE USL IF NOT EXISTS adspend DEPLOY NAMESPACE lightning.metastore.autopilot_usl DDL
CREATE TABLE ad_line (
  line_id varchar(40) NOT NULL PRIMARY KEY, platform varchar(10) NOT NULL,
  line_name varchar(200), campaign_name varchar(200), channel varchar(40), daily_budget_usd decimal(10,2)
);
CREATE TABLE daily_delivery (
  delivery_key varchar(60) NOT NULL PRIMARY KEY, report_date date NOT NULL,
  line_id varchar(40) FOREIGN KEY REFERENCES ad_line(line_id),
  spend_usd decimal(12,2), impressions int, clicks int, platform_conversions int,
  platform_revenue_usd decimal(12,2), lost_to_budget_share decimal(5,2)
);
CREATE TABLE daily_backend_revenue (
  revenue_key varchar(60) NOT NULL PRIMARY KEY, order_date date NOT NULL,
  line_id varchar(40) FOREIGN KEY REFERENCES ad_line(line_id),
  platform varchar(10), orders bigint, revenue_usd decimal(12,2)
);
```

Design notes:
- The natural keys are composite: `(line_id, date)`. Composite primary keys were not tried. The model uses a surrogate string `"<line_id>|<date>"` instead, and that string is unique.
- Declaring `line_id` a FOREIGN KEY made Zetaris generate a referential-integrity DQ rule on both fact tables. No extra code was written for these rules.
- `daily_backend_revenue` has no customer column. The only `rev_pg` columns that reach the model are `utm_id`, `utm_source`, `ordered_at` and `revenue_usd`.

### Activation, unifying Meta and Google into one shape

- `ad_line` = (`meta_pg.adsets` JOIN `meta_pg.campaigns`) UNION ALL `google_pg.campaigns`
- `daily_delivery` = `meta_pg.adset_daily` UNION ALL `google_pg.campaign_daily`. The columns are renamed into one shape: `cost_usd` and `spend_usd` become `spend_usd`, `conv_value_reported_usd` and `revenue_reported_usd` become `platform_revenue_usd`, and `search_lost_is_budget` and `budget_lost_share` become `lost_to_budget_share`.
- `daily_backend_revenue` = `rev_pg.orders WHERE utm_id <> ''`, grouped by `utm_id`, `utm_source` and `to_date(ordered_at)`

Every ACTIVATE casts each column to its declared type, because a query column may not be downcast. All three activations succeeded on the first attempt. `SHOW NAMESPACES OR TABLES IN lightning.metastore.autopilot_usl.adspend` then showed all three tables with `activated = true`.

Reconciliation after activation:

| USL table | Rows | Total | Source check |
|---|---|---|---|
| `ad_line` | 9 (5 meta, 4 google) | – | 5 ad sets + 4 campaigns |
| `daily_delivery` | 252 | spend 181,878.20 | 91,237.29 + 90,640.91 = 181,878.20 |
| `daily_backend_revenue` | 252 | 4,907 orders, 420,370.90 | meta 201,320.96 + google 219,049.94 = 420,370.90 |

### Queries through the active USL (`data/zetaris/usl_queries.sql`)

None of these queries names a source system.

**Q1. Backend vs platform ROAS per ad line, last 7 days (2026-10-12 to 2026-10-18).** This is the headline result.

| platform | line_id | line_name | budget | spend_7 | platform_rev_7 | backend_rev_7 | platform_roas_7 | backend_roas_7 | avg_lost_to_budget_7 |
|---|---|---|---|---|---|---|---|---|---|
| google | g-1001 | Search - Brand | 800 | 4658.44 | 29858.91 | 27208.60 | 6.41 | 5.84 | 0.017 |
| google | g-1002 | Search - Generic Analytics | 1200 | 6463.76 | 13487.28 | 11388.90 | 2.09 | 1.76 | 0.010 |
| google | g-1003 | Display - Broad Awareness | 1000 | 5633.78 | 4644.76 | 3156.92 | 0.82 | 0.56 | 0.006 |
| google | g-1004 | PMax - Catalog | 900 | 5324.28 | 14740.38 | 12055.94 | 2.77 | 2.26 | 0.154 |
| meta | 23851190001 | Retargeting - Cart Abandoners | 600 | 4179.23 | 22044.86 | 18335.12 | 5.27 | 4.39 | 0.489 |
| meta | 23851190002 | Retargeting - Site Visitors 30d | 500 | 2956.05 | 10495.26 | 7972.61 | 3.55 | 2.70 | 0.077 |
| meta | 23851190003 | Prospecting - Lookalike 3% | 1500 | 8662.57 | 28851.22 | 9099.05 | **3.33** | **1.05** | 0.007 |
| meta | 23851190004 | Prospecting - Interests: Analytics | 900 | 5410.80 | 15084.24 | 11151.48 | 2.79 | 2.06 | 0.127 |
| meta | 23851190005 | Creative Test - UGC Video | 300 | 1785.36 | 3665.96 | 2966.62 | 2.05 | 1.66 | 0.067 |

Lookalike 3% looks healthy on Meta's numbers (3.33) but barely breaks even on real orders (1.05). Cart Abandoners returns 4.39 on real orders yet loses about half its delivery to budget. These are the two signals the autopilot acts on.

**Q2. Cross-platform totals over 28 days**

| platform | lines | spend | platform_revenue | backend_revenue | platform_roas | backend_roas | platform / backend |
|---|---|---|---|---|---|---|---|
| google | 4 | 90640.91 | 253885.08 | 219049.94 | 2.80 | 2.42 | 1.16 |
| meta | 5 | 91237.29 | 277576.20 | 201320.96 | 3.04 | 2.21 | 1.38 |

Meta over-reports revenue by 38% and Google by 16%.

**Q3. Budget-starved but profitable.** Lines that lost at least 30% of delivery to budget on 3 or more of the last 7 days. One row: `23851190001` Cart Abandoners, capped on 7 of 7 days, spend 4,179.23, backend ROAS 4.39.

**Q4. Week-over-week spend per line.** This query reads the same USL table twice. The results are in the next section.

### Data quality: rules and RUN DQ counts (`data/zetaris/usl_dq.sql`)

The custom rule that matters (`REGISTER DQ` in `usl_create.sql`):

```sql
REGISTER DQ delivery_sane TABLE lightning.metastore.autopilot_usl.adspend.daily_delivery AS
spend_usd >= 0 AND clicks >= 0 AND platform_revenue_usd >= 0 AND lost_to_budget_share BETWEEN 0 AND 1
```

The rule catches unit mix-ups between the two platforms (for example 45 instead of 0.45) and sign errors before they reach a budget decision. `LIST DQ USL` returns 8 rules: 3 primary keys and 2 foreign keys, all generated from the DDL, plus 3 custom rules.

| Rule | Table | Type (as reported) | total | valid | invalid |
|---|---|---|---|---|---|
| `delivery_sane` | daily_delivery | Custom Data Quality | 252 | 252 | 0 |
| `line_id` (FK to ad_line) | daily_delivery | Foreign Key Constraint | 252 | 252 | 0 |
| `line_id` (FK to ad_line) | daily_backend_revenue | Foreign Key Constraint | 252 | 252 | 0 |
| `delivery_key` | daily_delivery | Primary Key Constraint | 252 | 252 | 0 |
| `revenue_key` | daily_backend_revenue | Primary Key Constraint | 252 | 252 | 0 |
| `line_id` | ad_line | Primary Key Constraint | 9 | 9 | 0 |
| `backend_positive` (`orders > 0 AND revenue_usd > 0`) | daily_backend_revenue | Custom Data Quality | 252 | 252 | 0 |
| `budget_headroom` (`lost_to_budget_share < 0.5`) | daily_delivery | Custom Data Quality | 252 | **228** | **24** |

The demo data is clean, so every integrity rule passes. To show that the DQ engine does flag rows, `budget_headroom` is a deliberate signal rule rather than a defect check. `SHOW DQ INVALID RECORD budget_headroom TABLE ...` returned the 24 flagged line-days: 11 for 23851190001, 5 for ...0004, 4 for ...0005, 1 for ...0002, 2 for g-1002 and 1 for g-1004.

### Live behaviour and failures

- **No USL command failed.** COMPILE (3 tables in one request), all 3 ACTIVATEs, both `UPDATE USL ... SET TABLE DESCRIPTION`, all 3 REGISTER DQs, every RUN DQ, `LIST DQ USL` and `SHOW DQ INVALID RECORD` worked first time.
- **Re-running is safe.** A second `npm run zetaris:usl -- --create` finished with 0 failures. `COMPILE USL IF NOT EXISTS` returned the existing model, and re-running `REGISTER DQ` replaced each rule rather than duplicating it: `LIST DQ USL` still showed 8. Not tested: whether COMPILE alone, without the ACTIVATEs that follow it, keeps the tables activated.
- **The SQL Workspace splits on `;`.** `scripts/zetaris-usl.ts` therefore merges every `CREATE TABLE` chunk that follows `COMPILE USL` back into one request.
- **Repeated-read bug (tested live).** With two grouped subqueries over `meta_pg.adset_daily` (last 7 days vs the previous 7), the raw-source version returned `spend_prev = spend` for all 5 ad sets, which is wrong. Postgres gives 4,171.65 vs 4,179.23 for 23851190001, for example. The **same query through the USL table (Q4) returned the correct values** for all 9 lines; Meta and Google were both checked against psql. This is one query shape tested once. It does not show that the USL is immune to the bug. A simpler raw-source CROSS JOIN of two ungrouped sums was correct.
- **Governance (tested live).** With the least-privilege agent key (`AUTOPILOT_ZETARIS_API_KEY`, role `autopilot_agent`), `SELECT ... FROM lightning.metastore.autopilot_usl.adspend.daily_backend_revenue` is refused with `User '...' does not have access to USL: metastore.autopilot_usl.daily_backend_revenue`, and `SHOW NAMESPACES OR TABLES IN lightning.metastore.autopilot_usl` returns 0 rows. The USL is deny-by-default, which is correct. The role was **not** granted the USL, because the existing role was left unchanged. So two things are **not verified**: whether a USL grant works without also granting `rev_pg`, and whether it would expose more than the governed view does. The running app still reads through the governed view `autopilot.revenue_by_line_daily`, not the USL.
- **Materialization** (`MATERIALIZE USL TABLE`) was not attempted, because no storage target is configured.

---

## 2a. How the USL saved time vs hand-coding

`scripts/handcoded-compare.ts` builds Q1 without Zetaris. It runs 5 queries against the 3 Postgres databases (`docker exec autopilot-pg psql`, run in parallel, no new npm dependencies) and does the unification, foreign-key check, join and rollup in TypeScript, working in integer cents. It then runs USL Q1 and compares the two results cell by cell.

Result: **9 lines x 10 columns = 90 cells, ALL MATCH**, on 4 separate runs.

| | USL (Zetaris) | Hand-coded (psql + TypeScript) |
|---|---|---|
| Code for the Q1 answer | 20 SQL lines for Q1, on top of a one-off 62 lines of model (28 COMPILE + 34 ACTIVATE) | 42 lines of TypeScript (pipeline only; 90 for the whole file, including the comparison) |
| Code for each further question | 1 SQL statement over 3 clean tables (Q2: 15 lines, Q3: 17 lines) | A new pipeline. The Meta/Google unification and UTM join are re-done or refactored into a shared library |
| Setup steps | 1 command (`npm run zetaris:usl -- --create`: 11 statements), with the sources already registered in Zetaris for the app | Shell access to the database host (or 3 network paths and 3 sets of credentials), knowledge of 3 schemas, a script runtime |
| Wall clock for Q1 (4 runs) | 2,707 / 1,709 / 1,271 / 1,092 ms | 357 / 622 / 259 / 188 ms |
| Data quality | 8 rules with total/valid/invalid counts from `RUN DQ`, and invalid rows from `SHOW DQ INVALID RECORD` | 2 `throw`s for unknown ad lines. No counts and no row listing |
| Governance | `rev_pg` is never exposed: the USL is deny-by-default, the agent role is denied `rev_pg`, and there is a PII-free governed view | Connects as the database owner. The script could select `customer_id` or join `customers`, and nothing would stop it |

Governance a hand-coded path would have to rebuild: per-identity access control (the `autopilot_agent` role and its source and view grants); the PII boundary (a view or column allow-list in each database); one catalogue of what "spend" and "lost to budget" mean across platforms; FK and PK integrity checks with counts; table descriptions; and a single access point instead of three sets of database credentials spread across scripts.

Honest reading:
- **For one question, hand-coding is not slower to write and is 3 to 10 times faster to run.** Zetaris adds about 1 to 2.5 s of planning and federation per query on this laptop.
- **The USL wins from the second question onward.** Once the model exists, Q2, Q3 and Q4 were one statement each, with no Meta/Google renaming and no UTM join logic. In the hand-coded path that work is repeated, or factored into a library someone has to maintain.
- The data-quality and governance rows are what the USL gives that the script never will without significant extra work.
- Developer time, as observed for this work (approximate, not a controlled measurement): exploration about 15 min, which both paths need. Writing the USL DDL, activations and DQ took about 15 min and ran first time. Q1 to Q4 took about 10 min. The hand-coded Q1 took about 10 min, reusing schema knowledge from the exploration.

## 2b. Where it would and would not help in real work

**Where it helps**
- **Many platforms, one meaning.** Each new ad platform (TikTok, Microsoft, Amazon) is one more `UNION ALL` branch in two ACTIVATE statements. Every downstream query, dashboard and the agent itself keep working unchanged.
- **A governed contract for an agent.** The agent can be given semantic tables (ad line, daily delivery, backend revenue) instead of raw databases. Because the USL is deny-by-default, nothing is exposed by accident.
- **Data quality as a pre-flight gate.** The autopilot could refuse to move budget when `RUN DQ delivery_sane` reports any invalid rows. That turns a silent data bug into a refusal that can be audited.
- **Federation without ETL.** The data never left the three Postgres databases. That matters when the order book cannot be copied into a marketing warehouse.

**Where it would not help, or would hurt**
- **Latency.** 1 to 2.7 s per query vs 0.2 to 0.6 s direct. Interactive UI paths would need caching or materialization, and SQL materialization was not tested here.
- **Tiny, single-question jobs.** For a one-off analysis of a single database, a direct query is quicker end to end.
- **Engine quirks.** The repeated-read bug on source tables means analysts must know which query shapes are safe. The USL path got Q4 right in our test, but that is not a documented guarantee.
- **The access model is still unverified.** Without a confirmed USL grant that does not leak the underlying `rev_pg`, the agent cannot yet be switched from the governed view to the USL.

**Bonus: project forecast.** This is an estimate, not a measurement. The scenario is a performance-marketing agency running the autopilot for 20 client accounts, each with 3 ad platforms and 1 order backend.

Assumptions:
1. Per client, 4 recurring questions: ROAS by line, platform over-reporting, budget-starved lines, week over week.
2. Hand-coded: a reusable connector per platform costs 1 day once. Wiring each new client costs 0.5 day. Each question costs 0.5 day to write once and 0.25 day per schema change; we assume 2 schema changes per platform per year.
3. USL: designing the model costs 1.5 days once. Per client, registering 4 sources and re-pointing the activations costs 0.25 day. Queries are written once against the model and reused across clients. Each schema change costs 0.25 day in one ACTIVATE.
4. Data quality: hand-coded checks cost 0.5 day per question. In the USL, the rules come from the DDL and are written once.

| Year-one effort | Hand-coded | USL |
|---|---|---|
| Foundation (connectors or model) | 3 days | 1.5 days |
| Onboarding 20 clients | 10 days | 5 days |
| 4 questions (written once and parameterised) | 2 days | 0.5 day |
| Schema changes: 3 platforms x 2 per year, touching every question vs one ACTIVATE | 6 changes x 4 questions x 0.25 = 6 days | 6 x 0.25 = 1.5 days |
| DQ checks | 4 x 0.5 = 2 days | 0.25 day |
| **Total** | **about 23 days** | **about 8.75 days (about 60% less)** |

The forecast assumes the USL grant model works for an agent identity (not verified) and that the 1 to 2.5 s query latency is acceptable for a daily batch decision. It is for this workload.

## 2c. PM-style killer requirement for Zetaris

**Requirement: the USL table should be the security boundary, with column policies declared in the model.**

*Problem.* Today the semantic layer and the access-control layer are separate. An agent identity is governed by source grants and SchemaStore views (`02_governance.sql`). The USL repeats the same logic in its ACTIVATE queries, and it is deny-by-default with no documented way to say "this role may read `daily_backend_revenue` but must never touch `rev_pg`". So teams build the PII-free shape twice: once as a view for governance and once as a USL table for semantics. The copies drift apart.

*Requirement.*
1. `GRANT SELECT ON USL TABLE <ns.usl.table> TO ROLE <role>` must be enforced on its own. The grantee can read the activated result without holding any grant on the sources the activation reads (definer rights), and `SELECT` on the underlying source stays denied.
2. Column-level policy in the DDL (`MASKED`, `DENY FOR ROLE`), so a PII column can live in the model for administrators and be invisible to an agent.
3. Row-level filters per role.
4. A `RUN DQ` precondition on grants: a role can be told to read only valid records.
5. An audit row for each read of a USL table, recording identity, rule state and row hash, which an agent can cite as evidence.

*Acceptance test.* Run with the `autopilot_agent` key: `SELECT * FROM ...daily_backend_revenue` succeeds, `SELECT * FROM rev_pg.customers` is still denied, and `customer_country` comes back masked.

*Mock syntax.* **This is a mock: these clauses do not exist in Zetaris 2.4.3.1 and were not run.**

```sql
COMPILE USL adspend DEPLOY NAMESPACE lightning.metastore.autopilot_usl DDL
CREATE TABLE daily_backend_revenue (
  revenue_key varchar(60) NOT NULL PRIMARY KEY,
  order_date date NOT NULL,
  line_id varchar(40) FOREIGN KEY REFERENCES ad_line(line_id),
  platform varchar(10),
  customer_country varchar(2) MASKED WITH 'XX' FOR ROLE 'autopilot_agent',   -- mock
  orders bigint,
  revenue_usd decimal(12,2)
) ROW FILTER FOR ROLE 'autopilot_agent' AS order_date >= date_sub(current_date(), 90);  -- mock

GRANT SELECT ON USL TABLE lightning.metastore.autopilot_usl.adspend.daily_backend_revenue
  TO ROLE 'autopilot_agent' WITH DEFINER SOURCES REQUIRE DQ VALID;                   -- mock
```

*Resulting USL.* This is mock output, written by hand to show the intended behaviour:

```text
LIST DQ USL lightning.metastore.autopilot_usl.adspend           (mock output)
name             table                  type                   policy
revenue_key      daily_backend_revenue  Primary key            -
line_id          daily_backend_revenue  Foreign key            -
backend_positive daily_backend_revenue  Custom Data Quality    REQUIRED for autopilot_agent
customer_country daily_backend_revenue  Column mask            'XX' for autopilot_agent
(row filter)     daily_backend_revenue  Row filter             last 90 days for autopilot_agent
```

With this in place, the autopilot would drop the separate governed view and read `daily_backend_revenue` directly. Governance, semantics and data quality would then sit on one object.

*Runner-up requirement: fix the repeated-read bug.* A query that reads the same source table twice must not reuse the first read's rows. Week-over-week and period-over-period comparisons are the most common analytics shape. The live reproduction is under "Live behaviour and failures" above.
