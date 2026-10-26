import { useEffect, useRef, useState } from "react";
import { api, money, short } from "../api";
import { DUR, gsap, reducedMotion, useGSAP } from "../motion";
import type { Decision, ReplayResult } from "../types";
import { Crumbs } from "../ui/bits";

type EvidenceDetail = Awaited<ReturnType<typeof api.evidence>>;

/** Everything behind one decision, and a button to prove it can be re-derived. */
export function WhyDrawer({ d, ledgerSeq, onClose, onAll }: { d: Decision; ledgerSeq?: number; onClose: () => void; onAll: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [ev, setEv] = useState<EvidenceDetail | null>(null);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useGSAP(() => {
    if (!reducedMotion()) gsap.from(panel.current, { xPercent: 100, duration: DUR.stamp + 0.1 });
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose, opener]);

  const loadEvidence = async (id: string) => {
    setError("");
    try {
      setEv(await api.evidence(d.cycleId, id));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const runReplay = async () => {
    setBusy(true);
    setError("");
    try {
      setReplay(await api.replay(d.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const c = d.candidate;
  const contract = d.scout.contract;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Why the autopilot decided ${d.id}`}>
        <button className="btn ghost sm close" onClick={onClose}>
          Close
        </button>
        <Crumbs items={[{ label: "Decisions", onClick: onAll }, { label: d.id }]} />
        <h2>{c.request}</h2>
        <div className="why">{d.rationale.text || "No explanation recorded."}</div>
        <div className="byline">
          {d.rationale.by === "nemotron" ? `Written by ${d.rationale.model ?? "Nemotron"} through Meterless Nightshift. The decision itself came from policy, not the model.` : `Template explanation${d.rationale.error ? ` (model unavailable: ${d.rationale.error})` : ""}.`}
        </div>

        <h3>Why the policy decided {d.status === "auto-executed" ? "to act" : d.status === "blocked" ? "to block" : "to wait for a human"}</h3>
        <ul className="reasons">
          {d.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <h3>Confidence {d.confidence.value.toFixed(2)}</h3>
        <dl className="kv">
          {d.confidence.factors.map((f) => (
            <div key={f.name} style={{ display: "contents" }}>
              <dt>{f.name}</dt>
              <dd>
                <span className="mono">{f.value.toFixed(2)}</span> {f.note.replace(/\$(\d+)/g, (_, n: string) => money(Number(n)))}
              </dd>
            </div>
          ))}
        </dl>
        {d.trust.length > 0 && <p className="byline">Lowered by trust memory: {d.trust.map((t) => t.content).join("; ")}</p>}

        {c.untrusted.length > 0 && (
          <>
            <h3>Untrusted text this move came from</h3>
            {c.untrusted.map((u) => (
              <div className="untrusted" key={u.source}>
                {u.source}: <q>{u.text}</q>
              </div>
            ))}
          </>
        )}
        {d.scout.risk.flags.length > 0 && (
          <>
            <h3>Scout guard flags</h3>
            <ul className="flags">
              {d.scout.risk.flags.map((f, i) => (
                <li key={i}>
                  <b>{f.outcome === "block" ? "Block" : "Warn"}</b> {f.layer}/{f.kind}: {f.evidence}
                </li>
              ))}
            </ul>
          </>
        )}

        <h3>Evidence, read through Zetaris</h3>
        <div className="ev-list">
          {d.evidenceDigest.map((e) => (
            <button key={e.id} className="ev-btn" aria-pressed={ev?.id === e.id} onClick={() => loadEvidence(e.id)} title={`rows SHA-256 ${e.rowsSha256}`}>
              {e.id}
            </button>
          ))}
        </div>
        {ev && (
          <div>
            <p className="byline">{ev.purpose}. Rows hash {short(ev.rowsSha256, 16)}</p>
            <pre className="sql">{ev.sql}</pre>
            <table className="rows">
              <thead>
                <tr>{ev.columns.map((col) => <th key={col}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {ev.rows.slice(0, 12).map((r, i) => (
                  <tr key={i}>{r.map((v, j) => <td key={j}>{String(v ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>Signed execution contract</h3>
        {contract ? (
          <dl className="kv">
            <dt>contract</dt>
            <dd className="mono">{contract.contractId}</dd>
            <dt>intent</dt>
            <dd>{contract.intent.primary.id} ({contract.intent.primary.confidence})</dd>
            <dt>allowed to</dt>
            <dd>{contract.scope.capabilities.join(", ")}{contract.scope.budget ? `, up to $${contract.scope.budget.costMaxUSD}/day` : ""}</dd>
            <dt>needs</dt>
            <dd>{contract.risk.approvalsRequired.join(", ") || "no approval"}</dd>
            <dt>expires</dt>
            <dd>{new Date(contract.expiresAt).toLocaleString()}</dd>
            <dt>policy packs</dt>
            <dd>{contract.policyPackVersion}</dd>
            <dt>signature</dt>
            <dd className="mono">{short(contract.signature, 34)}</dd>
          </dl>
        ) : (
          <p className="byline">No contract: Scout blocked this request, so nothing could execute it.</p>
        )}
        {ledgerSeq !== undefined && <p className="byline">Recorded as ledger entry #{ledgerSeq}.</p>}

        <h3>Replay this decision</h3>
        <p className="byline">Rebuilds the inputs from the rows stored in the ledger, runs the same deterministic pipeline, and checks every signature.</p>
        <button className="btn" onClick={runReplay} disabled={busy}>
          {busy ? "Replaying" : "Replay this decision"}
        </button>
        {replay && (
          <table className="replay-table" style={{ marginTop: 12 }}>
            <tbody>
              {Object.entries(replay.compare).map(([k, [a, b]]) => (
                <tr key={k}>
                  <td>{replay.diffs.includes(k) ? <span className="cross">✕</span> : <span className="tick">✓</span>}</td>
                  <td>{k}</td>
                  <td className="mono">{String(a)}</td>
                  <td className="mono">{String(b)}</td>
                </tr>
              ))}
              <tr>
                <td>{replay.evidenceIntact ? <span className="tick">✓</span> : <span className="cross">✕</span>}</td>
                <td colSpan={3}>Evidence rows match their recorded SHA-256</td>
              </tr>
              <tr>
                <td>{replay.ledger.ok ? <span className="tick">✓</span> : <span className="cross">✕</span>}</td>
                <td colSpan={3}>Ledger hash chain and Ed25519 signatures</td>
              </tr>
              <tr>
                <td>{replay.contract.ok ? <span className="tick">✓</span> : <span className="cross">–</span>}</td>
                <td colSpan={3}>Scout contract signature {replay.contract.ok ? "valid" : `(${replay.contract.reason})`}</td>
              </tr>
              <tr>
                <td colSpan={4}>
                  <b>{replay.match ? "The replay reproduces this decision exactly." : `The replay differs on: ${replay.diffs.join(", ")}`}</b>
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {error && <div className="tamper">{error}</div>}
      </aside>
    </>
  );
}
