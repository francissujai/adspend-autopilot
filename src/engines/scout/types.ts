// Scout Intent engine types. Implements the Meterless Scout Intent spec
// (github.com/meterless/meterless, engines/scout-intent, Apache-2.0):
// classify what a request is trying to do, guard it (injection, policy,
// scope), plan the tools it may use, and issue a signed execution contract
// that downstream code must verify before acting.

export type RiskLevel = "low" | "medium" | "high" | "block";

export interface IntentDef {
  id: string;
  category: string;
  description: string;
  parameters?: { type: "object"; properties: Record<string, { type?: string; enum?: string[]; minimum?: number; maximum?: number }> };
  capabilities: string[];
  riskClass: "low" | "medium" | "high";
  surfaces: string[];
  roles: string[];
  examples: string[];
  version: number;
}

export interface IntentRegistry {
  version: number;
  note?: string;
  intents: IntentDef[];
}

export interface GuardFlag {
  layer: "injection" | "policy" | "scope" | "pii" | "rate";
  kind: string;
  outcome: "warn" | "block";
  evidence: string;
}

/** A policy pack: injection patterns plus scope and approval rules. */
export interface PolicyPack {
  name: string;
  version: number;
  injection: { kind: string; pattern: RegExp }[];
  /** Parameter limits per intent: above `autoMax` needs approval, above `hardMax` is blocked. */
  limits?: Record<string, Record<string, { autoMax?: number; hardMax?: number }>>;
  /** Intents that always need a human, whatever the amount. */
  requireApproval?: string[];
}

export interface DecideInput {
  prompt: string;
  user: { id: string; role: string };
  surface: string;
  /** Explicit parameters from a structured caller (merged over extracted ones). */
  parameters?: Record<string, unknown>;
  /** Untrusted text the request depends on (ad-platform notes, emails). Scanned, never obeyed. */
  untrusted?: { source: string; text: string }[];
}

export interface Candidate {
  intent: string;
  score: number;
  lexical: number;
  semantic: number;
  contextual: number;
}

export interface ToolStep {
  capability: string;
  tool: string;
  fromIntent: string;
}

export interface Approval {
  kind: "user-confirm" | "operator-review";
  by?: string;
  at: string;
  decision?: "approved" | "rejected";
  note?: string;
}

export interface ExecutionContract {
  contractId: string;
  traceId: string;
  intent: {
    primary: { id: string; confidence: number };
    parameters: Record<string, unknown>;
    alternates: { id: string; confidence: number }[];
  };
  risk: { level: Exclude<RiskLevel, "block">; flags: GuardFlag[]; approvalsRequired: string[]; approvals: Approval[] };
  toolPlan: ToolStep[];
  scope: { user: string; surface: string; capabilities: string[]; budget?: { costMaxUSD: number } };
  issuedAt: string;
  expiresAt: string;
  registryVersion: number;
  policyPackVersion: string;
  signedBy: "scout";
  signature: string;
}

export interface Decision {
  candidates: Candidate[];
  band: "high" | "medium" | "low" | "reject";
  intents: { intent: string; score: number; span: string }[];
  parameters: Record<string, unknown>;
  risk: { level: RiskLevel; flags: GuardFlag[]; approvalsRequired: string[] };
  toolPlan: ToolStep[];
  clarification?: { question: string; options: { label: string; intent: string }[] };
  executionContract?: ExecutionContract;
  timings: { classifyMs: number };
}
