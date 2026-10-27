import { useRef, useState } from "react";
import { api, short } from "../api";
import { Button } from "../ui/Button";
import type { AppState, TamperResult } from "../types";

const LABEL: Record<string, string> = { cycle: "Cycle evidence", decision: "Decision", approval: "Human review", execution: "Budget change", memory: "Trust memory" };

/** The signed, hash-chained ledger, newest first, with a tamper test on a copy. compact shows the latest few entries. */
export function LedgerChain({ ledger, compact = false }: { ledger: AppState["ledger"]; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [tamper, setTamper] = useState<TamperResult | null>(null);
  const [error, setError] = useState("");
  const runTamper = async () => {
    setError("");
    try {
      const r = await api.tamper();
      setTamper(r);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const broken = tamper?.result.firstBad?.seq;
  const all = [...ledger.entries].reverse();
  const entries = compact ? all.slice(0, 6) : all;
  return (
    <div className="panel" ref={root}>
      <h2>Decision ledger</h2>
      <div className={`verdict ${ledger.verify.ok ? "ok" : "bad"}`} role="status">
        {ledger.verify.ok
          ? ledger.verify.entries ? `Verified: ${ledger.verify.entries} entries, each signed with Ed25519 and chained to the one before` : "Empty. The first cycle starts the chain."
          : `Broken at #${ledger.verify.firstBad?.seq}: ${ledger.verify.firstBad?.reason}`}
      </div>
      {entries.length ? (
        <ol className="chain">
          {entries.map((e) => (
            <li key={e.seq} className={broken !== undefined && e.seq >= broken ? "broken" : ""}>
              <span className="seq">{e.seq}</span>
              <details>
                <summary>
                  {LABEL[e.type] ?? e.type} {e.ref ? <span className="mono">{e.ref}</span> : null}
                  <br />
                  <span className="h mono">{short(e.hash, 14)} ← {short(e.prevHash, 8)}</span>
                </summary>
                <dl>
                  <dt>hash</dt><dd className="mono">{e.hash}</dd>
                  <dt>previous</dt><dd className="mono">{e.prevHash}</dd>
                  <dt>signed by</dt><dd className="mono">{e.keyId}</dd>
                  <dt>signature</dt><dd className="mono">{e.signature}</dd>
                  <dt>at</dt><dd>{new Date(e.at).toLocaleString()}</dd>
                </dl>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="section-sub">No entries yet.</p>
      )}
      {compact && all.length > entries.length && <p className="runmeta">Showing the latest {entries.length} of {all.length}. The Ledger section has the full chain.</p>}
      <Button onClick={runTamper} disabled={!entries.length}>
        Edit a copy and verify it
      </Button>
      {tamper && (
        <div className="tamper" role="status">
          Changed entry #{tamper.seq} from “{tamper.original}” to “{tamper.tampered}”. Verification failed at #{tamper.result.firstBad?.seq}: {tamper.result.firstBad?.reason}. The real ledger is {tamper.originalStillValid ? "still valid" : "broken"}.
        </div>
      )}
      {error && <div className="tamper">{error}</div>}
    </div>
  );
}
