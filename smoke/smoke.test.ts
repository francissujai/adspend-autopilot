// Smoke tests against a running server (see SMOKE_TESTS.md).
//
//   npm run web:build && npm run serve     (in one terminal)
//   npm run smoke                          (in another)
//
// AUTOPILOT_URL picks the server (default http://127.0.0.1:4180).
// SMOKE_CYCLE=1 also runs a cycle (needs Zetaris); without it the cycle checks
// use whatever cycle the ledger already holds, and skip if there is none.
// SMOKE_REVIEW=1 also rejects the held decision. Reviews are permanent ledger
// entries, so this is opt-in.

import assert from "node:assert/strict";
import { before, test } from "node:test";

const BASE = (process.env.AUTOPILOT_URL ?? "http://127.0.0.1:4180").replace(/\/+$/, "");

interface Decision { id: string; status: string; cycleId: string; candidate: { amountUsd: number } }
interface State { running: string | null; decisions: Decision[]; cycles: { cycleId: string }[]; ledger: { verify: { ok: boolean; entries: number } } }

async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(BASE + path);
  const text = await res.text();
  return { status: res.status, body: (res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text) as T };
}

async function post<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as T };
}

/** Reads the SSE stream of a job until the server sends `event: end`. */
async function followJob(job: string): Promise<{ e: { type: string } }[]> {
  const res = await fetch(`${BASE}/api/jobs/${job}/events`);
  const text = await res.text();
  return text.split("\n").filter((l) => l.startsWith("data: ") && l !== "data: {}").map((l) => JSON.parse(l.slice(6)));
}

const latestDecisions = (s: State) => s.decisions.filter((d) => d.cycleId === s.cycles[0]?.cycleId).sort((a, b) => a.id.localeCompare(b.id));

before(async () => {
  try {
    await fetch(BASE + "/api/state", { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(`server not reachable at ${BASE}; start it with npm run serve`);
  }
});

test("dashboard HTML and its script load", async () => {
  const { status, body } = await get<string>("/");
  assert.equal(status, 200);
  assert.match(body, /<title>Ad Spend Autopilot<\/title>/);
  const script = body.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(script, "built JS bundle referenced (run npm run web:build)");
  assert.equal((await fetch(BASE + script)).status, 200);
});

test("every section URL returns the app, so deep links and refresh work", async () => {
  for (const path of ["/", "/app", "/decisions", "/ledger", "/replays"]) {
    const { status, body } = await get<string>(path);
    assert.equal(status, 200, path);
    assert.match(body, /<div id="root">/, path);
  }
});

test("a missing file is a 404, not the app", async () => {
  assert.equal((await get<string>("/robots.txt")).status, 404);
  assert.equal((await get<string>("/assets/missing.js")).status, 404);
});

test("state API answers and the ledger verifies", async () => {
  const { status, body } = await get<State>("/api/state");
  assert.equal(status, 200);
  assert.equal(body.ledger.verify.ok, true);
});

test("a cycle produces one executed, one held and one blocked decision", { skip: process.env.SMOKE_CYCLE !== "1" && "set SMOKE_CYCLE=1 (needs Zetaris)" }, async () => {
  const firstCycle = (await get<State>("/api/state")).body.cycles.length === 0;
  const { status, body } = await post<{ job: string }>("/api/cycle", { useModel: false });
  assert.equal(status, 202);
  const events = await followJob(body.job);
  assert.ok(events.some((x) => x.e.type === "cycle.done"), JSON.stringify(events.filter((x) => x.e.type === "error")));
  const statuses = latestDecisions((await get<State>("/api/state")).body).map((d) => d.status);
  // A later cycle on the same data skips moves that already executed, so the full set only appears on a fresh ledger.
  if (firstCycle) assert.deepEqual(statuses, ["auto-executed", "awaiting-approval", "blocked"]);
  else assert.ok(statuses.includes("blocked") && !statuses.includes("auto-executed"), statuses.join(","));
});

test("every decision in the latest cycle replays exactly", async (t) => {
  const s = (await get<State>("/api/state")).body;
  if (!s.cycles.length) return t.skip("no cycle in the ledger yet");
  for (const d of latestDecisions(s)) {
    const { status, body } = await get<{ match: boolean; diffs: string[]; ledger: { ok: boolean } }>(`/api/decisions/${d.id}/replay`);
    assert.equal(status, 200);
    assert.equal(body.match, true, `${d.id} diffs: ${body.diffs}`);
    assert.equal(body.ledger.ok, true);
  }
});

test("tamper demo breaks a copy and leaves the real ledger valid", async (t) => {
  const s = (await get<State>("/api/state")).body;
  if (!s.cycles.length) return t.skip("no cycle in the ledger yet");
  const { status, body } = await post<{ result: { ok: boolean }; originalStillValid: boolean }>("/api/ledger/tamper-demo", {});
  assert.equal(status, 200);
  assert.equal(body.result.ok, false);
  assert.equal(body.originalStillValid, true);
});

test("review input is validated", async () => {
  const { status } = await post("/api/decisions/D-0002/review", { outcome: "maybe" });
  assert.equal(status, 400);
});

test("rejecting the held decision records a review", { skip: process.env.SMOKE_REVIEW !== "1" && "set SMOKE_REVIEW=1 (writes a permanent ledger entry)" }, async () => {
  const s = (await get<State>("/api/state")).body;
  const held = latestDecisions(s).find((d) => d.status === "awaiting-approval");
  assert.ok(held, "a held decision in the latest cycle");
  const { status, body } = await post<{ approvalSeq: number }>(`/api/decisions/${held.id}/review`, { outcome: "rejected", by: "smoke test", note: "smoke" });
  assert.equal(status, 200);
  assert.ok(body.approvalSeq > 0);
  assert.equal((await get<State>("/api/state")).body.ledger.verify.ok, true);
});
