-- =============================================================================
-- Exploration: rev_pg (backend truth: orders with UTM attribution, customers with personal data)
-- ADMIN key only: the autopilot_agent role is never granted rev_pg (data/zetaris/02_governance.sql).
-- Run:  npm run zetaris:usl -- --only explore
-- Results below were captured live on 2026-10-27 (Zetaris 2.4.3.1, local Docker).
-- =============================================================================

-- Orders by attribution source: count, distinct ad lines, revenue, customers, window.
-- Intent: learn how orders tie back to ad lines (utm_source + utm_id) and how much revenue is unattributed.
SELECT utm_source, count(*) AS orders, count(DISTINCT utm_id) AS ad_lines, round(sum(revenue_usd), 2) AS revenue,
  count(DISTINCT customer_id) AS customers, min(ordered_at) AS first_order, max(ordered_at) AS last_order
FROM rev_pg.orders
GROUP BY utm_source
ORDER BY revenue DESC;
-- Result: google 2,564 orders / 4 lines / 219,049.94; meta 2,343 / 5 lines / 201,320.96;
-- organic 1,194 / 102,807.18 and direct 771 / 65,209.52 (utm_id is empty for both). Same 28-day window.
-- So utm_id = Meta adset_id or Google campaign_id; organic/direct rows are excluded from ad-line revenue.

-- Cross-source orphan check: attributed orders whose utm_id matches neither a Meta ad set nor a Google campaign.
-- Intent: one federated join across all three sources, to confirm utm_id is a clean foreign key
-- before declaring it one in the USL.
SELECT o.utm_source, o.utm_id, count(*) AS orders
FROM rev_pg.orders o
LEFT JOIN meta_pg.adsets m ON m.adset_id = o.utm_id
LEFT JOIN google_pg.campaigns g ON g.campaign_id = o.utm_id
WHERE o.utm_id <> '' AND m.adset_id IS NULL AND g.campaign_id IS NULL
GROUP BY o.utm_source, o.utm_id;
-- Result: 0 rows. Every attributed order points at a known ad line, so the USL foreign key
-- (daily_backend_revenue.line_id -> ad_line.line_id) is expected to pass DQ.

-- Where the personal data is: customers by country joined to their orders.
-- Intent: show what the semantic layer must NOT expose. The USL backend-revenue table is built
-- without customer_id / email / full_name.
SELECT c.country, count(DISTINCT c.customer_id) AS customers, count(o.order_id) AS orders, round(sum(o.revenue_usd), 2) AS revenue
FROM rev_pg.customers c
LEFT JOIN rev_pg.orders o ON o.customer_id = c.customer_id
GROUP BY c.country
ORDER BY revenue DESC;
-- Result: US 1,680 customers / 2,678 orders / 229,653.26; GB 840 / 1,426 / 122,550.71;
-- CA 840 / 1,390 / 119,112.15; AU 840 / 1,378 / 117,071.48. 4,200 customers, each with email + full name (PII).
