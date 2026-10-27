// Ad Spend Autopilot API + web UI host.
//
//   npm run serve        http://127.0.0.1:4180
//
// Binds to 127.0.0.1. Share it only through an authenticated tunnel: anyone
// who can reach it can run cycles and approve budget moves.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createPublicKey } from "node:crypto";
import { env, ROOT } from "./env.ts";
import { Autopilot, DATA_DIR, type AutopilotEvent } from "./autopilot/autopilot.ts";
import { verifyLedger, type LedgerEntry } from "./autopilot/ledger.ts";
import { SampleCycle, useSample } from "./autopilot/sample.ts";

const HOST = env("AUTOPILOT_HOST", "127.0.0.1");
const PORT = Number(env("AUTOPILOT_PORT", "4180"));
const WEB = path.join(ROOT, "web", "dist");
const EVENTS_DIR = path.join(DATA_DIR, "cycles");

interface Job {
  id: string;
  events: { t: number; e: AutopilotEvent }[];
  listeners: Set<http.ServerResponse>;
  finished: boolean;
}
const jobs = new Map<string, Job>();
let running: Job | undefined;

function startCycle(useModel: boolean): Job {
  const job: Job = { id: `job-${Date.now()}`, events: [], listeners: new Set(), finished: false };
  jobs.set(job.id, job);
  running = job;
  const t0 = Date.now();
  let file = "";
  const push = (e: AutopilotEvent) => {
    const item = { t: Date.now() - t0, e };
    job.events.push(item);
    if (e.type === "cycle.start") {
      fs.mkdirSync(EVENTS_DIR, { recursive: true });
      file = path.join(EVENTS_DIR, `${e.cycleId}.events.jsonl`);
    }
    if (file) fs.appendFileSync(file, JSON.stringify(item) + "\n");
    for (const res of job.listeners) res.write(`data: ${JSON.stringify(item)}\n\n`);
  };
  new Autopilot()
    .runCycle({ onEvent: push, useModel })
    .catch((err) => push({ type: "error", message: (err as Error).message }))
    .finally(() => {
      job.finished = true;
      running = undefined;
      for (const res of job.listeners) res.end("event: end\ndata: {}\n\n");
      job.listeners.clear();
    });
  return job;
}

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 20_000) throw new Error("body too large");
  }
  return s ? (JSON.parse(s) as Record<string, unknown>) : {};
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };

function serveStatic(res: http.ServerResponse, urlPath: string) {
  const file = path.normalize(path.join(WEB, urlPath === "/" ? "index.html" : urlPath));
  // A missing file with an extension (robots.txt, a stale asset) is a 404; extension-less paths are app sections.
  const inside = file.startsWith(WEB + path.sep);
  const exists = inside && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!exists && path.extname(urlPath)) return json(res, 404, { error: "not found" });
  const safe = inside && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(WEB, "index.html");
  if (!fs.existsSync(safe)) return json(res, 404, { error: "web UI not built: run npm run web:build" });
  res.writeHead(200, { "Content-Type": MIME[path.extname(safe)] ?? "application/octet-stream" });
  fs.createReadStream(safe).pipe(res);
}

/** Recordings of cycles that finished, newest first. A cycle that stopped on an error is not offered for replay. */
function savedCycles(): string[] {
  if (!fs.existsSync(EVENTS_DIR)) return [];
  return fs
    .readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith(".events.jsonl") && fs.readFileSync(path.join(EVENTS_DIR, f), "utf-8").includes('"type":"cycle.done"'))
    .map((f) => f.replace(".events.jsonl", ""))
    .sort()
    .reverse();
}

let sampleCache: SampleCycle | undefined;
/** The committed sample cycle, while this machine has no ledger or recordings of its own (see src/autopilot/sample.ts). */
function sample(): SampleCycle | undefined {
  if (running || !useSample(DATA_DIR)) return undefined;
  return (sampleCache ??= new SampleCycle());
}

