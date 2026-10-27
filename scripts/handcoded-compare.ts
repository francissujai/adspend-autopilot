// The same answer as USL query Q1 (data/zetaris/usl_queries.sql), built by hand:
// query the three Postgres databases directly and join them in code.
// No new dependencies: each query shells out to `docker exec <container> psql`.
//
//   npm run zetaris:handcoded                 hand-coded result, then the USL result and a cell-by-cell diff
//   npm run zetaris:handcoded -- --no-usl     hand-coded path only
//
// Env: AUTOPILOT_PG_CONTAINER (default autopilot-pg). The USL side uses ZETARIS_API_KEY (admin).
// Window: 2026-10-12 .. 2026-10-18 (the autopilot's last-7-days window for as-of 2026-10-19).

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { env, ROOT } from "../src/env.ts";
import { printTable, runSql, splitSql } from "./zetaris-usl.ts";

const FROM = "2026-10-12";
const TO = "2026-10-18";
const COLUMNS = ["platform", "line_id", "line_name", "daily_budget_usd", "spend_7", "platform_revenue_7", "backend_revenue_7", "platform_roas_7", "backend_roas_7", "avg_lost_to_budget_7"];

// ---- hand-coded pipeline: begin ------------------------------------------------
const exec = promisify(execFile);
const CONTAINER = env("AUTOPILOT_PG_CONTAINER", "autopilot-pg");

/** One query against one database, as tab-separated rows. */
async function psql(db: string, sql: string): Promise<string[][]> {
  const { stdout } = await exec("docker", ["exec", CONTAINER, "psql", "-U", "autopilot", "-d", db, "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.split("\n").filter((l) => l.length).map((l) => l.split("\t"));
}

const cents = (s: string) => Math.round(Number(s) * 100);
const round = (x: number, dp: number) => Math.round(x * 10 ** dp + 1e-9) / 10 ** dp; // half-up, as SQL round()

interface Line { platform: string; id: string; name: string; budget: number; spend: number; platRev: number; backRev: number; lostSum: number; days: number }

export async function handCoded(): Promise<unknown[][]> {
  const window = `BETWEEN DATE '${FROM}' AND DATE '${TO}'`;
  // 5 queries over 3 databases, in parallel. Orders come back row by row: the join and rollup happen here.
  const [metaLines, googleLines, metaDaily, googleDaily, orders] = await Promise.all([
    psql("metadb", "SELECT adset_id, adset_name, daily_budget_usd FROM adsets"),
    psql("googledb", "SELECT campaign_id, campaign_name, daily_budget_usd FROM campaigns"),
    psql("metadb", `SELECT adset_id, spend_usd, revenue_reported_usd, budget_lost_share FROM adset_daily WHERE report_date ${window}`),
    psql("googledb", `SELECT campaign_id, cost_usd, conv_value_reported_usd, search_lost_is_budget FROM campaign_daily WHERE report_date ${window}`),
    psql("revdb", `SELECT utm_id, revenue_usd FROM orders WHERE utm_id <> '' AND ordered_at::date ${window}`),
  ]);

  // Unify Meta ad sets and Google campaigns into one "ad line" shape (amounts in integer cents).
  const lines = new Map<string, Line>();
  for (const [platform, rows] of [["meta", metaLines], ["google", googleLines]] as const) {
    for (const [id, name, budget] of rows) lines.set(id, { platform, id, name, budget: Number(budget), spend: 0, platRev: 0, backRev: 0, lostSum: 0, days: 0 });
  }
  for (const [id, spend, rev, lost] of [...metaDaily, ...googleDaily]) {
    const l = lines.get(id);
    if (!l) throw new Error(`delivery row for unknown ad line ${id}`); // the FK check, by hand
    l.spend += cents(spend);
    l.platRev += cents(rev);
    l.lostSum += cents(lost);
    l.days++;
  }
  for (const [utmId, revenue] of orders) {
    const l = lines.get(utmId);
    if (!l) throw new Error(`order attributed to unknown ad line ${utmId}`);
    l.backRev += cents(revenue);
  }
  return [...lines.values()]
    .filter((l) => l.days > 0)
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.id.localeCompare(b.id))
    .map((l) => [l.platform, l.id, l.name, l.budget, l.spend / 100, l.platRev / 100, l.backRev / 100,
      round(l.platRev / l.spend, 2), round(l.backRev / l.spend, 2), round(l.lostSum / 100 / l.days, 3)]);
}
// ---- hand-coded pipeline: end --------------------------------------------------

async function main() {
  const t0 = performance.now();
  const hand = await handCoded();
  const handMs = Math.round(performance.now() - t0);
  console.log(`\nHand-coded (3 Postgres databases via docker exec psql, joined in TypeScript): ${handMs} ms`);
  printTable(COLUMNS, hand);
  if (process.argv.includes("--no-usl")) return;

  const q1 = splitSql(fs.readFileSync(path.join(ROOT, "data", "zetaris", "usl_queries.sql"), "utf-8"))[0];
  const t1 = performance.now();
  const usl = await runSql(q1.sql);
  const uslMs = Math.round(performance.now() - t1);
  console.log(`\nUSL Q1 (one SQL statement over lightning.metastore.autopilot_usl.adspend): ${uslMs} ms (server-reported ${usl.ms} ms)`);
  printTable(usl.columns, usl.rows);

  const byId = new Map(usl.rows.map((r) => [String(r[1]), r]));
  let diffs = 0;
  for (const h of hand) {
    const u = byId.get(String(h[1]));
    if (!u) {
      diffs++;
      console.log(`  missing in USL: ${h[1]}`);
      continue;
    }
    h.forEach((v, i) => {
      const same = typeof v === "number" ? Math.abs(v - Number(u[i])) < 1e-6 : String(v) === String(u[i]);
      if (!same) {
        diffs++;
        console.log(`  DIFF ${h[1]} ${COLUMNS[i]}: hand-coded ${v} vs USL ${u[i]}`);
      }
    });
  }
  const cells = hand.length * COLUMNS.length;
  console.log(`\nCompared ${hand.length} lines x ${COLUMNS.length} columns = ${cells} cells: ${diffs === 0 ? "ALL MATCH" : `${diffs} difference(s)`}${usl.rows.length !== hand.length ? ` (row counts differ: ${hand.length} vs ${usl.rows.length})` : ""}.`);
  console.log(`Wall clock: hand-coded ${handMs} ms, USL ${uslMs} ms.`);
  process.exitCode = diffs ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
