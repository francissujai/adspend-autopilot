// The Ad Spend Autopilot: one cycle = read (Zetaris, as the agent role) ->
// propose (deterministic optimizer) -> classify + guard + sign (Scout) ->
// score confidence (+ H-MEM trust) -> decide (policy) -> explain (Nemotron
// via Markovian) -> record (signed ledger) -> execute the safe moves only.
// Humans approve or reject the held ones; any decision can be replayed.

import fs from "node:fs";
import path from "node:path";
import { createPublicKey } from "node:crypto";
import { ROOT } from "../env.ts";
import { Scout, type Decision as ScoutDecision, type ExecutionContract } from "../engines/scout/index.ts";
import { MeterlessProvider, ReceiptLog } from "../llm/meterless.ts";
import { agentClient, buildSnapshot, loadSnapshot, type Evidence, type Snapshot } from "./data.ts";
import { SandboxPlatforms, type ExecutionReceipt } from "./executor.ts";
import { Ledger, verifyLedger, type LedgerEntry } from "./ledger.ts";
import { generateCandidates, type Candidate } from "./optimizer.ts";
import { confidence, decideStatus, type Confidence, type Status, type TrustSignal } from "./policy.ts";
import { writeRationales, type Rationale } from "./rationale.ts";
import { TrustMemory } from "./trust.ts";

export const DATA_DIR = path.join(ROOT, ".autopilot");
export const ARCHIVE_DIR = path.join(ROOT, ".autopilot-archive");

/**
 * Start the demo from a clean ledger: move the ledger, trust memory and sandbox
 * budgets to .autopilot-archive/<timestamp>/. Keys and saved cycle recordings stay,
 * so replays keep working. Nothing is deleted.
 */
export function archiveRunState(dir = DATA_DIR, archiveRoot = ARCHIVE_DIR): { archivedTo: string; moved: string[] } {
  const to = path.join(archiveRoot, new Date().toISOString().replace(/[:.]/g, "-"));
  const moved: string[] = [];
  for (const name of ["ledger", "memory", "platform-state.json"]) {
    const from = path.join(dir, name);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(to, { recursive: true });
    fs.renameSync(from, path.join(to, name));
    moved.push(name);
  }
  return { archivedTo: to, moved };
}
const REGISTRY = path.join(ROOT, "src", "autopilot", "registry.json");
const AGENT = { id: "autopilot", role: "autopilot-agent" };

export interface DecisionRecord {
  id: string;
  cycleId: string;
  createdAt: string;
  candidate: Candidate;
  scout: { intent: string; band: string; risk: ScoutDecision["risk"]; contract?: ExecutionContract; classifyMs: number };
  confidence: Confidence;
  trust: TrustSignal[];
  status: Status;
  reasons: string[];
  rationale: Rationale;
  evidenceDigest: { id: string; rowsSha256: string }[];
}

export interface CycleRecord {
  cycleId: string;
  asOf: string;
  startedAt: string;
  identity: string;
  governance: Snapshot["governance"];
  evidence: Evidence[];
  lines: Snapshot["lines"];
  decisions: string[];
}

export type AutopilotEvent =
  | { type: "cycle.start"; cycleId: string; asOf: string; identity: string; model: string }
  | { type: "evidence"; id: string; purpose: string; rows: number; ms: number; error?: string }
  | { type: "governance"; allowed: boolean; unreachable?: boolean; detail: string }
  | { type: "lines"; lines: Snapshot["lines"] }
  | { type: "candidate"; id: string; source: string; request: string }
  | { type: "scout"; id: string; intent: string; band: string; risk: string; flags: number; contract: boolean; ms: number }
  | { type: "decision"; record: DecisionRecord }
  | { type: "rationale"; id: string; text: string; by: string; model?: string }
  | { type: "execution"; id: string; receipt: ExecutionReceipt }
  | { type: "ledger"; seq: number; kind: string; hash: string }
  | { type: "cycle.done"; cycleId: string; seconds: number; summary: Record<Status, number> }
  | { type: "error"; message: string };

export class Autopilot {
  readonly scout: Scout;
  readonly ledger: Ledger;
  readonly trust: TrustMemory;
  private platforms?: SandboxPlatforms;

