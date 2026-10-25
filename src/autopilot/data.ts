// What the autopilot knows, read through Zetaris as the autopilot_agent role.
// Every query becomes an evidence item: the exact SQL, the rows, and a
// SHA-256 of the rows, so a decision record can prove what it was based on
// and a replay can re-derive the decision from the same snapshot.

import { createHash } from "node:crypto";
import { env } from "../env.ts";
import { ZetarisClient, type SqlRunner } from "../zetaris/client.ts";
import { canonicalJson } from "../engines/scout/index.ts";

export interface Evidence {
  id: string; // E1, E2, ...
  purpose: string;
  sql: string;
  columns: string[];
  rows: unknown[][];
  rowsSha256: string;
  ms: number;
  error?: string;
}

export interface LineMetrics {
  platform: "meta" | "google";
  id: string;
  name: string;
  dailyBudget: number;
  spend7: number;
  platformRevenue7: number;
  backendRevenue7: number;
  spend3: number;
  platformRevenue3: number;
  backendRevenue3: number;
  budgetLostShare7: number; // avg share of eligible delivery lost to budget
  platformRoas7: number;
  backendRoas7: number;
  platformRoas3: number;
  backendRoas3: number;
  evidence: string[]; // evidence ids
}

export interface Note {
  lineId: string;
  updatedAt: string;
  author: string;
  text: string;
  evidence: string;
}

export interface Snapshot {
  asOf: string;
  window: { last7: [string, string]; last3: [string, string] };
  lines: LineMetrics[];
  notes: Note[];
  evidence: Evidence[];
  governance: { probe: string; allowed: boolean; detail: string };
}

