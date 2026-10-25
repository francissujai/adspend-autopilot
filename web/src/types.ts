// Shapes returned by the autopilot API (src/server.ts). Kept loose where the
// UI only displays a field.

export type Status = "auto-executed" | "awaiting-approval" | "blocked" | "approved" | "rejected";

export interface Line {
  platform: "meta" | "google";
  id: string;
  name: string;
  dailyBudget: number;
  spend7: number;
  platformRoas7: number;
  backendRoas7: number;
  platformRoas3: number;
  backendRoas3: number;
  budgetLostShare7: number;
  evidence: string[];
}

export interface LineRef {
  platform: string;
  id: string;
  name: string;
  budgetBefore: number;
  budgetAfter: number;
}

export interface Candidate {
  key: string;
  source: "efficiency" | "platform-signal" | "note-suggestion";
  type: string;
  request: string;
  amountUsd: number;
  from?: LineRef;
  to?: LineRef;
  untrusted: { source: string; text: string }[];
  metrics: Record<string, number | string>;
  expectedDailyRevenueDelta: number;
  evidence: string[];
}

export interface GuardFlag {
  layer: string;
  kind: string;
  outcome: "warn" | "block";
  evidence: string;
}

export interface Contract {
  contractId: string;
  intent: { primary: { id: string; confidence: number } };
  risk: { level: string; approvalsRequired: string[]; approvals: { kind: string; by?: string; at: string; decision?: string }[] };
  scope: { capabilities: string[]; budget?: { costMaxUSD: number } };
  issuedAt: string;
  expiresAt: string;
  policyPackVersion: string;
  signature: string;
}

export interface ExecutionReceipt {
  ok: boolean;
  reason?: string;
  changes: { platform: string; lineId: string; name: string; before: number; after: number }[];
  contractId?: string;
  at: string;
}

export interface Decision {
  id: string;
  cycleId: string;
  createdAt: string;
  candidate: Candidate;
  scout: { intent: string; band: string; risk: { level: string; flags: GuardFlag[]; approvalsRequired: string[] }; contract?: Contract; classifyMs: number };
  confidence: { value: number; factors: { name: string; value: number; note: string }[] };
  trust: { memoryId: string; content: string; penalty: number }[];
  status: Status;
  reasons: string[];
  rationale: { text: string; by: "nemotron" | "template"; model?: string; error?: string };
  evidenceDigest: { id: string; rowsSha256: string }[];
  review?: { by: string; outcome: string; note?: string; at: string };
  executions?: ExecutionReceipt[];
}

export interface Cycle {
  cycleId: string;
  asOf: string;
  startedAt: string;
  identity: string;
  governance: { probe: string; allowed: boolean; detail: string };
  evidence: { id: string; purpose: string; sql: string; rowsSha256: string; rowCount: number; ms: number; error?: string }[];
  lines: Line[];
  decisions: string[];
}

export interface LedgerRow {
  seq: number;
  type: string;
  at: string;
  hash: string;
  prevHash: string;
  keyId: string;
  signature: string;
  ref?: string;
}

export interface AppState {
  running: string | null;
  decisions: Decision[];
  cycles: Cycle[];
  platforms?: { budgets: Record<string, { platform: string; name: string; dailyBudget: number }> };
  ledger: { verify: { ok: boolean; entries: number; firstBad?: { seq: number; reason: string } }; entries: LedgerRow[] };
  savedCycles: string[];
}

export type AutopilotEvent =
  | { type: "cycle.start"; cycleId: string; asOf: string; identity: string; model: string }
  | { type: "evidence"; id: string; purpose: string; rows: number; ms: number; error?: string }
  | { type: "governance"; allowed: boolean; detail: string }
  | { type: "lines"; lines: Line[] }
  | { type: "candidate"; id: string; source: string; request: string }
  | { type: "scout"; id: string; intent: string; band: string; risk: string; flags: number; contract: boolean; ms: number }
  | { type: "decision"; record: Decision }
  | { type: "rationale"; id: string; text: string; by: string; model?: string }
  | { type: "execution"; id: string; receipt: ExecutionReceipt }
  | { type: "ledger"; seq: number; kind: string; hash: string }
  | { type: "cycle.done"; cycleId: string; seconds: number; summary: Record<Status, number> }
  | { type: "error"; message: string };

export interface ReplayResult {
  decisionId: string;
  match: boolean;
  diffs: string[];
  compare: Record<string, [unknown, unknown]>;
  evidenceIntact: boolean;
  ledger: { ok: boolean; entries: number; firstBad?: { seq: number; reason: string } };
  contract: { ok: boolean; reason?: string };
  ledgerSeq: number;
  ledgerHash: string;
}

export interface TamperResult {
  seq: number;
  original: string;
  tampered: string;
  result: { ok: boolean; entries: number; firstBad?: { seq: number; reason: string } };
  originalStillValid: boolean;
}
