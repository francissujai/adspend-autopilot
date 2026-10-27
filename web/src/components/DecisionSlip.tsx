import { useRef, useState } from "react";
import { Button } from "../ui/Button";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { money } from "../api";
import type { Decision } from "../types";

const STAMP: Record<string, { cls: string; word: string; sub: string }> = {
  "auto-executed": { cls: "exec", word: "Executed", sub: "by autopilot" },
  approved: { cls: "exec", word: "Approved", sub: "by a human" },
  "awaiting-approval": { cls: "held", word: "Held", sub: "needs a human" },
  rejected: { cls: "block", word: "Rejected", sub: "by a human" },
  blocked: { cls: "block", word: "Blocked", sub: "by Scout" },
};

const SOURCE: Record<string, string> = {
  efficiency: "Proposed from backend revenue",
  "platform-signal": "Proposed from a platform-reported spike",
  "note-suggestion": "Proposed from a campaign note",
};

/** A decision as a signed slip. A new decision fades in once. */
export function DecisionSlip({ d, fresh, onWhy, onReview }: { d: Decision; fresh: boolean; onWhy: () => void; onReview?: (outcome: "approved" | "rejected", note: string, by: string) => Promise<void> }) {
  const root = useRef<HTMLElement>(null);
  const [note, setNote] = useState("");
  const [by, setBy] = useState(() => localStorage.getItem("reviewer") ?? "");
  const [busy, setBusy] = useState(false);
  const s = STAMP[d.status];

  useGSAP(
    () => {
      if (!fresh || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(root.current, { opacity: 0, duration: 0.2, ease: "power2.out" });
    },
    { scope: root, dependencies: [d.id, d.status], revertOnUpdate: true },
  );

  const review = async (outcome: "approved" | "rejected") => {
    const name = by.trim();
    if (!name) return;
    localStorage.setItem("reviewer", name);
    setBusy(true);
    try {
      await onReview?.(outcome, note, name);
    } finally {
      setBusy(false);
    }
  };

  const c = d.candidate;
  const isShift = c.type === "budget.shift" && c.from;
  return (
    <article className={`slip ${s.cls}`} ref={root} aria-label={`${d.id}: ${s.word.toLowerCase()}`}>
      <div className={`stamp ${s.cls}`}>
        {s.word}
        <small>{s.sub}</small>
      </div>
      <div className="slip-top">
        <span className="serial">{d.id}</span>
        <span className="source">{SOURCE[c.source] ?? c.source}</span>
      </div>
      <h3>{c.request}</h3>
      <div className="amount">
        {c.type === "budget.shift" || c.type === "budget.increase" ? "+" : "−"}
        {money(c.amountUsd)}
        <small>per day {isShift ? `to ${c.to?.name}` : c.to ? `on ${c.to.name}` : ""}</small>
      </div>
      <div className="facts">
        <span>
          Confidence <b>{d.confidence.value.toFixed(2)}</b>
          <span className="meter" aria-hidden="true">
            <i style={{ width: `${d.confidence.value * 100}%` }} />
          </span>
        </span>
        <span>
          Risk <b>{d.scout.risk.level}</b>
        </span>
        <span>
          Intent <b>{d.scout.intent}</b>
        </span>
        {d.status !== "blocked" && (
          <span>
            Expected <b>{c.expectedDailyRevenueDelta >= 0 ? "+" : "−"}{money(Math.abs(c.expectedDailyRevenueDelta))}</b>/day backend revenue
          </span>
        )}
      </div>
      <div className="slip-actions">
        <Button variant="tertiary" onClick={onWhy}>
          Why I did this
        </Button>
        {d.status === "awaiting-approval" && onReview && (
          <>
            <input className="by-input" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Your name" aria-label={`Reviewer name for ${d.id}`} />
            <input className="note-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for your decision (saved to the ledger)" aria-label={`Review note for ${d.id}`} />
            <Button disabled={busy || !by.trim()} onClick={() => review("approved")}>
              Approve
            </Button>
            <Button danger disabled={busy || !by.trim()} onClick={() => review("rejected")}>
              Reject
            </Button>
          </>
        )}
        {d.review && (
          <span className="reviewed">
            {d.review.outcome === "approved" ? "Approved" : "Rejected"} by {d.review.by}
            {d.review.note ? `: “${d.review.note}”` : ""}
          </span>
        )}
      </div>
    </article>
  );
}
