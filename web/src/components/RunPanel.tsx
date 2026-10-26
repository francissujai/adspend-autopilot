import { useEffect, useState } from "react";
import type { AutopilotEvent } from "../types";
import { REPLAY, SPEED } from "../replay";
import { useStore, type RunStatus } from "../store-context";
import { Trace } from "./Trace";

const LABEL: Record<RunStatus, string> = {
  idle: "Ready", queued: "Queued", running: "Running", waiting: "Waiting for you", done: "Done", failed: "Failed",
};

/** types: events that show the stage has started. count: the events that make up its number. */
interface Stage { key: string; label: string; types: AutopilotEvent["type"][]; count: AutopilotEvent["type"][]; unit: string }
const STAGES: Stage[] = [
  { key: "read", label: "Read ad data through Zetaris", types: ["evidence", "governance", "lines"], count: ["evidence"], unit: "queries" },
  { key: "check", label: "Check each move with Scout", types: ["scout", "candidate"], count: ["scout"], unit: "checked" },
  { key: "decide", label: "Decide: execute, hold or block", types: ["decision"], count: ["decision"], unit: "decisions" },
  { key: "explain", label: "Write the explanations", types: ["rationale"], count: ["rationale"], unit: "written" },
  { key: "act", label: "Move budgets", types: ["execution"], count: ["execution"], unit: "moves" },
  { key: "sign", label: "Sign into the ledger", types: ["ledger"], count: ["ledger"], unit: "entries" },
];

function stageStates(events: AutopilotEvent[], status: RunStatus) {
  const counts = STAGES.map((s) => events.filter((e) => s.types.includes(e.type)).length);
  const finished = events.some((e) => e.type === "cycle.done");
  const lastWithEvents = counts.reduce((acc, n, i) => (n ? i : acc), -1);
  return STAGES.map((s, i) => {
    let st: "pending" | "active" | "done" | "failed" = "pending";
    if (counts[i]) st = finished || i < lastWithEvents ? "done" : "active";
    else if (finished && i < STAGES.length) st = "done";
    if (status === "failed" && st === "active") st = "failed";
    const n = events.filter((e) => s.count.includes(e.type)).length;
    const detail = n ? `${n} ${s.unit}` : finished ? "none needed" : "";
    return { ...s, st, detail };
  });
}

function useElapsed(startedAt: number | null, running: boolean, finished: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [running]);
  if (finished !== null) return finished;
  if (startedAt === null) return null;
  return (now - startedAt) / 1000;
}

/** One place for the state of a cycle: status, elapsed time, stages, the raw event log, and run or retry. */
export function RunPanel({ recorded }: { recorded?: string }) {
  const { events, status, running, useModel, setUseModel, run, startedAt, finishedSeconds, state, error } = useStore();
  const elapsed = useElapsed(startedAt, running, finishedSeconds);
  const stages = stageStates(events, status);
  const start = events.find((e) => e.type === "cycle.start") as Extract<AutopilotEvent, { type: "cycle.start" }> | undefined;
  const last = state?.cycles[0];
  const done = [...events].reverse().find((e) => e.type === "cycle.done") as Extract<AutopilotEvent, { type: "cycle.done" }> | undefined;
  const shown = events.length > 0;

  return (
    <div className="run" aria-live="polite">
      <div className="run-top">
        <span className={`state ${status}`}><i aria-hidden />{REPLAY ? (running ? "Replaying" : "Replayed") : LABEL[status]}</span>
        {elapsed !== null && <span className="elapsed" aria-label={`Elapsed ${elapsed.toFixed(1)} seconds`}>{elapsed.toFixed(1)} s</span>}
      </div>

      {REPLAY ? (
        <div className="run-actions">
          <span className="runmeta">Recorded cycle <span className="mono">{REPLAY}</span>, replayed at {SPEED}x with its real timing.</span>
          <a className="btn ghost" href="/app">Back to live</a>
        </div>
      ) : (
        <>
          <div className="run-actions">
            <button className="btn" onClick={run} disabled={running}>
              {running && <span className="spinner" aria-hidden />}
              {running ? "Running a cycle" : status === "failed" ? "Run again" : "Run a cycle"}
            </button>
            {recorded && !running && <a className="btn ghost" href={`?replay=${encodeURIComponent(recorded)}&speed=${SPEED}`}>Watch recorded cycle</a>}
          </div>
          <label className="toggle">
            <input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} disabled={running} />
            Explain each decision with Nemotron
          </label>
        </>
      )}

      {status === "failed" && error && <div className="tamper" role="alert">{error}</div>}

      {shown && (
        <ol className="stages" aria-label="Cycle stages">
          {stages.map((s) => (
            <li key={s.key} className="stage" data-s={s.st}>
              <span className="mark" aria-hidden>{s.st === "done" ? "✓" : s.st === "failed" ? "!" : ""}</span>
              <span>{s.label}<span className="sr-only">: {s.st}</span></span>
              <span className="detail">{s.detail}</span>
            </li>
          ))}
        </ol>
      )}

      {shown && (
        <details>
          <summary className="runmeta" style={{ cursor: "pointer" }}>All events ({events.length})</summary>
          <Trace events={events} />
        </details>
      )}

      <p className="runmeta" style={{ margin: 0 }}>
        {start && !error
          ? `Cycle ${start.cycleId}, data as of ${start.asOf}, ${start.model}.`
          : last ? `Last cycle ${last.cycleId}, data as of ${last.asOf}.` : "No cycles yet."}
        {done && ` Finished in ${Math.round(done.seconds)} s: ${done.summary["auto-executed"]} executed, ${done.summary["awaiting-approval"]} waiting for you, ${done.summary.blocked} blocked.`}
      </p>
    </div>
  );
}
