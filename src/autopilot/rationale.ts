// "Why I did this", written by Nemotron through Meterless Nightshift. The
// Markovian engine runs one bounded step per decision; the carryover keeps a
// running portfolio view (what has already been moved) so step N knows about
// steps 1..N-1 without re-reading their prompts. The decision itself is
// already made; the model explains it and may not change it. If the model is
// unavailable the record gets a template rationale, labeled as such.

import { Markovian, type Generator } from "../engines/markovian/index.ts";
import type { ChatProvider } from "../llm/meterless.ts";
import type { Candidate } from "./optimizer.ts";
import type { Confidence, Status } from "./policy.ts";

export interface RationaleInput {
  id: string;
  candidate: Candidate;
  status: Status;
  reasons: string[];
  confidence: Confidence;
  riskLevel: string;
}

export interface Rationale {
  text: string;
  by: "nemotron" | "template";
  model?: string;
  error?: string;
}

const SYSTEM = `You explain decisions made by an ad budget autopilot to a performance marketer.
The decision is already made by deterministic policy; explain it, do not change it.
Write 3 short sentences: what happens, the evidence that drove it (cite evidence ids like [E1]), and the main risk or what would change the decision.
Use only numbers given to you. No headings, no lists.`;

export function templateRationale(d: RationaleInput): string {
  const c = d.candidate;
  const m = c.metrics;
  if (d.status === "blocked") return `Blocked before any change: ${d.reasons[0] ?? "Scout guard"}. The request came from untrusted text, which the autopilot never obeys [${c.evidence[0]}]. No budget was moved.`;
  if (c.source === "efficiency")
    return `Moves $${c.amountUsd}/day from ${c.from?.name} (${m.from_backend_roas_7d}x backend ROAS) to ${c.to?.name} (${m.to_backend_roas_7d}x), which lost ${Math.round(Number(m.to_budget_lost_share_7d) * 100)}% of its delivery to budget [${c.evidence.join(", ")}]. Expected about $${c.expectedDailyRevenueDelta}/day more backend revenue. Confidence ${d.confidence.value}; it would be held if platform and backend revenue disagreed.`;
  return `Held for a human: ${c.to?.name} shows ${m.platform_roas_3d}x platform-reported ROAS over 3 days but only ${m.backend_roas_3d}x on backend orders [${c.evidence.join(", ")}]. A $${c.amountUsd}/day increase is above the auto limit and confidence is ${d.confidence.value}. Approve only if the platform's attribution can be confirmed.`;
}

export async function writeRationales(items: RationaleInput[], llm: ChatProvider | undefined, onEach?: (id: string, r: Rationale) => void): Promise<Map<string, Rationale>> {
  const out = new Map<string, Rationale>();
  if (!items.length) return out;
  if (!llm) {
    for (const d of items) {
      const r: Rationale = { text: templateRationale(d), by: "template" };
      out.set(d.id, r);
      onEach?.(d.id, r);
    }
    return out;
  }
  let i = 0;
  const portfolio: string[] = [];
  const generator: Generator = async (prompt) => {
    const d = items[i++];
    const facts = {
      decision: d.id,
      request: d.candidate.request,
      status: d.status,
      policy_reasons: d.reasons,
      amount_usd_per_day: d.candidate.amountUsd,
      from: d.candidate.from?.name,
      to: d.candidate.to?.name,
      metrics: d.candidate.metrics,
      expected_backend_revenue_delta_per_day: d.candidate.expectedDailyRevenueDelta,
      confidence: d.confidence.value,
      confidence_factors: d.confidence.factors,
      risk: d.riskLevel,
      evidence_ids: d.candidate.evidence,
    };
    let r: Rationale;
    try {
      const res = await llm.chat(
        [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${prompt}\n\nDecision facts:\n${JSON.stringify(facts, null, 1)}\n\nWrite the 3 sentences now.` },
        ],
        { maxTokens: 2500, temperature: 0.2 },
      );
      const text = res.text.replace(/\[(STATE_CHECKPOINT|TASK_COMPLETE)\][\s\S]*$/, "").trim();
      r = text ? { text, by: "nemotron", model: res.route?.label ?? res.model } : { text: templateRationale(d), by: "template", error: "empty reply" };
    } catch (err) {
      r = { text: templateRationale(d), by: "template", error: (err as Error).message.slice(0, 200) };
    }
    out.set(d.id, r);
    onEach?.(d.id, r);
    portfolio.push(`${d.id} ${d.status}: ${d.candidate.request}`);
    const done = i >= items.length;
    const state = `COMPLETED: ${portfolio.join("; ")}\nREMAINING: ${items.slice(i).map((x) => x.id).join(", ") || "none"}\nDECISIONS: explanations only; policy outcomes are fixed\nCONTEXT: net auto-executed change today: ${items.filter((x) => x.status === "auto-executed").map((x) => `$${x.candidate.amountUsd}`).join(", ") || "none"}`;
    return { text: `${r.text}\n${done ? "[TASK_COMPLETE]" : `[STATE_CHECKPOINT]\n${state}`}` };
  };
  const engine = new Markovian({ chunkConfig: { chunkSize: 4000, carryoverTokens: 512, maxChunks: Math.min(32, items.length) } });
  await engine.run({ goal: "Explain each budget decision of this autopilot cycle to the marketer.", mode: "RESEARCH", generator, reflect: false });
  return out;
}
