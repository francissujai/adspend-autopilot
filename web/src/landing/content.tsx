import type { LandingContent } from "./Landing";
import { CHAPTERS, FilmScene } from "./film-scene";

export const content: LandingContent = {
  product: "Ad Spend Autopilot",
  tagline: "Budget agent with a signed ledger",
  headline: <>Move ad budget only where the revenue is <em>real</em>.</>,
  lede: "The agent reads Meta, Google and your own orders through Zetaris and proposes budget shifts. A policy decides what runs, large moves wait for a person, and every decision is signed into a ledger.",
  scene: "chain",
  accent: "#5FD39A",
  heroLabel: "A ring of linked blocks, one per signed ledger entry, assembling and lighting up as they are signed",
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
  filmLabel: "One decision, scrolled",
  chapters: CHAPTERS,
  film: (p) => <FilmScene p={p} />,
  closing: "Spend only where the revenue is real.",
  footer: "Ad Spend Autopilot. Built with Zetaris, Meterless engines and NVIDIA Nemotron for the Open Agent Hackathon 2026.",
};
