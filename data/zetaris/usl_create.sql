-- =============================================================================
-- USL "adspend" in lightning.metastore.autopilot_usl: one semantic model of
-- paid-media performance across Meta, Google and the backend order book.
--
--   ad_line                 one row per ad line (Meta ad set or Google campaign), unified shape
--   daily_delivery          one row per ad line per day: spend, clicks, platform-reported
--                           revenue, share of delivery lost to budget (Meta + Google unified)
--   daily_backend_revenue   one row per ad line per day: orders and revenue from rev_pg.orders,
--                           keyed to the ad line by UTM, with NO customer identifier or PII
--
-- Run with the ADMIN key (USL/DQ commands are admin-only):
--   npm run zetaris:usl -- --create          (create, then DQ and queries)
--   npm run zetaris:usl -- --only create
-- The runner sends the multi-table COMPILE USL as ONE request; do not paste it
-- into SQL Workspace (the editor splits on ";").
-- Re-running: "already exists" errors are reported and skipped by the runner;
-- ACTIVATE re-binds the query, REGISTER DQ fails harmlessly when the rule exists.
-- =============================================================================

-- Namespace (the parent lightning.metastore already existed on this instance).
CREATE NAMESPACE IF NOT EXISTS lightning.metastore;

-- The project namespace. Only this namespace is used by the Ad Spend Autopilot.
CREATE NAMESPACE IF NOT EXISTS lightning.metastore.autopilot_usl;

-- Compile + deploy the three-table model. Keys: surrogate string keys "<line_id>|<date>" stand in for
-- the natural composite keys (line_id, date); line_id is a declared FOREIGN KEY to ad_line, which makes
-- Zetaris generate a referential-integrity DQ rule for each fact table.
COMPILE USL IF NOT EXISTS adspend DEPLOY NAMESPACE lightning.metastore.autopilot_usl DDL
CREATE TABLE ad_line (
  line_id varchar(40) NOT NULL PRIMARY KEY,
  platform varchar(10) NOT NULL,
  line_name varchar(200),
  campaign_name varchar(200),
  channel varchar(40),
  daily_budget_usd decimal(10,2)
);
CREATE TABLE daily_delivery (
  delivery_key varchar(60) NOT NULL PRIMARY KEY,
  report_date date NOT NULL,
  line_id varchar(40) FOREIGN KEY REFERENCES ad_line(line_id),
  spend_usd decimal(12,2),
  impressions int,
  clicks int,
  platform_conversions int,
  platform_revenue_usd decimal(12,2),
  lost_to_budget_share decimal(5,2)
);
CREATE TABLE daily_backend_revenue (
  revenue_key varchar(60) NOT NULL PRIMARY KEY,
  order_date date NOT NULL,
  line_id varchar(40) FOREIGN KEY REFERENCES ad_line(line_id),
  platform varchar(10),
  orders bigint,
  revenue_usd decimal(12,2)
);

-- Activate ad_line: Meta ad sets (budget on the ad set) + Google campaigns (budget on the campaign), one shape.
ACTIVATE USL TABLE lightning.metastore.autopilot_usl.adspend.ad_line AS
SELECT CAST(a.adset_id AS varchar(40)) AS line_id, CAST('meta' AS varchar(10)) AS platform,
  CAST(a.adset_name AS varchar(200)) AS line_name, CAST(c.campaign_name AS varchar(200)) AS campaign_name,
  CAST(c.objective AS varchar(40)) AS channel, CAST(a.daily_budget_usd AS decimal(10,2)) AS daily_budget_usd
FROM meta_pg.adsets a JOIN meta_pg.campaigns c ON c.campaign_id = a.campaign_id
UNION ALL
SELECT CAST(g.campaign_id AS varchar(40)), CAST('google' AS varchar(10)),
  CAST(g.campaign_name AS varchar(200)), CAST(g.campaign_name AS varchar(200)),
  CAST(g.channel_type AS varchar(40)), CAST(g.daily_budget_usd AS decimal(10,2))
FROM google_pg.campaigns g;

