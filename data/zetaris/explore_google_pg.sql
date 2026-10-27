-- =============================================================================
-- Exploration: google_pg (Google Ads export: campaigns, campaign_daily)
-- Run with the ADMIN key:  npm run zetaris:usl -- --only explore
-- Results below were captured live on 2026-10-27 (Zetaris 2.4.3.1, local Docker).
-- =============================================================================

-- Google coverage: rows, campaigns, date window and headline totals.
-- Intent: confirm the grain and that the window lines up with Meta's (needed for one unified delivery table).
SELECT count(*) AS rows_, count(DISTINCT campaign_id) AS campaigns, min(report_date) AS first_day, max(report_date) AS last_day,
  round(sum(cost_usd), 2) AS cost, round(sum(conv_value_reported_usd), 2) AS platform_conv_value
FROM google_pg.campaign_daily;
-- Result: 112 rows = 4 campaigns x 28 days (2026-09-21 .. 2026-10-18), same window as Meta;
-- cost 90,640.91; Google-reported conversion value 253,885.08.
-- Google's ad line is the campaign, and the column names differ from Meta (cost_usd vs spend_usd,
-- conv_value_reported_usd vs revenue_reported_usd, search_lost_is_budget vs budget_lost_share).

-- Google campaigns by channel type: cost, CPC and platform-reported ROAS.
-- Intent: understand the hierarchy (the campaign is both the ad line and the budget holder) and spot outliers.
SELECT c.channel_type, c.campaign_id, c.campaign_name, c.daily_budget_usd,
  round(sum(d.cost_usd), 2) AS cost, round(sum(d.cost_usd) / sum(d.clicks), 2) AS cpc,
  round(sum(d.conv_value_reported_usd) / sum(d.cost_usd), 2) AS platform_roas
FROM google_pg.campaign_daily d
JOIN google_pg.campaigns c ON c.campaign_id = d.campaign_id
GROUP BY c.channel_type, c.campaign_id, c.campaign_name, c.daily_budget_usd
ORDER BY c.campaign_id;
-- Result:
--   SEARCH  g-1001 Search - Brand              budget  800  cost 18,809.18  CPC 1.34  ROAS 6.37
--   SEARCH  g-1002 Search - Generic Analytics  budget 1200  cost 28,206.74  CPC 3.37  ROAS 2.11
--   DISPLAY g-1003 Display - Broad Awareness   budget 1000  cost 22,601.29  CPC 0.56  ROAS 0.84
--   PMAX    g-1004 PMax - Catalog              budget  900  cost 21,023.70  CPC 1.11  ROAS 2.65
-- Display is the only line below break-even even on Google's own numbers.

-- Budget pressure per campaign (search impression share lost to budget).
-- Intent: check the value range so Meta's and Google's "lost to budget" can share one column and one DQ rule.
SELECT campaign_id,
  sum(CASE WHEN search_lost_is_budget >= 0.3 THEN 1 ELSE 0 END) AS budget_capped_days,
  round(avg(search_lost_is_budget), 3) AS avg_lost_is_budget, max(search_lost_is_budget) AS max_lost,
  round(avg(cost_usd), 2) AS avg_daily_cost
FROM google_pg.campaign_daily
GROUP BY campaign_id
ORDER BY campaign_id;
-- Result: g-1001 2 capped days (avg 0.043), g-1002 5 (avg 0.097), g-1003 0 (avg 0.010), g-1004 3 (avg 0.064); max 0.62.
-- Same 0..1 share semantics as Meta's budget_lost_share, so both unify into lost_to_budget_share.
