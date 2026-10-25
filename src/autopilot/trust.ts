// Trust memory on H-MEM. Human reviews become memories with provenance
// (decision id, reviewer). Before the next cycle the autopilot recalls what
// people decided about the same ad line: a rejection lowers confidence on
// similar moves, so the agent asks again instead of repeating a mistake.

import path from "node:path";
import { HMEM, type MemoryRecord } from "../engines/hmem/index.ts";
import type { Candidate } from "./optimizer.ts";
import type { TrustSignal } from "./policy.ts";

export class TrustMemory {
  readonly mem: HMEM;

  constructor(dir: string) {
    this.mem = new HMEM({ persistDir: path.join(dir, "memory"), actor: "autopilot" });
  }

  /** Signals for a candidate: past human rejections on the same target line and move type. */
  signals(c: Candidate): TrustSignal[] {
    const line = c.to?.id;
    if (!line) return [];
    return this.mem.store
      .all()
      .filter((m) => !m.supersededBy && m.tags.includes(`line:${line}`) && m.tags.includes("review:rejected") && m.tags.includes(`type:${c.type}`))
      .map((m) => ({ memoryId: m.id, content: m.content, penalty: Math.round(0.25 * m.confidence * 100) / 100 }));
  }

  learnReview(a: { decisionId: string; candidate: Candidate; outcome: "approved" | "rejected"; by: string; note?: string }): MemoryRecord {
    const c = a.candidate;
    const verb = a.outcome === "approved" ? "approved" : "rejected";
    return this.mem.add({
      content: `${a.by} ${verb} "${c.request}"${a.note ? `: ${a.note}` : ""}`,
      source: `review:${a.decisionId}`,
      type: "preference",
      layer: "working",
      tags: [`review:${verb}`, `type:${c.type}`, ...(c.to ? [`line:${c.to.id}`] : []), ...(c.from ? [`from:${c.from.id}`] : [])],
      confidence: 0.85,
      provenance: { origin: "user_correction", learnedAt: Date.now(), label: `review of ${a.decisionId}`, refs: [a.decisionId] },
    });
  }

  learnOutcome(decisionId: string, c: Candidate, summary: string): MemoryRecord {
    return this.mem.add({
      content: summary,
      source: `execution:${decisionId}`,
      type: "factual",
      layer: "short_term",
      tags: ["execution", `type:${c.type}`, ...(c.to ? [`line:${c.to.id}`] : [])],
      confidence: 0.7,
      provenance: { origin: "model_response", learnedAt: Date.now(), label: `executed ${decisionId}`, refs: [decisionId] },
    });
  }
}