function ledgerView(ap: { ledger: { all(): LedgerEntry[] }; verify: Autopilot["verify"] }) {
  const entries = ap.ledger.all();
  return {
    verify: ap.verify(),
    entries: entries.map((e) => ({
      seq: e.seq,
      type: e.type,
      at: e.at,
      hash: e.hash,
      prevHash: e.prevHash,
      keyId: e.keyId,
      signature: e.signature.slice(0, 24) + "…",
      ref: (e.payload as { id?: string; decisionId?: string; cycleId?: string }).id ?? (e.payload as { decisionId?: string }).decisionId ?? (e.payload as { cycleId?: string }).cycleId,
    })),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const p = url.pathname;
  try {
    if (!p.startsWith("/api/")) return serveStatic(res, p);
    const live = new Autopilot();
    const demo = sample();
    // Read-only views come from the sample when there is no local data; writes always go to the live autopilot.
    const ap = demo ?? live;
    if (req.method === "GET" && p === "/api/state") {
      const s = ap.state();
      return json(res, 200, {
        running: running ? running.id : null,
        decisions: s.decisions.map((d) => ({ ...d, scout: { ...d.scout, contract: d.scout.contract ? { ...d.scout.contract } : undefined } })),
        cycles: s.cycles.map(({ evidence, ...c }) => ({ ...c, evidence: evidence.map(({ rows, ...e }) => ({ ...e, rowCount: rows.length })) })),
        platforms: s.platforms,
        ledger: ledgerView(ap),
        savedCycles: demo ? [demo.cycleId] : savedCycles(),
        sample: demo ? { cycleId: demo.cycleId, source: demo.source } : undefined,
      });
    }
    if (req.method === "POST" && p === "/api/cycle") {
      if (running) return json(res, 409, { error: "a cycle is already running", job: running.id });
      const b = await body(req);
      return json(res, 202, { job: startCycle(b.useModel !== false).id });
    }
    const ev = p.match(/^\/api\/jobs\/(job-\d+)\/events$/);
    if (req.method === "GET" && ev) {
      const job = jobs.get(ev[1]);
      if (!job) return json(res, 404, { error: "unknown job" });
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      for (const item of job.events) res.write(`data: ${JSON.stringify(item)}\n\n`);
      if (job.finished) return res.end("event: end\ndata: {}\n\n");
      job.listeners.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => {
        clearInterval(ping);
        job.listeners.delete(res);
      });
      return;
    }
    const saved = p.match(/^\/api\/cycles\/(C-\d{14})\/events$/);
    if (req.method === "GET" && saved) {
      const file = path.join(EVENTS_DIR, `${saved[1]}.events.jsonl`);
      if (!fs.existsSync(file) && demo && saved[1] === demo.cycleId) return json(res, 200, demo.events());
      if (!fs.existsSync(file)) return json(res, 404, { error: "no saved events" });
      return json(res, 200, fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
    }
    const review = p.match(/^\/api\/decisions\/(D-\d{4})\/review$/);
    if (req.method === "POST" && review) {
      const b = await body(req);
      const outcome = b.outcome === "approved" ? "approved" : b.outcome === "rejected" ? "rejected" : undefined;
      if (!outcome) return json(res, 400, { error: "outcome must be approved or rejected" });
      const r = live.review(review[1], { by: String(b.by || os.userInfo().username).slice(0, 60), outcome, note: b.note ? String(b.note).slice(0, 400) : undefined });
      return json(res, 200, { approvalSeq: r.approval.seq, receipt: r.receipt, memory: { id: r.memory.id, content: r.memory.content } });
    }
    const replay = p.match(/^\/api\/decisions\/(D-\d{4})\/replay$/);
    if (req.method === "GET" && replay) return json(res, 200, ap.replay(replay[1]));
    const evid = p.match(/^\/api\/cycles\/(C-\d{14})\/evidence\/(E\d+)$/);
    if (req.method === "GET" && evid) {
      const cycle = ap.state().cycles.find((c) => c.cycleId === evid[1]);
      const e = cycle?.evidence.find((x) => x.id === evid[2]);
      return e ? json(res, 200, e) : json(res, 404, { error: "unknown evidence" });
    }
    if (req.method === "POST" && p === "/api/ledger/tamper-demo") {
      const entries = structuredClone(ap.ledger.all()) as LedgerEntry[];
      const target = entries.find((e) => e.type === "decision");
      if (!target) return json(res, 400, { error: "run a cycle first" });
      const payload = target.payload as { candidate: { amountUsd: number; request: string } };
      const original = payload.candidate.request;
      payload.candidate.amountUsd *= 10;
      payload.candidate.request = original.replace(/\$[\d,]+/, (m) => `$${(Number(m.replace(/[$,]/g, "")) * 10).toLocaleString("en-US")}`);
      const pub = demo ? demo.publicKey : createPublicKey(fs.readFileSync(path.join(DATA_DIR, "ledger", "ledger-public-key.pem")));
      return json(res, 200, { seq: target.seq, original, tampered: payload.candidate.request, result: verifyLedger(entries, pub), originalStillValid: ap.verify().ok });
    }
    json(res, 404, { error: "not found" });
  } catch (err) {
    json(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, HOST, () => console.log(`Ad Spend Autopilot on http://${HOST}:${PORT}`));
