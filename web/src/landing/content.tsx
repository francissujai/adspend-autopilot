import type { LandingContent } from "./Landing";
import { DecisionPreview } from "./DecisionPreview";

export const content: LandingContent = {
  product: "Ad Spend Autopilot",
  tagline: "Budget agent with a signed ledger",
  headline: <>Move ad budget only where the revenue is <em>real</em>.</>,
  lede: "The agent reads Meta, Google and your own orders through Zetaris and proposes budget shifts. A policy decides what runs, large moves wait for a person, and every decision is signed into a ledger.",
  scene: "chain",
  accent: "#5FD39A",
  heroLabel: "A ring of linked blocks, one per signed ledger entry, assembling and lighting up as they are signed",
  heroCaption: "One block per signed ledger entry: the chain assembles as you scroll, and a pulse walks it the way a signature does.",
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
  storyTitle: "One decision, step by step.",
  story: [
    { title: "Read the data", body: "Ad platforms and your own orders are read through Zetaris, read only." },
    { title: "Check the claim", body: "The platform says 5.58x. Your orders say 0.97x. The autopilot believes the orders." },
    { title: "Let policy decide", body: "A $5,000 shift is over the limit an agent may move alone, so it is held for a person." },
    { title: "Sign it", body: "The decision, held or run, is hashed to the entry before it and signed with Ed25519." },
  ],
  storyView: (step) => <DecisionPreview step={step} />,
  closing: "Spend only where the revenue is real.",
  footer: "Ad Spend Autopilot. Built with Zetaris, Meterless engines and NVIDIA Nemotron for the Open Agent Hackathon 2026.",
};
