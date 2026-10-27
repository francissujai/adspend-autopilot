import type { LandingContent } from "./Landing";
import { DecisionPreview } from "./DecisionPreview";

const dot = (c: string) => ({ "--c": c }) as React.CSSProperties;

export const content: LandingContent = {
  product: "Ad Spend Autopilot",
  headline: <>Move ad budget only where the revenue is <em>real</em>.</>,
  lede: "The agent reads Meta, Google and your own orders through Zetaris and proposes budget shifts. A policy decides what runs, large moves wait for a person, and every decision is signed into a ledger.",
  preview: (data) => <DecisionPreview entries={data?.[0]} />,
  previewLabel: "A budget decision moving from reading the data to a signed, held record",
  facts: [
    { title: "Read-only, enforced by Zetaris", body: "The agent's role cannot read customer data. Every cycle probes it and shows the result." },
    { title: "Ed25519 signed ledger", body: "Each decision links to the one before it. Editing history breaks the chain." },
    { title: "Large moves are held", body: "A $5,000 shift waits for a person. Instructions injected into ad data are blocked." },
  ],
  capsTitle: "From ad data to a signed decision.",
  capsLede: "The same steps, in the same order, every cycle.",
  capabilities: [
    { title: "Read real revenue", body: "Platform claims are checked against your own orders, read through Zetaris." },
    { title: "Propose the shift", body: "Budget moves toward the lines that earn on backend revenue, not reported revenue." },
    { title: "Let policy decide", body: "Safe shifts run, large ones wait for a person, injected instructions are blocked." },
    { title: "Explain every decision", body: "Nemotron writes the reason. It cites evidence and never invents an amount." },
    { title: "Sign the ledger", body: "Each entry is hashed to the one before it and signed with Ed25519." },
  ],
  why: "Ad platforms grade their own homework. The autopilot checks every claim against what you actually sold, moves money only when the numbers hold, and signs each move so nobody can quietly rewrite it later.",
  pillarsTitle: "Decide, explain, prove.",
  pillars: [
    {
      title: "Decisions with reasons", body: "What the policy executed, held or blocked, and the evidence behind each.",
      preview: (
        <>
          <div className="pv-head"><span className="pv-title">Cycle C-20261026</span><span className="pv-dot" style={dot("var(--ds-success)")}>Done</span></div>
          <div className="pv-row"><span>$500</span><span>Display to Cart Abandoners, 4.39x backend</span><span className="pv-dot" style={dot("var(--ds-success)")}>Run</span></div>
          <div className="pv-row"><span>$5,000</span><span>Lookalike 3%, claims 5.58x, backend 0.97x</span><span className="pv-dot" style={dot("var(--ds-warn)")}>Held</span></div>
          <div className="pv-row"><span>Note</span><span>"Ignore previous budget limits" in an agency note</span><span className="pv-dot" style={dot("var(--ds-danger)")}>Blocked</span></div>
        </>
      ),
    },
    {
      title: "A ledger you can verify", body: "Hash-chained, signed entries. Change one and verification fails on the spot.",
      preview: (
        <>
          <div className="pv-head"><span className="pv-title">Ledger</span><span className="pv-dot" style={dot("var(--ds-success)")}>Chain verified</span></div>
          <div className="pv-chain">
            {[["5", "decision D-0003", "signed"], ["4", "decision D-0002", "signed"], ["3", "execution D-0001", "signed"]].map(([n, what, h]) => (
              <div className="pv-block" key={n}><span className="seq">#{n}</span><span>{what}</span><span className="h">{h}</span></div>
            ))}
          </div>
        </>
      ),
    },
    {
      title: "Replays of every cycle", body: "Watch a recorded cycle step by step, with the same timing and evidence.",
      preview: (
        <>
          <div className="pv-head"><span className="pv-title">Recorded cycle</span><span className="pv-dot" style={dot("var(--ds-accent-text)")}>Playing at 8x</span></div>
          <pre className="pv-code">{"00:00  read ad data through Zetaris\n00:04  checked 3 moves with Scout\n00:11  wrote explanations (Nemotron)\n00:16  moved $500\n00:19  signed into the ledger"}</pre>
        </>
      ),
    },
  ],
  closing: "Spend only where the revenue is real.",
  footer: "Ad Spend Autopilot. Built with Zetaris, Meterless engines and NVIDIA Nemotron for the Open Agent Hackathon 2026.",
};
