import { useEffect, useState } from "react";

const STEPS = [
  { t: "Read ad data and your orders through Zetaris", d: "Meta, Google and backend orders, read only" },
  { t: "Checked the claim against real revenue", d: "Platform claims 5.58x, backend orders show 0.97x" },
  { t: "Policy held the move for a person", d: "$5,000 is over the limit an agent may move alone" },
  { t: "Signed into the ledger", d: "Ed25519 signature, linked to the entry before it" },
];
const STATUS = ["Reading", "Checking", "Held for approval", "Held and signed"];
const STEP_MS = 1400, REST_MS = 3200;

/** Steps before the current one are done; the current one is in progress, except the last, which completes the record. */
function stepState(step: number, current: number) {
  if (step < current || (step === current && step === STEPS.length - 1)) return "done";
  return step === current ? "now" : "todo";
}

/** The hero view: one real decision moving through its states. Under reduced motion it shows the finished record. */
export function DecisionPreview({ entries }: { entries?: number }) {
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [i, setI] = useState(still ? STEPS.length - 1 : 0);
  useEffect(() => {
    if (still) return;
    const id = window.setTimeout(() => setI((v) => (v + 1) % STEPS.length), i === STEPS.length - 1 ? REST_MS : STEP_MS);
    return () => window.clearTimeout(id);
  }, [i, still]);

  const held = i >= 2;
  return (
    <>
      <div className="pv-window-bar"><span>Decision D-0002</span><span>{entries ? `Ledger: ${entries} entries` : "Ledger"}</span></div>
      <div className="pv-window-body">
        <div className="pv-head">
          <span className="pv-title"><span className="pv-amount">$5,000</span><span className="pv-sub">Shift to Meta, Lookalike 3%</span></span>
          <span className="pv-dot" style={{ "--c": held ? "var(--ds-warn)" : "var(--ds-text-2)" } as React.CSSProperties}>{STATUS[i]}</span>
        </div>
        <ol className="pv-steps" style={{ "--c": "var(--ds-warn)" } as React.CSSProperties}>
          {STEPS.map((s, j) => (
            <li key={s.t} data-s={stepState(j, i)}>
              <i aria-hidden="true" />
              <span>{s.t}<small>{s.d}</small></span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
