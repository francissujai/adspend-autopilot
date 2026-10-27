-- =============================================================================
-- Exploration: meta_pg (Meta Ads export: campaigns, adsets, adset_daily, campaign_notes)
-- Run with the ADMIN key:  npm run zetaris:usl -- --only explore
-- Results below were captured live on 2026-10-27 (Zetaris 2.4.3.1, local Docker).
-- =============================================================================

-- Meta coverage: how many daily rows, ad sets and days, and the headline totals.
-- Intent: confirm the grain (one row per ad set per day) and the date window before modelling.
SELECT count(*) AS rows_, count(DISTINCT adset_id) AS adsets, min(report_date) AS first_day, max(report_date) AS last_day,
  round(sum(spend_usd), 2) AS spend, round(sum(revenue_reported_usd), 2) AS platform_revenue
FROM meta_pg.adset_daily;
-- Result: 140 rows = 5 ad sets x 28 days (2026-09-21 .. 2026-10-18); spend 91,237.29; Meta-reported revenue 277,576.20.
-- Grain confirmed: (report_date, adset_id) is unique, so the ad set is Meta's "ad line".

-- Meta ad sets with their campaign, budget, spend and platform-reported ROAS.
-- Intent: find the ad-line key and the hierarchy (campaign -> ad set) that the USL must flatten.
SELECT c.campaign_name, a.adset_id, a.adset_name, a.daily_budget_usd,
  round(sum(d.spend_usd), 2) AS spend, round(sum(d.revenue_reported_usd) / sum(d.spend_usd), 2) AS platform_roas
FROM meta_pg.adset_daily d
JOIN meta_pg.adsets a ON a.adset_id = d.adset_id
JOIN meta_pg.campaigns c ON c.campaign_id = a.campaign_id
GROUP BY c.campaign_name, a.adset_id, a.adset_name, a.daily_budget_usd
ORDER BY a.adset_id;
-- Result (platform ROAS over 28 days):
--   Retargeting      23851190001 Cart Abandoners        budget 600   spend 16,458.59  ROAS 5.45
--   Retargeting      23851190002 Site Visitors 30d      budget 500   spend 11,552.25  ROAS 3.72
--   Prospecting      23851190003 Lookalike 3%           budget 1500  spend 33,812.43  ROAS 2.03
--   Prospecting      23851190004 Interests: Analytics   budget 900   spend 21,951.99  ROAS 2.78
--   Creative Testing 23851190005 UGC Video              budget 300   spend  7,462.03  ROAS 2.04
-- Budget lives on the ad set (not the campaign) in Meta, so ad_line.daily_budget_usd comes from adsets.

-- Budget pressure per ad set: days where at least 30% of eligible delivery was lost to budget.
-- Intent: check the range of budget_lost_share (must be a 0..1 share) before writing a DQ rule on it.
SELECT adset_id, count(*) AS days,
  sum(CASE WHEN budget_lost_share >= 0.3 THEN 1 ELSE 0 END) AS budget_capped_days,
  round(avg(budget_lost_share), 3) AS avg_lost_share, min(budget_lost_share) AS min_lost, max(budget_lost_share) AS max_lost
FROM meta_pg.adset_daily
GROUP BY adset_id
ORDER BY adset_id;
-- Result: 23851190001 is budget-capped 26 of 28 days (avg 0.446); ...0004 10 days; ...0005 12 days;
-- ...0002 3 days; ...0003 none. All values lie in 0..0.60, so "lost_to_budget_share BETWEEN 0 AND 1" is a fair DQ rule.