-- Activate daily_delivery: Meta adset_daily and Google campaign_daily renamed into one delivery shape.
ACTIVATE USL TABLE lightning.metastore.autopilot_usl.adspend.daily_delivery AS
SELECT CAST(concat(d.adset_id, '|', CAST(d.report_date AS string)) AS varchar(60)) AS delivery_key,
  d.report_date AS report_date, CAST(d.adset_id AS varchar(40)) AS line_id,
  CAST(d.spend_usd AS decimal(12,2)) AS spend_usd, CAST(d.impressions AS int) AS impressions, CAST(d.clicks AS int) AS clicks,
  CAST(d.purchases_reported AS int) AS platform_conversions,
  CAST(d.revenue_reported_usd AS decimal(12,2)) AS platform_revenue_usd,
  CAST(d.budget_lost_share AS decimal(5,2)) AS lost_to_budget_share
FROM meta_pg.adset_daily d
UNION ALL
SELECT CAST(concat(g.campaign_id, '|', CAST(g.report_date AS string)) AS varchar(60)),
  g.report_date, CAST(g.campaign_id AS varchar(40)),
  CAST(g.cost_usd AS decimal(12,2)), CAST(g.impressions AS int), CAST(g.clicks AS int),
  CAST(g.conversions_reported AS int),
  CAST(g.conv_value_reported_usd AS decimal(12,2)),
  CAST(g.search_lost_is_budget AS decimal(5,2))
FROM google_pg.campaign_daily g;

-- Activate daily_backend_revenue: attributed orders rolled up per ad line per day; no customer columns leave rev_pg.
ACTIVATE USL TABLE lightning.metastore.autopilot_usl.adspend.daily_backend_revenue AS
SELECT CAST(concat(o.utm_id, '|', CAST(to_date(o.ordered_at) AS string)) AS varchar(60)) AS revenue_key,
  to_date(o.ordered_at) AS order_date, CAST(o.utm_id AS varchar(40)) AS line_id,
  CAST(o.utm_source AS varchar(10)) AS platform, count(*) AS orders,
  CAST(sum(o.revenue_usd) AS decimal(12,2)) AS revenue_usd
FROM rev_pg.orders o
WHERE o.utm_id <> ''
GROUP BY o.utm_id, o.utm_source, to_date(o.ordered_at);

-- Describe the model for people browsing the USL in the Zetaris UI.
UPDATE USL lightning.metastore.autopilot_usl.adspend.daily_delivery SET TABLE DESCRIPTION Meta ad sets and Google campaigns in one daily shape: spend, clicks, platform-reported conversions and revenue, share of delivery lost to budget (0..1);

-- Describe the backend table, including what it deliberately leaves out.
UPDATE USL lightning.metastore.autopilot_usl.adspend.daily_backend_revenue SET TABLE DESCRIPTION Backend orders and revenue per ad line per day from rev_pg.orders (UTM attributed). No customer identifier or personal data;

-- Custom DQ rule: a delivery row is plausible only if money and counts are non-negative and the
-- lost-to-budget share is a real share. Catches unit mix-ups (e.g. 45 instead of 0.45) and sign errors.
REGISTER DQ delivery_sane TABLE lightning.metastore.autopilot_usl.adspend.daily_delivery AS
spend_usd >= 0 AND clicks >= 0 AND platform_revenue_usd >= 0 AND lost_to_budget_share BETWEEN 0 AND 1;

-- Custom DQ rule on backend revenue: every attributed day has at least one order and positive revenue.
REGISTER DQ backend_positive TABLE lightning.metastore.autopilot_usl.adspend.daily_backend_revenue AS
orders > 0 AND revenue_usd > 0;

-- Signal rule (not a defect check): a day is "invalid" when half or more of eligible delivery was lost
-- to budget. RUN DQ then counts budget-starved line-days, and SHOW DQ INVALID RECORD lists them.
REGISTER DQ budget_headroom TABLE lightning.metastore.autopilot_usl.adspend.daily_delivery AS
lost_to_budget_share < 0.5;
