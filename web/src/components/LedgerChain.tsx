import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { api, short } from "../api";
import type { AppState, TamperResult } from "../types";

const LABEL: Record<string, string> = { cycle: "Cycle evidence", decision: "Decision", approval: "Human review", execution: "Budget change", memory: "Trust memory" };

/** The signed, hash-chained ledger, newest first, with a tamper test on a copy. */
export function LedgerChain({ ledger }: { ledger: AppState["ledger"] }) {
  const root = useRef<HTMLDivElement>(null);
  const [tamper, setTamper] = useState<TamperResult | null>(null);
  const [error, setError] = useState("");
  const { contextSafe } = useGSAP({ scope: root });

  const runTamper = contextSafe(async () => {
    setError("");
    try {
      const r = await api.tamper();
      setTamper(r);
      requestAnimationFrame(() => {
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(".broken", { x: -4 }, { x: 0, duration: 0.4, ease: "elastic.out(1,0.3)" });
      });
    } catch (e) {
      setError((e as Error).message);
    }
  });

  const broken = tamper?.result.firstBad?.seq;
  const entries = [...ledger.entries].reverse().slice(0, 12);
  return (
    <div className="panel" ref={root}>
      <h2>Decision ledger</h2>
      <div className={`verdict ${ledger.verify.ok ? "ok" : "bad"}`}>
        {ledger.verify.ok ? `Verified: ${ledger.verify.entries} entries, each signed with Ed25519 and chained to the one before` : `Broken at #${ledger.verify.firstBad?.seq}: ${ledger.verify.firstBad?.reason}`}
      </div>
      {entries.length ? (
        <ol className="chain">
          {entries.map((e) => (
            <li key={e.seq} className={broken !== undefined && e.seq >= broken ? "broken" : ""}>
              <span className="seq">{e.seq}</span>
              <span>
                {LABEL[e.type] ?? e.type} {e.ref ? <span className="mono">{e.ref}</span> : null}
                <br />
                <span className="h mono" title={`hash ${e.hash}\nprev ${e.prevHash}\nkey ${e.keyId}`}>
                  {short(e.hash, 14)} ← {short(e.prevHash, 8)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="section-sub">No entries yet.</p>
      )}
      <button className="btn ghost" onClick={runTamper} disabled={!entries.length}>
        Edit a copy and verify it
      </button>
      {tamper && (
        <div className="tamper" role="status">
          Changed entry #{tamper.seq} from “{tamper.original}” to “{tamper.tampered}”. Verification failed at #{tamper.result.firstBad?.seq}: {tamper.result.firstBad?.reason}. The real ledger is {tamper.originalStillValid ? "still valid" : "broken"}.
        </div>
      )}
      {error && <div className="tamper">{error}</div>}
    </div>
  );
}
