-- =============================================================================
-- Queries through the ACTIVE USL lightning.metastore.autopilot_usl.adspend.
-- None of these name a source system: the USL hides that Meta and Google use different
-- tables, keys and column names, and that backend revenue comes from an order book with PII.
-- Run:  npm run zetaris:usl -- --only queries
-- Q1-Q3 read each USL table at most once per query: on Zetaris 2.4.3.1, a query that reads the same
-- SOURCE table twice can get the first read's rows for both reads. Q4 deliberately reads the same USL
-- table twice and was checked against Postgres: through the USL it is correct (see Q4's comment).
-- Window: the autopilot's default as-of date is 2026-10-19, so "last 7 days" = 2026-10-12 .. 2026-10-18.
-- =============================================================================

-- Q1 Backend vs platform ROAS per ad line, last 7 days: what the platforms claim vs what the order book shows.
SELECT l.platform, l.line_id, l.line_name, l.daily_budget_usd,
  d.spend_7, d.platform_revenue_7, coalesce(b.backend_revenue_7, 0) AS backend_revenue_7,
  round(d.platform_revenue_7 / d.spend_7, 2) AS platform_roas_7,
  round(coalesce(b.backend_revenue_7, 0) / d.spend_7, 2) AS backend_roas_7,
  d.avg_lost_to_budget_7
FROM lightning.metastore.autopilot_usl.adspend.ad_line l
JOIN (
  SELECT line_id, sum(spend_usd) AS spend_7, sum(platform_revenue_usd) AS platform_revenue_7,
    round(avg(lost_to_budget_share), 3) AS avg_lost_to_budget_7
  FROM lightning.metastore.autopilot_usl.adspend.daily_delivery
  WHERE report_date BETWEEN DATE '2026-10-12' AND DATE '2026-10-18'
  GROUP BY line_id
) d ON d.line_id = l.line_id
LEFT JOIN (
  SELECT line_id, sum(revenue_usd) AS backend_revenue_7
  FROM lightning.metastore.autopilot_usl.adspend.daily_backend_revenue
  WHERE order_date BETWEEN DATE '2026-10-12' AND DATE '2026-10-18'
  GROUP BY line_id
) b ON b.line_id = l.line_id
ORDER BY l.platform, l.line_id;

-- Q2 Cross-platform totals over the full 28 days: how much each platform over-reports revenue.
SELECT d.platform, d.lines, d.spend, d.platform_revenue, b.backend_revenue,
  round(d.platform_revenue / d.spend, 2) AS platform_roas, round(b.backend_revenue / d.spend, 2) AS backend_roas,
  round(d.platform_revenue / b.backend_revenue, 2) AS platform_over_backend
FROM (
  SELECT l.platform, count(DISTINCT l.line_id) AS lines, sum(x.spend_usd) AS spend, sum(x.platform_revenue_usd) AS platform_revenue
  FROM lightning.metastore.autopilot_usl.adspend.daily_delivery x
  JOIN lightning.metastore.autopilot_usl.adspend.ad_line l ON l.line_id = x.line_id
  GROUP BY l.platform
) d
JOIN (
  SELECT platform, sum(revenue_usd) AS backend_revenue
  FROM lightning.metastore.autopilot_usl.adspend.daily_backend_revenue
  GROUP BY platform
) b ON b.platform = d.platform
ORDER BY d.platform;

-- Q3 Budget-starved but backend-profitable: lines that lost >= 30% of delivery to budget on 3+ of the last 7 days.
SELECT l.platform, l.line_id, l.line_name, l.daily_budget_usd, d.capped_days_7, d.spend_7,
  round(b.backend_revenue_7 / d.spend_7, 2) AS backend_roas_7
FROM lightning.metastore.autopilot_usl.adspend.ad_line l
JOIN (
  SELECT line_id, sum(CASE WHEN lost_to_budget_share >= 0.3 THEN 1 ELSE 0 END) AS capped_days_7, sum(spend_usd) AS spend_7
  FROM lightning.metastore.autopilot_usl.adspend.daily_delivery
  WHERE report_date BETWEEN DATE '2026-10-12' AND DATE '2026-10-18'
  GROUP BY line_id
) d ON d.line_id = l.line_id
JOIN (
  SELECT line_id, sum(revenue_usd) AS backend_revenue_7
  FROM lightning.metastore.autopilot_usl.adspend.daily_backend_revenue
  WHERE order_date BETWEEN DATE '2026-10-12' AND DATE '2026-10-18'
  GROUP BY line_id
) b ON b.line_id = l.line_id
WHERE d.capped_days_7 >= 3
ORDER BY backend_roas_7 DESC;

-- Q4 Week-over-week spend per ad line: the same USL table read twice in one query (two grouped subqueries).
-- Checked live 2026-10-27: this returns the correct previous-week spend (matches psql on metadb/googledb, e.g.
-- 23851190004 5410.80 vs 5903.77). The SAME shape written against the raw source meta_pg.adset_daily
-- returned spend_prev = spend for every ad set (the repeated-read bug). One test, not a guarantee.
SELECT a.line_id, a.spend AS spend_last7, b.spend AS spend_prev7, round(a.spend - b.spend, 2) AS change
FROM (
  SELECT line_id, sum(spend_usd) AS spend FROM lightning.metastore.autopilot_usl.adspend.daily_delivery
  WHERE report_date BETWEEN DATE '2026-10-12' AND DATE '2026-10-18' GROUP BY line_id
) a
JOIN (
  SELECT line_id, sum(spend_usd) AS spend FROM lightning.metastore.autopilot_usl.adspend.daily_delivery
  WHERE report_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-11' GROUP BY line_id
) b ON b.line_id = a.line_id
ORDER BY a.line_id;
