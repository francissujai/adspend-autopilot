// Decide what happens to each candidate: execute on its own, wait for a
// human, or block. The model never makes this call. Scout classifies and
// guards the request; this policy combines that with a confidence score.

import type { Decision as ScoutDecision } from "../engines/scout/index.ts";
import { agreement, type Candidate } from "./optimizer.ts";
import type { Snapshot } from "./data.ts";

export type Status = "auto-executed" | "awaiting-approval" | "blocked" | "approved" | "rejected";

export interface Confidence {
  value: number;
  factors: { name: string; value: number; note: string }[];
}

export const AUTO_CONFIDENCE = 0.75;

export interface TrustSignal {
  memoryId: string;
  content: string;
  penalty: number;
}

/** Confidence from evidence quality: data volume, platform-vs-backend agreement, and trust memory. */
export function confidence(c: Candidate, s: Snapshot, trust: TrustSignal[] = []): Confidence {
  const target = s.lines.find((l) => l.id === c.to?.id);
  const volume = target ? Math.min(1, target.spend7 / 2000) : 0.5;
  // Agreement on the window the candidate relies on: platform-signal moves rely on the last 3 days.
  const agree = target ? (c.source === "platform-signal" ? agreement(target.platformRoas3, target.backendRoas3) : agreement(target.platformRoas7, target.backendRoas7)) : 0.5;
  const errors = s.evidence.filter((e) => c.evidence.includes(e.id) && e.error).length;
  const penalty = trust.reduce((sum, t) => sum + t.penalty, 0);
  const value = Math.max(0, Math.min(1, 0.35 * volume + 0.65 * agree - 0.3 * errors - penalty));
  return {
    value: Math.round(value * 100) / 100,
    factors: [
      { name: "data volume", value: Math.round(volume * 100) / 100, note: target ? `$${Math.round(target.spend7)} spend in 7 days` : "no target line" },
      { name: "platform vs backend agreement", value: agree, note: target ? `platform ${c.source === "platform-signal" ? target.platformRoas3 : target.platformRoas7}x vs backend ${c.source === "platform-signal" ? target.backendRoas3 : target.backendRoas7}x ROAS` : "" },
      ...(errors ? [{ name: "evidence errors", value: -0.3 * errors, note: `${errors} failed queries` }] : []),
      ...trust.map((t) => ({ name: "trust memory", value: -t.penalty, note: t.content.slice(0, 140) })),
    ],
  };
}

export function decideStatus(scout: ScoutDecision, conf: Confidence): { status: Status; reasons: string[] } {
  const reasons: string[] = [];
  if (scout.risk.level === "block") {
    for (const f of scout.risk.flags.filter((f) => f.outcome === "block")) reasons.push(`${f.layer}: ${f.kind} (${f.evidence})`);
    return { status: "blocked", reasons };
  }
  if (scout.risk.approvalsRequired.length) reasons.push(...scout.risk.flags.filter((f) => f.outcome === "warn").map((f) => `${f.layer}: ${f.kind} (${f.evidence})`), "Scout requires operator review");
  if (conf.value < AUTO_CONFIDENCE) reasons.push(`confidence ${conf.value} below auto-execute threshold ${AUTO_CONFIDENCE}`);
  if (scout.clarification) reasons.push("Scout could not classify the request confidently");
  if (reasons.length) return { status: "awaiting-approval", reasons };
  return { status: "auto-executed", reasons: [`risk ${scout.risk.level}, confidence ${conf.value} >= ${AUTO_CONFIDENCE}, within auto limits`] };
}
