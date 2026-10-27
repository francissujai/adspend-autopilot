const STEPS = [
  { t: "Read ad data and your orders through Zetaris", d: "Meta, Google and backend orders, read only" },
  { t: "Checked the claim against real revenue", d: "Platform claims 5.58x, backend orders show 0.97x" },
  { t: "Policy held the move for a person", d: "$5,000 is over the limit an agent may move alone" },
  { t: "Signed into the ledger", d: "Ed25519 signature, linked to the entry before it" },
];
const STATUS = ["Reading", "Checking", "Held for approval", "Held and signed"];

/** Steps before the current one are done; the current one is in progress, except the last, which completes the record. */
function stepState(step: number, current: number) {
  if (step < current || (step === current && step === STEPS.length - 1)) return "done";
  return step === current ? "now" : "todo";
}

/** One real decision in the state of `step` (0 to 3): read, checked, held by policy, signed. */
export function DecisionPreview({ step, entries }: { step: number; entries?: number }) {
  const held = step >= 2;
  return (
    <>
      <div className="pv-window-bar"><span>Decision D-0002</span><span>{entries ? `Ledger: ${entries} entries` : "Ledger"}</span></div>
      <div className="pv-window-body">
        <div className="pv-head">
          <span className="pv-title"><span className="pv-amount">$5,000</span><span className="pv-sub">Shift to Meta, Lookalike 3%</span></span>
          <span className="pv-dot" style={{ "--c": held ? "var(--ds-warn)" : "var(--ds-text-2)" } as React.CSSProperties}>{STATUS[step]}</span>
        </div>
        <ol className="pv-steps" style={{ "--c": "var(--ds-warn)" } as React.CSSProperties}>
          {STEPS.map((s, j) => (
            <li key={s.t} data-s={stepState(j, step)}>
              <i aria-hidden="true" />
              <span>{s.t}<small>{s.d}</small></span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
