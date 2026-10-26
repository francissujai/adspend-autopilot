import { money, short } from "../api";
import type { AutopilotEvent } from "../types";

/** What the autopilot is doing right now, one line per step. */
export function Trace({ events }: { events: AutopilotEvent[] }) {
  const start = events.find((e) => e.type === "cycle.start");
  const modelOff = start?.type === "cycle.start" && start.model.startsWith("template");
  const items = events.flatMap((e, i): { k: string; who: string; what: React.ReactNode }[] => {
    switch (e.type) {
      case "cycle.start":
        return [{ k: `s${i}`, who: "Cycle", what: <>Started {e.cycleId}, as {e.identity.split(" (")[0]}</> }];
      case "evidence":
        return [{ k: `e${i}`, who: "Zetaris", what: <><span className="mono">{e.id}</span> {e.purpose.split(":")[0]}: {e.rows} rows in {e.ms} ms{e.error ? `, failed: ${e.error}` : ""}</> }];
      case "governance":
        return [{ k: `g${i}`, who: "Zetaris", what: e.allowed ? <>Customer data is readable by this identity. Set the agent key.</> : e.unreachable ? <>Could not check customer-data access: Zetaris unreachable</> : <>Read of customer data refused, as configured</> }];
      case "scout":
        return [{ k: `c${i}`, who: "Scout", what: <><span className="mono">{e.id}</span> {e.intent}, risk {e.risk}{e.flags ? `, ${e.flags} flags` : ""}{e.contract ? ", contract signed" : ", no contract"} ({e.ms} ms)</> }];
      case "rationale":
        if (e.by === "template") return [{ k: `r${i}`, who: "Template", what: <><span className="mono">{e.id}</span> explained{modelOff ? " (model off)" : " (model unavailable)"}</> }];
        return [{ k: `r${i}`, who: "Nemotron", what: <><span className="mono">{e.id}</span> explained{e.model ? ` by ${e.model}` : ""}</> }];
      case "execution":
        return [{ k: `x${i}`, who: "Platform", what: e.receipt.ok ? <>{e.receipt.changes.map((c) => `${c.name} ${money(c.before)} to ${money(c.after)}`).join("; ")}</> : <>Refused: {e.receipt.reason}</> }];
      case "ledger":
        return [{ k: `l${i}`, who: "Ledger", what: <>#{e.seq} {e.kind} signed <span className="mono">{short(e.hash, 12)}</span></> }];
      case "cycle.done":
        return [{ k: `d${i}`, who: "Cycle", what: <>Done in {Math.round(e.seconds)} s</> }];
      case "error":
        return [{ k: `x${i}`, who: "Error", what: e.message }];
      default:
        return [];
    }
  });
  if (!items.length) return <p className="section-sub">Run a cycle to watch each step: data read through Zetaris, intent checks, decisions and signatures.</p>;
  return (
    <ol className="log">
      {items.map((it) => (
        <li key={it.k}>
          <span className="who">{it.who}</span>
          <span className="what">{it.what}</span>
        </li>
      ))}
    </ol>
  );
}
