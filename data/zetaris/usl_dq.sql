-- =============================================================================
-- Data quality on the USL lightning.metastore.autopilot_usl.adspend.
-- Rules are registered in usl_create.sql; this file only lists and runs them.
-- Run:  npm run zetaris:usl -- --only dq
-- =============================================================================

-- Every rule on the model: key constraints generated from the DDL plus the custom rules.
LIST DQ USL lightning.metastore.autopilot_usl.adspend;

-- Custom rule delivery_sane: spend/clicks/revenue non-negative and lost_to_budget_share is a 0..1 share.
RUN DQ delivery_sane TABLE lightning.metastore.autopilot_usl.adspend.daily_delivery;

-- Foreign key generated from the DDL: every delivery row's line_id exists in ad_line.
RUN DQ line_id TABLE lightning.metastore.autopilot_usl.adspend.daily_delivery;

-- Foreign key generated from the DDL: every backend revenue row's line_id (UTM) exists in ad_line.
RUN DQ line_id TABLE lightning.metastore.autopilot_usl.adspend.daily_backend_revenue;

-- Primary keys generated from the DDL: one row per line per day, one row per line.
RUN DQ delivery_key TABLE lightning.metastore.autopilot_usl.adspend.daily_delivery;

-- Primary key on the backend fact table.
RUN DQ revenue_key TABLE lightning.metastore.autopilot_usl.adspend.daily_backend_revenue;

-- Primary key on the ad line dimension.
RUN DQ line_id TABLE lightning.metastore.autopilot_usl.adspend.ad_line;

-- Custom rule backend_positive: every attributed line-day has orders and positive revenue.
RUN DQ backend_positive TABLE lightning.metastore.autopilot_usl.adspend.daily_backend_revenue;

-- Signal rule budget_headroom (expected to flag rows): days that lost >= 50% of delivery to budget.
RUN DQ budget_headroom TABLE lightning.metastore.autopilot_usl.adspend.daily_delivery;

-- The flagged rows themselves, for the budget_headroom rule.
SHOW DQ INVALID RECORD budget_headroom TABLE lightning.metastore.autopilot_usl.adspend.daily_delivery;
