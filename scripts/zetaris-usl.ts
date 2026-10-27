// Runs the Zetaris Unified Semantic Layer (USL) deliverables against the local
// Zetaris REST API with the ADMIN key (ZETARIS_API_KEY) and prints every
// result as a table:
//   1. data/zetaris/explore_{meta,google,rev}_pg.sql   exploratory queries
//   2. data/zetaris/usl_create.sql                     namespace, COMPILE, ACTIVATE, DQ  (only with --create)
//   3. RUN DQ / LIST DQ                                 data-quality counts
//   4. data/zetaris/usl_queries.sql                    queries through the active USL
//
//   npm run zetaris:usl                      explore + DQ + queries (read-mostly; RUN DQ only reads)
//   npm run zetaris:usl -- --create          also (re)builds the USL first (idempotent-ish:
//                                            "already exists" errors are reported and skipped)
//   npm run zetaris:usl -- --only queries    one phase: explore | create | dq | queries
//   npm run zetaris:usl -- --sql "SHOW NAMESPACES OR TABLES IN lightning.metastore"
//
// SQL files are split on a ";" that ends a line. A COMPILE USL statement keeps
// every following "CREATE TABLE" chunk, so a multi-table compile goes to
// Zetaris as ONE request (sending each table separately does not work).

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, ROOT } from "../src/env.ts";
import { normalise } from "../src/zetaris/client.ts";

const URL_BASE = env("ZETARIS_REST_URL", "http://localhost:8888/api/v1.0").replace(/\/+$/, "");
const KEY = env("ZETARIS_API_KEY");
const ORG = env("ZETARIS_ORG_ID", "1");
const DIR = path.join(ROOT, "data", "zetaris");

export interface Result {
  columns: string[];
  rows: unknown[][];
  ms: number;
}

/** Sends one statement as-is (no read-only guard: this is the admin modelling path). */
export async function runSql(sql: string, limit = 500): Promise<Result> {
  const t0 = Date.now();
  const res = await fetch(`${URL_BASE}/sql-editor/sqls/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "X-Org-ID": ORG,
      "X-Request-ID": randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ queryId: randomUUID(), sql, source: "SqlEditor", limit }),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  const body = JSON.parse(text || "null") as Record<string, unknown> | null;
  return { ...normalise(body), ms: Date.now() - t0 };
}

export interface Statement {
  title: string; // first comment line above the statement
  sql: string;
}

/** Splits a SQL file into statements; keeps a multi-table COMPILE USL whole. */
export function splitSql(text: string): Statement[] {
  const chunks: { title: string; body: string[] }[] = [];
  let title = "";
  let body: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("--")) {
      if (!body.length && !title && !/^--\s*(=|-){3,}/.test(t)) title = t.replace(/^--\s*/, "");
      continue;
    }
    if (!t && !body.length) {
      title = ""; // a blank line ends a comment block; the title is the block right above the statement
      continue;
    }
    body.push(line);
    if (/;\s*$/.test(t)) {
      chunks.push({ title, body });
      title = "";
      body = [];
    }
  }
  if (body.join("").trim()) chunks.push({ title, body });

  const out: Statement[] = [];
  for (const c of chunks) {
    const sql = c.body.join("\n").trim().replace(/;\s*$/, "");
    const prev = out[out.length - 1];
    if (prev && /^COMPILE\s+USL\b/i.test(prev.sql) && /^CREATE\s+TABLE\b/i.test(sql)) {
      prev.sql += `;\n${sql}`;
      continue;
    }
    out.push({ title: c.title, sql });
  }
  return out;
}

const fmt = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function printTable(columns: string[], rows: unknown[][], max = 40): void {
  if (!columns.length) {
    console.log("  (no columns returned)");
    return;
  }
  const shown = rows.slice(0, max).map((r) => r.map((v) => {
    const s = fmt(v);
    return s.length > 120 ? `${s.slice(0, 117)}...` : s;
  }));
  const widths = columns.map((c, i) => Math.max(c.length, ...shown.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => `  ${cells.map((c, i) => (c ?? "").padEnd(widths[i])).join(" | ")}`;
  console.log(line(columns));
  console.log(`  ${widths.map((w) => "-".repeat(w)).join("-+-")}`);
  for (const r of shown) console.log(line(r));
  console.log(`  (${rows.length} row${rows.length === 1 ? "" : "s"}${rows.length > max ? `, first ${max} shown` : ""})`);
}

const ALREADY = /already exist|exists already|duplicate/i;

async function runFile(file: string, opts: { tolerateExists?: boolean } = {}): Promise<number> {
  const full = path.join(DIR, file);
  const stmts = splitSql(fs.readFileSync(full, "utf-8"));
  console.log(`\n=== ${file} (${stmts.length} statements) ===`);
  let failures = 0;
  for (const [i, s] of stmts.entries()) {
    const head = s.sql.split("\n")[0].slice(0, 110);
    console.log(`\n[${i + 1}/${stmts.length}] ${s.title || head}`);
    if (s.title) console.log(`  > ${head}${s.sql.includes("\n") ? " ..." : ""}`);
    try {
      const r = await runSql(s.sql);
      printTable(r.columns, r.rows);
      console.log(`  ${r.ms} ms`);
    } catch (err) {
      const msg = (err as Error).message;
      if (opts.tolerateExists && ALREADY.test(msg)) {
        console.log(`  skipped (already exists): ${msg.slice(0, 200)}`);
      } else {
        failures++;
        console.log(`  ERROR: ${msg.slice(0, 600)}`);
      }
    }
  }
  return failures;
}

async function main() {
  const args = process.argv.slice(2);
  const sqlIdx = args.indexOf("--sql");
  if (sqlIdx >= 0) {
    const r = await runSql(args[sqlIdx + 1]);
    printTable(r.columns, r.rows, 200);
    console.log(`  ${r.ms} ms`);
    return;
  }
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;
  const want = (phase: string) => (only ? only === phase : phase !== "create" || args.includes("--create"));

  console.log(`Zetaris ${URL_BASE} (admin key)`);
  const t0 = Date.now();
  let failures = 0;
  if (want("explore")) for (const f of ["explore_meta_pg.sql", "explore_google_pg.sql", "explore_rev_pg.sql"]) failures += await runFile(f);
  if (want("create")) failures += await runFile("usl_create.sql", { tolerateExists: true });
  if (want("dq")) failures += await runFile("usl_dq.sql");
  if (want("queries")) failures += await runFile("usl_queries.sql");
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${failures} failed statement(s).`);
  process.exitCode = failures ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