  constructor(readonly dir = DATA_DIR) {
    fs.mkdirSync(dir, { recursive: true });
    this.scout = new Scout({ intentRegistry: REGISTRY, policyPack: ["default", "adversarial-tight", "autopilot"], signingSecret: this.contractSecret() });
    this.ledger = new Ledger(path.join(dir, "ledger"), path.join(dir, "keys"));
    this.trust = new TrustMemory(dir);
  }

  /** Per-deployment HMAC secret for Scout contracts, generated once. */
  private contractSecret(): string {
    const f = path.join(this.dir, "keys", "scout-hmac.secret");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.getRandomValues(new Uint8Array(32)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""), { mode: 0o600 });
    return process.env.SCOUT_SIGNING_SECRET ?? fs.readFileSync(f, "utf-8").trim();
  }

  private platformsFor(s: Snapshot): SandboxPlatforms {
    this.platforms ??= new SandboxPlatforms(this.dir, s.lines.map((l) => ({ platform: l.platform, id: l.id, name: l.name, dailyBudget: l.dailyBudget })));
    return this.platforms;
  }

  private classify(c: Candidate): ScoutDecision {
    return this.scout.decide({
      prompt: c.request,
      user: AGENT,
      surface: "api",
      parameters: { amount_usd: c.amountUsd, ...(c.metrics.share_of_source !== undefined ? { share_of_source: Number(c.metrics.share_of_source) } : {}) },
      untrusted: c.untrusted,
    });
  }

  async runCycle(opts: { onEvent?: (e: AutopilotEvent) => void; useModel?: boolean } = {}): Promise<{ cycle: CycleRecord; decisions: DecisionRecord[] }> {
    const emit = opts.onEvent ?? (() => {});
    const t0 = Date.now();
    const cycleId = `C-${new Date(t0).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
    const sql = agentClient();
    const llm = opts.useModel === false ? undefined : safeProvider();
    emit({ type: "cycle.start", cycleId, asOf: process.env.AUTOPILOT_AS_OF ?? "2026-10-19", identity: sql.identity, model: llm ? `${llm.model} via ${llm.name}` : "template (model off)" });

    const snapshot = await loadSnapshot(sql);
    for (const e of snapshot.evidence) emit({ type: "evidence", id: e.id, purpose: e.purpose, rows: e.rows.length, ms: e.ms, error: e.error });
    // With no evidence at all there is nothing to decide on; stop before anything is written to the ledger.
    if (snapshot.evidence.every((e) => e.error)) {
      throw new Error(`Zetaris did not answer any query (${snapshot.evidence[0]?.error}). Nothing was decided or signed; the last cycle is unchanged.`);
    }
    emit({ type: "governance", allowed: snapshot.governance.allowed, unreachable: snapshot.governance.unreachable, detail: snapshot.governance.detail });
    emit({ type: "lines", lines: snapshot.lines });

    const records: DecisionRecord[] = [];
    let n = this.ledger.all().filter((e) => e.type === "decision").length;
    // A move already executed (or approved) for this as-of date is not proposed again.
    const done = new Set(
      this.state()
        .decisions.filter((d) => (d.status === "auto-executed" || d.status === "approved") && this.state().cycles.find((cy) => cy.cycleId === d.cycleId)?.asOf === snapshot.asOf)
        .map((d) => d.candidate.key),
    );
    for (const c of generateCandidates(snapshot).filter((x) => !done.has(x.key))) {
      const id = `D-${String(++n).padStart(4, "0")}`;
      emit({ type: "candidate", id, source: c.source, request: c.request });
      const sd = this.classify(c);
      emit({ type: "scout", id, intent: sd.executionContract?.intent.primary.id ?? sd.candidates[0]?.intent ?? "GENERAL", band: sd.band, risk: sd.risk.level, flags: sd.risk.flags.length, contract: !!sd.executionContract, ms: sd.timings.classifyMs });
      const trust = this.trust.signals(c);
      const conf = confidence(c, snapshot, trust);
      const { status, reasons } = decideStatus(sd, conf);
      records.push({
        id,
        cycleId,
        createdAt: new Date().toISOString(),
        candidate: c,
        scout: { intent: sd.executionContract?.intent.primary.id ?? sd.candidates[0]?.intent ?? "GENERAL", band: sd.band, risk: sd.risk, contract: sd.executionContract, classifyMs: sd.timings.classifyMs },
        confidence: conf,
        trust,
        status,
        reasons,
        rationale: { text: "", by: "template" },
        evidenceDigest: snapshot.evidence.filter((e) => c.evidence.includes(e.id)).map((e) => ({ id: e.id, rowsSha256: e.rowsSha256 })),
      });
    }

    const rationales = await writeRationales(
      records.map((r) => ({ id: r.id, candidate: r.candidate, status: r.status, reasons: r.reasons, confidence: r.confidence, riskLevel: r.scout.risk.level })),
      llm,
      (id, r) => emit({ type: "rationale", id, text: r.text, by: r.by, model: r.model }),
    );
    for (const r of records) r.rationale = rationales.get(r.id) ?? r.rationale;

    const cycle: CycleRecord = { cycleId, asOf: snapshot.asOf, startedAt: new Date(t0).toISOString(), identity: sql.identity, governance: snapshot.governance, evidence: snapshot.evidence, lines: snapshot.lines, decisions: records.map((r) => r.id) };
    const ce = this.ledger.append("cycle", cycle);
    emit({ type: "ledger", seq: ce.seq, kind: "cycle", hash: ce.hash });
    for (const r of records) {
      const de = this.ledger.append("decision", r);
      emit({ type: "ledger", seq: de.seq, kind: "decision", hash: de.hash });
      emit({ type: "decision", record: r });
      if (r.status === "auto-executed") {
        const receipt = this.platformsFor(snapshot).apply(this.scout, r.scout.contract, r.candidate);
        const xe = this.ledger.append("execution", { decisionId: r.id, receipt });
        emit({ type: "execution", id: r.id, receipt });
        emit({ type: "ledger", seq: xe.seq, kind: "execution", hash: xe.hash });
        if (receipt.ok) this.trust.learnOutcome(r.id, r.candidate, `Auto-executed ${r.id}: ${r.candidate.request}`);
      }
    }
    const summary = { "auto-executed": 0, "awaiting-approval": 0, blocked: 0, approved: 0, rejected: 0 } as Record<Status, number>;
    for (const r of records) summary[r.status]++;
    emit({ type: "cycle.done", cycleId, seconds: (Date.now() - t0) / 1000, summary });
    return { cycle, decisions: records };
  }

  /** Current view of every decision: its record plus later reviews and executions. */
  state(): { decisions: (DecisionRecord & { review?: { by: string; outcome: string; note?: string; at: string }; executions: ExecutionReceipt[] })[]; cycles: CycleRecord[]; platforms?: unknown } {
    const entries = this.ledger.all();
    const decisions = entries.filter((e) => e.type === "decision").map((e) => ({ ...(e.payload as DecisionRecord), executions: [] as ExecutionReceipt[] } as DecisionRecord & { review?: { by: string; outcome: string; note?: string; at: string }; executions: ExecutionReceipt[] }));
    const byId = new Map(decisions.map((d) => [d.id, d]));
    for (const e of entries) {
      if (e.type === "approval") {
        const p = e.payload as { decisionId: string; by: string; outcome: "approved" | "rejected"; note?: string };
        const d = byId.get(p.decisionId);
        if (d) {
          d.review = { by: p.by, outcome: p.outcome, note: p.note, at: e.at };
          d.status = p.outcome;
        }
      }
      if (e.type === "execution") {
        const p = e.payload as { decisionId: string; receipt: ExecutionReceipt };
        byId.get(p.decisionId)?.executions.push(p.receipt);
      }
    }
    const platformFile = path.join(this.dir, "platform-state.json");
    return {
      decisions: decisions.reverse(),
      cycles: entries.filter((e) => e.type === "cycle").map((e) => e.payload as CycleRecord).reverse(),
      platforms: fs.existsSync(platformFile) ? JSON.parse(fs.readFileSync(platformFile, "utf-8")) : undefined,
    };
  }

  /** A human approves or rejects a held decision. Approval runs on a fresh contract (contracts are never extended). */
  review(decisionId: string, r: { by: string; outcome: "approved" | "rejected"; note?: string }) {
    const d = this.state().decisions.find((x) => x.id === decisionId);
    if (!d) throw new Error(`unknown decision ${decisionId}`);
    if (d.status !== "awaiting-approval") throw new Error(`${decisionId} is ${d.status}, not awaiting approval`);
    let receipt: ExecutionReceipt | undefined;
    let contractId: string | undefined;
    if (r.outcome === "approved") {
      const fresh = this.classify(d.candidate);
      if (!fresh.executionContract) throw new Error(`Scout no longer issues a contract for ${decisionId} (${fresh.risk.level})`);
      const signed = this.scout.recordApproval(fresh.executionContract, { kind: "operator-review", by: r.by, at: new Date().toISOString(), decision: "approved", note: r.note });
      contractId = signed.contractId;
      const cycle = this.state().cycles.find((c) => c.cycleId === d.cycleId);
      receipt = this.platformsFor({ lines: cycle?.lines ?? [] } as Snapshot).apply(this.scout, signed, d.candidate);
    }
    const ae = this.ledger.append("approval", { decisionId, by: r.by, outcome: r.outcome, note: r.note, contractId });
    const xe = receipt ? this.ledger.append("execution", { decisionId, receipt }) : undefined;
    const mem = this.trust.learnReview({ decisionId, candidate: d.candidate, outcome: r.outcome, by: r.by, note: r.note });
    this.ledger.append("memory", { decisionId, memoryId: mem.id, content: mem.content });
    return { approval: ae, execution: xe, receipt, memory: mem };
  }

  /**
   * Replay: rebuild the snapshot from the rows stored in the ledger, re-run the
   * deterministic pipeline, and compare with what was recorded. Also checks the
   * ledger chain and the decision's Scout contract signature.
   */
  replay(decisionId: string) {
    const entries = this.ledger.all();
    const de = entries.find((e) => e.type === "decision" && (e.payload as DecisionRecord).id === decisionId) as LedgerEntry<DecisionRecord> | undefined;
    if (!de) throw new Error(`unknown decision ${decisionId}`);
    const d = de.payload;
    const ce = entries.find((e) => e.type === "cycle" && (e.payload as CycleRecord).cycleId === d.cycleId) as LedgerEntry<CycleRecord>;
    const evidenceIntact = d.evidenceDigest.every((x) => ce.payload.evidence.find((e) => e.id === x.id)?.rowsSha256 === x.rowsSha256);
    const snapshot = buildSnapshot(ce.payload.asOf, ce.payload.evidence, ce.payload.governance);
    const c = generateCandidates(snapshot).find((x) => x.key === d.candidate.key);
    const sd = c ? this.classify(c) : undefined;
    const conf = c ? confidence(c, snapshot, d.trust) : undefined;
    const st = sd && conf ? decideStatus(sd, conf) : undefined;
    const compare = {
      action: [d.candidate.request, c?.request],
      amountUsd: [d.candidate.amountUsd, c?.amountUsd],
      intent: [d.scout.intent, sd?.executionContract?.intent.primary.id ?? sd?.candidates[0]?.intent],
      risk: [d.scout.risk.level, sd?.risk.level],
      confidence: [d.confidence.value, conf?.value],
      // The decision entry holds the policy outcome at decision time; later reviews are separate entries.
      status: [d.status, st?.status],
    } as Record<string, [unknown, unknown]>;
    const diffs = Object.entries(compare).filter(([, [a, b]]) => JSON.stringify(a) !== JSON.stringify(b)).map(([k]) => k);
    const pub = createPublicKey(fs.readFileSync(path.join(this.dir, "ledger", "ledger-public-key.pem")));
    const ledger = verifyLedger(entries, pub);
    const contract = d.scout.contract ? this.scout.verifyContract(d.scout.contract, { now: Date.parse(d.scout.contract.issuedAt) + 1, requireApprovals: false }) : { ok: false, reason: "no contract (blocked)" };
    return { decisionId, match: !!c && diffs.length === 0, diffs, compare, evidenceIntact, ledger, contract, ledgerSeq: de.seq, ledgerHash: de.hash };
  }

  verify() {
    const pub = createPublicKey(fs.readFileSync(path.join(this.dir, "ledger", "ledger-public-key.pem")));
    return verifyLedger(this.ledger.all(), pub);
  }
}

function safeProvider(): ReceiptLog | undefined {
  try {
    return new ReceiptLog(new MeterlessProvider());
  } catch {
    return undefined;
  }
}
