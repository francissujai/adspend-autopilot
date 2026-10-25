-- =============================================================================
-- Ad Spend Autopilot: register the three sources in Zetaris (run as an admin).
--   meta_pg    Meta Ads export   (autopilot-pg:5432/metadb)
--   google_pg  Google Ads export (autopilot-pg:5432/googledb)
--   rev_pg     orders + customers, the business's own truth (autopilot-pg:5432/revdb)
-- plus governed views in the schemastore container "autopilot" that expose
-- revenue WITHOUT any customer identifier.
--
-- From a zetaris-getting-started checkout:
--   python scripts/run_sql.py <path>/01_sources_create.sql --dry-run
--   python scripts/run_sql.py <path>/01_sources_create.sql          (--skip-exists to re-run)
-- The password is the local-only dev default from data/docker-compose.yml.
-- =============================================================================

CREATE DATASOURCE meta_pg DESCRIBE BY "Meta Ads export - campaigns, ad sets, daily delivery, notes" OPTIONS (
  jdbcdriver "org.postgresql.Driver",
  jdbcurl "jdbc:postgresql://autopilot-pg:5432/metadb",
  username "autopilot",
  password "autopilot_local_dev",
  fetchsize "1000"
);

REGISTER DATASOURCE TABLES FROM meta_pg;

CREATE DATASOURCE google_pg DESCRIBE BY "Google Ads export - campaigns and daily delivery" OPTIONS (
  jdbcdriver "org.postgresql.Driver",
  jdbcurl "jdbc:postgresql://autopilot-pg:5432/googledb",
  username "autopilot",
  password "autopilot_local_dev",
  fetchsize "1000"
);

REGISTER DATASOURCE TABLES FROM google_pg;

CREATE DATASOURCE rev_pg DESCRIBE BY "Orders and customers - backend truth, contains personal data" OPTIONS (
  jdbcdriver "org.postgresql.Driver",
  jdbcurl "jdbc:postgresql://autopilot-pg:5432/revdb",
  username "autopilot",
  password "autopilot_local_dev",
  fetchsize "1000"
);

REGISTER DATASOURCE TABLES FROM rev_pg;

CREATE SCHEMASTORE CONTAINER autopilot;

CREATE SCHEMASTORE VIEW orders_attributed WITH CONTAINER autopilot AS
SELECT order_id, ordered_at, utm_source, utm_id, revenue_usd
FROM rev_pg.orders;

CREATE SCHEMASTORE VIEW revenue_by_line_daily WITH CONTAINER autopilot AS
SELECT to_date(ordered_at) AS order_date, utm_source, utm_id, count(*) AS orders, round(sum(revenue_usd), 2) AS revenue_usd
FROM rev_pg.orders
WHERE utm_id <> ''
GROUP BY to_date(ordered_at), utm_source, utm_id;
