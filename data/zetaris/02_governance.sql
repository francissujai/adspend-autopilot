-- =============================================================================
-- Ad Spend Autopilot: least-privilege role for the agent (run as an admin).
-- The agent may read ad delivery data and revenue WITHOUT customer identity.
-- It is never granted rev_pg (orders with customer_id, customers with PII).
--
-- After this script: in the Zetaris UI create a user for the agent
-- (Management -> Users), then:
--   ASSIGN USER '<agent email>' TO ROLE 'autopilot_agent'
-- sign in as that user and create its API key (Management -> API Tokens).
-- That key goes in AUTOPILOT_ZETARIS_API_KEY.
-- =============================================================================

CREATE ROLE 'autopilot_agent' DESCRIBE BY 'Ad Spend Autopilot - read-only ad delivery and revenue, no personal data';

ASSIGN DATASOURCE meta_pg, google_pg TO ROLE 'autopilot_agent';

GRANT SELECT ON DATASOURCE TABLE meta_pg.campaigns TO ROLE 'autopilot_agent';

GRANT SELECT ON DATASOURCE TABLE meta_pg.adsets TO ROLE 'autopilot_agent';

GRANT SELECT ON DATASOURCE TABLE meta_pg.adset_daily TO ROLE 'autopilot_agent';

GRANT SELECT ON DATASOURCE TABLE meta_pg.campaign_notes TO ROLE 'autopilot_agent';

GRANT SELECT ON DATASOURCE TABLE google_pg.campaigns TO ROLE 'autopilot_agent';

GRANT SELECT ON DATASOURCE TABLE google_pg.campaign_daily TO ROLE 'autopilot_agent';

GRANT SELECT ON VIEW TABLE autopilot.orders_attributed TO ROLE 'autopilot_agent';

GRANT SELECT ON VIEW TABLE autopilot.revenue_by_line_daily TO ROLE 'autopilot_agent';
