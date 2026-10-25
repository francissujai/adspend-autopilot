// Deterministic candidate generation. The optimizer never asks a model what
// to do: it computes moves from the evidence, so the same snapshot always
// yields the same candidates (which is what makes replay meaningful).

import type { LineMetrics, Note, Snapshot } from "./data.ts";

export type ActionType = "budget.shift" | "budget.increase" | "budget.decrease";

export interface LineRef {
  platform: "meta" | "google";
  id: string;
  name: string;
  budgetBefore: number;
  budgetAfter: number;
}

export interface Candidate {
  key: string; // stable id within a snapshot, e.g. "shift:g-1003->23851190001"
  source: "efficiency" | "platform-signal" | "note-suggestion";
  type: ActionType;
  request: string; // the action phrased as a request, classified by Scout
  amountUsd: number;
  from?: LineRef;
  to?: LineRef;
  /** Untrusted text this candidate depends on (scanned by Scout, never obeyed). */
  untrusted: { source: string; text: string }[];
  metrics: Record<string, number | string>;
  expectedDailyRevenueDelta: number; // on backend revenue
  evidence: string[];
}

const MIN_LIMITED = 0.2; // budget-lost share that marks a line as budget-limited
const DONOR_MAX_ROAS = 1.0; // backend ROAS below which a line loses money
const MAX_SHARE_OF_DONOR = 0.5;
const DIMINISHING = 0.8; // marginal ROAS of new budget vs average
const round100 = (x: number) => Math.round(x / 100) * 100;
const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

/** Unmet daily spend: delivery lost to budget means demand the budget could not buy. */
export const headroom = (l: LineMetrics) => (l.budgetLostShare7 >= 0.99 ? l.dailyBudget : (l.dailyBudget * l.budgetLostShare7) / (1 - l.budgetLostShare7));

export function generateCandidates(s: Snapshot): Candidate[] {
  const out: Candidate[] = [];
  const ref = (l: LineMetrics, delta: number): LineRef => ({ platform: l.platform, id: l.id, name: l.name, budgetBefore: l.dailyBudget, budgetAfter: l.dailyBudget + delta });

  // 1. Efficiency: best budget-limited line on backend ROAS, funded by the worst money-losing line.
  const recipients = s.lines.filter((l) => l.budgetLostShare7 >= MIN_LIMITED).sort((a, b) => b.backendRoas7 - a.backendRoas7);
  const donors = s.lines.filter((l) => l.backendRoas7 < DONOR_MAX_ROAS && l.spend7 > 0).sort((a, b) => a.backendRoas7 - b.backendRoas7);
  const to = recipients[0];
  const from = donors[0];
  if (to && from && to.id !== from.id) {
    const amount = Math.min(round100(headroom(to)), round100(from.dailyBudget * MAX_SHARE_OF_DONOR));
    if (amount > 0) {
      out.push({
        key: `shift:${from.id}->${to.id}`,
        source: "efficiency",
        type: "budget.shift",
        request: `Shift ${money(amount)} per day from ${from.name} to ${to.name}`,
        amountUsd: amount,
        from: ref(from, -amount),
        to: ref(to, amount),
        untrusted: [],
        metrics: {
          to_backend_roas_7d: to.backendRoas7,
          to_platform_roas_7d: to.platformRoas7,
          to_budget_lost_share_7d: to.budgetLostShare7,
          to_headroom_usd: Math.round(headroom(to)),
          from_backend_roas_7d: from.backendRoas7,
          from_platform_roas_7d: from.platformRoas7,
          share_of_source: Math.round((amount / from.dailyBudget) * 100) / 100,
        },
        expectedDailyRevenueDelta: Math.round(amount * (to.backendRoas7 * DIMINISHING - from.backendRoas7)),
        evidence: [...new Set([...to.evidence, ...from.evidence])],
      });
    }
  }

  // 2. Platform signal: what a platform-trusting optimizer would chase - the
  //    biggest short-term jump in platform-reported ROAS.
  const spike = s.lines
    .filter((l) => l.platformRoas3 >= 4 && l.platformRoas3 >= 1.5 * l.platformRoas7)
    .sort((a, b) => b.platformRoas3 / b.platformRoas7 - a.platformRoas3 / a.platformRoas7)[0];
  if (spike) {
    const amount = 5000;
    out.push({
      key: `increase:${spike.id}`,
      source: "platform-signal",
      type: "budget.increase",
      request: `Increase the daily budget of ${spike.name} by ${money(amount)}`,
      amountUsd: amount,
      to: ref(spike, amount),
      untrusted: [],
      metrics: {
        platform_roas_3d: spike.platformRoas3,
        platform_roas_7d: spike.platformRoas7,
        backend_roas_3d: spike.backendRoas3,
        backend_roas_7d: spike.backendRoas7,
        platform_backend_agreement_3d: agreement(spike.platformRoas3, spike.backendRoas3),
      },
      expectedDailyRevenueDelta: Math.round(amount * (spike.backendRoas7 * DIMINISHING - 1)),
      evidence: spike.evidence,
    });
  }

  // 3. Note suggestions: agencies leave instructions in campaign notes. The
  //    autopilot considers them, but the note text is untrusted input.
  const total = s.lines.reduce((sum, l) => sum + l.dailyBudget, 0);
  for (const n of s.notes) {
    const line = s.lines.find((l) => l.id === n.lineId);
    if (!line || !/\b(move|shift|increase|budget)\b/i.test(n.text) || !/\b(budget)\b/i.test(n.text) || n.text.length < 60) continue;
    const amount = Math.round(total - line.dailyBudget);
    out.push({
      key: `note:${n.lineId}:${n.updatedAt}`,
      source: "note-suggestion",
      type: "budget.shift",
      request: `Shift ${money(amount)} per day from all other ad lines to ${line.name}, as suggested in a campaign note by ${n.author}`,
      amountUsd: amount,
      to: ref(line, amount),
      untrusted: [{ source: `campaign note on ${line.name} by ${n.author} (${n.updatedAt})`, text: n.text }],
      metrics: { backend_roas_7d: line.backendRoas7, share_of_account_budget: Math.round((amount / total) * 100) / 100 },
      expectedDailyRevenueDelta: 0,
      evidence: [n.evidence, ...line.evidence],
    });
  }
  return out;
}

/** 1 when platform and backend agree, towards 0 as they diverge. */
export const agreement = (a: number, b: number) => (a <= 0 || b <= 0 ? 0 : Math.round((Math.min(a, b) / Math.max(a, b)) * 100) / 100);
export type { Note };