export function windows(asOf = env("AUTOPILOT_AS_OF", "2026-10-19")) {
  const d = (n: number) => new Date(Date.parse(`${asOf}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  return { asOf, last7: [d(7), d(1)] as [string, string], last3: [d(3), d(1)] as [string, string] };
}

/** The agent's own Zetaris identity (role autopilot_agent); falls back to the admin key in dev. */
export function agentClient(): SqlRunner & { identity: string } {
  const agentKey = process.env.AUTOPILOT_ZETARIS_API_KEY?.trim();
  const c = new ZetarisClient(agentKey ? { apiKey: agentKey } : {}) as ZetarisClient & { identity: string };
  c.identity = agentKey ? "autopilot_agent (least privilege)" : "admin (dev fallback: set AUTOPILOT_ZETARIS_API_KEY)";
  return c;
}

const sha = (rows: unknown[][]) => createHash("sha256").update(canonicalJson(rows)).digest("hex");
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export async function loadSnapshot(sql: SqlRunner, asOf?: string): Promise<Snapshot> {
  const w = windows(asOf);
  const evidence: Evidence[] = [];
  const run = async (purpose: string, statement: string) => {
    const id = `E${evidence.length + 1}`;
    try {
      const r = await sql.run(statement, 500);
      const ev: Evidence = { id, purpose, sql: statement, columns: r.columns, rows: r.rows, rowsSha256: sha(r.rows), ms: r.ms };
      evidence.push(ev);
      return ev;
    } catch (err) {
      const ev: Evidence = { id, purpose, sql: statement, columns: [], rows: [], rowsSha256: sha([]), ms: 0, error: (err as Error).message.slice(0, 400) };
      evidence.push(ev);
      return ev;
    }
  };
  const [s7, e7] = w.last7;
  const [s3] = w.last3;

  const meta = await run(
    "Meta ad sets: spend, platform-reported revenue and budget-limited share, last 7 and last 3 days",
    `SELECT a.adset_id AS line_id, a.adset_name AS name, a.daily_budget_usd AS daily_budget,
  sum(d.spend_usd) AS spend_7, sum(d.revenue_reported_usd) AS platform_revenue_7,
  sum(CASE WHEN d.report_date >= DATE '${s3}' THEN d.spend_usd END) AS spend_3,
  sum(CASE WHEN d.report_date >= DATE '${s3}' THEN d.revenue_reported_usd END) AS platform_revenue_3,
  round(avg(d.budget_lost_share), 3) AS budget_lost_share_7
FROM meta_pg.adset_daily d JOIN meta_pg.adsets a ON a.adset_id = d.adset_id
WHERE d.report_date BETWEEN DATE '${s7}' AND DATE '${e7}'
GROUP BY a.adset_id, a.adset_name, a.daily_budget_usd`,
  );
  const google = await run(
    "Google campaigns: cost, platform-reported conversion value and budget-lost impression share, last 7 and last 3 days",
    `SELECT c.campaign_id AS line_id, c.campaign_name AS name, c.daily_budget_usd AS daily_budget,
  sum(d.cost_usd) AS spend_7, sum(d.conv_value_reported_usd) AS platform_revenue_7,
  sum(CASE WHEN d.report_date >= DATE '${s3}' THEN d.cost_usd END) AS spend_3,
  sum(CASE WHEN d.report_date >= DATE '${s3}' THEN d.conv_value_reported_usd END) AS platform_revenue_3,
  round(avg(d.search_lost_is_budget), 3) AS budget_lost_share_7
FROM google_pg.campaign_daily d JOIN google_pg.campaigns c ON c.campaign_id = d.campaign_id
WHERE d.report_date BETWEEN DATE '${s7}' AND DATE '${e7}'
GROUP BY c.campaign_id, c.campaign_name, c.daily_budget_usd`,
  );
  const backend = await run(
    "Backend revenue by ad line from orders (governed view, no customer identity), last 7 and last 3 days",
    `SELECT utm_id AS line_id, sum(revenue_usd) AS backend_revenue_7,
  sum(CASE WHEN order_date >= DATE '${s3}' THEN revenue_usd END) AS backend_revenue_3, sum(orders) AS orders_7
FROM autopilot.revenue_by_line_daily
WHERE order_date BETWEEN DATE '${s7}' AND DATE '${e7}'
GROUP BY utm_id`,
  );
  const notesEv = await run("Campaign notes attached to Meta ad sets (untrusted text)", `SELECT adset_id AS line_id, updated_at, author, note FROM meta_pg.campaign_notes ORDER BY updated_at`);

  // Governance probe: the agent must NOT be able to read personal data.
  const probeSql = "SELECT count(*) AS n FROM rev_pg.customers";
  let governance: Snapshot["governance"];
  try {
    const r = await sql.run(probeSql, 1);
    governance = { probe: probeSql, allowed: true, detail: `readable (${r.rows[0]?.[0]} rows): the agent identity is over-privileged` };
  } catch (err) {
    governance = { probe: probeSql, allowed: false, detail: `denied by Zetaris: ${(err as Error).message.slice(0, 200)}` };
  }




  return buildSnapshot(w.asOf, evidence, governance);
}

/**
 * Pure: turns the four evidence results into metrics. Replay calls this on
 * the rows stored in the ledger, so it must depend on nothing else.
 */
export function buildSnapshot(asOf: string, evidence: Evidence[], governance: Snapshot["governance"]): Snapshot {
  const w = windows(asOf);
  const [meta, google, backend, notesEv] = evidence;
  const back = new Map(backend.rows.map((r) => [String(r[0]), { r7: num(r[1]), r3: num(r[2]) }]));
  const lines: LineMetrics[] = [];
  for (const [platform, ev] of [["meta", meta], ["google", google]] as const) {
    for (const r of ev.rows) {
      const id = String(r[0]);
      const b = back.get(id) ?? { r7: 0, r3: 0 };
      const spend7 = num(r[3]);
      const spend3 = num(r[5]);
      lines.push({
        platform,
        id,
        name: String(r[1]),
        dailyBudget: num(r[2]),
        spend7,
        platformRevenue7: num(r[4]),
        backendRevenue7: b.r7,
        spend3,
        platformRevenue3: num(r[6]),
        backendRevenue3: b.r3,
        budgetLostShare7: num(r[7]),
        platformRoas7: ratio(num(r[4]), spend7),
        backendRoas7: ratio(b.r7, spend7),
        platformRoas3: ratio(num(r[6]), spend3),
        backendRoas3: ratio(b.r3, spend3),
        evidence: [ev.id, backend.id],
      });
    }
  }
  const notes: Note[] = notesEv.rows.map((r) => ({ lineId: String(r[0]), updatedAt: String(r[1]), author: String(r[2]), text: String(r[3]), evidence: notesEv.id }));
  return { asOf: w.asOf, window: { last7: w.last7, last3: w.last3 }, lines, notes, evidence, governance };
}

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : 0);
