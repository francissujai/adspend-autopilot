import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, follow, money, replayCycle } from "./api";
import { DecisionSlip } from "./components/DecisionSlip";
import { FlowBoard, type Move } from "./components/FlowBoard";
import { LedgerChain } from "./components/LedgerChain";
import { Trace } from "./components/Trace";
import { WhyDrawer } from "./components/WhyDrawer";
import type { AppState, AutopilotEvent, Decision, Line } from "./types";

const params = new URLSearchParams(location.search);
const REPLAY = params.get("replay");
const SPEED = Number(params.get("speed")) || 8;

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [events, setEvents] = useState<AutopilotEvent[]>([]);
  const [live, setLive] = useState<Decision[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [move, setMove] = useState<Move>();
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(params.get("open"));
  const [running, setRunning] = useState(false);
  const [useModel, setUseModel] = useState(true);
  const [error, setError] = useState("");
  const pendingBudgets = useRef<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const s = await api.state();
    setState(s);
    return s;
  }, []);

  // Initial load: latest cycle's lines, current sandbox budgets.
  useEffect(() => {
    refresh()
      .then((s) => {
        if (REPLAY) return;
        const cycle = s.cycles[0];
        if (cycle) setLines(cycle.lines);
        const b: Record<string, number> = {};
        for (const l of cycle?.lines ?? []) b[l.id] = s.platforms?.budgets[l.id]?.dailyBudget ?? l.dailyBudget;
        setBudgets(b);
      })
      .catch((e) => setError(`Cannot reach the autopilot API: ${(e as Error).message}. Start it with npm run serve.`));
  }, [refresh]);

  const onEvent = useCallback((e: AutopilotEvent) => {
    setEvents((xs) => [...xs, e]);
    if (e.type === "lines") {
      setLines(e.lines);
      setBudgets(Object.fromEntries(e.lines.map((l) => [l.id, l.dailyBudget])));
    }
    if (e.type === "decision") {
      setLive((xs) => [...xs.filter((x) => x.id !== e.record.id), e.record]);
      setFresh((s) => new Set(s).add(e.record.id));
    }
    if (e.type === "rationale") setLive((xs) => xs.map((x) => (x.id === e.id ? { ...x, rationale: { text: e.text, by: e.by as "nemotron" | "template", model: e.model } } : x)));
    if (e.type === "execution" && e.receipt.ok) {
      const from = e.receipt.changes.find((c) => c.after < c.before);
      const to = e.receipt.changes.find((c) => c.after > c.before);
      for (const c of e.receipt.changes) pendingBudgets.current[c.lineId] = c.after;
      setMove({ key: `${e.id}-${e.receipt.at}`, fromId: from?.lineId, toId: to?.lineId, amount: to ? to.after - to.before : 0 });
    }
  }, []);

  const onMoveDone = useCallback(() => {
    setBudgets((b) => ({ ...b, ...pendingBudgets.current }));
    pendingBudgets.current = {};
  }, []);

  // Replay mode: play a saved cycle with its real timing, sped up.
  useEffect(() => {
    if (!REPLAY) return;
    let stop = () => {};
    api
      .savedEvents(REPLAY)
      .then((items) => {
        setRunning(true);
        stop = replayCycle(items, SPEED, onEvent, () => setRunning(false));
      })
      .catch((e) => setError((e as Error).message));
    return () => stop();
  }, [onEvent]);

  const run = async () => {
    setError("");
    setEvents([]);
    setLive([]);
    setFresh(new Set());
    setRunning(true);
    try {
      const { job } = await api.runCycle(useModel);
      follow(job, onEvent, async () => {
        setRunning(false);
        await refresh();
      });
    } catch (e) {
      setRunning(false);
      setError((e as Error).message);
    }
  };

  const review = async (id: string, outcome: "approved" | "rejected", note: string) => {
    setError("");
    try {
      const by = localStorage.getItem("reviewer") || "Marketer";
      await api.review(id, outcome, by, note);
      const s = await refresh();
      const d = s.decisions.find((x) => x.id === id);
      setLive((xs) => xs.map((x) => (x.id === id && d ? d : x)));
      setFresh((f) => new Set(f).add(id));
      const exec = d?.executions?.at(-1);
      if (exec?.ok) onEvent({ type: "execution", id, receipt: exec });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Live decisions win while a cycle runs; otherwise show the latest cycle from the ledger.
  const decisions = useMemo(() => {
    if (live.length) return live;
    if (!state || REPLAY) return [];
    const latest = state.cycles[0]?.cycleId;
    return state.decisions.filter((d) => d.cycleId === latest);
  }, [live, state]);
  // Read in decision order: what was executed, what waits, what was blocked.
  const ordered = [...decisions].sort((a, b) => a.id.localeCompare(b.id));
  const merged = ordered.map((d) => state?.decisions.find((x) => x.id === d.id && (x.review || x.status !== d.status)) ?? d);
  const openDecision = merged.find((d) => d.id === open) ?? state?.decisions.find((d) => d.id === open);
  const ledgerSeq = state?.ledger.entries.find((e) => e.type === "decision" && e.ref === open)?.seq;

  const gov = [...events].reverse().find((e) => e.type === "governance") as Extract<AutopilotEvent, { type: "governance" }> | undefined;
  const governance = gov ? { allowed: gov.allowed, detail: gov.detail } : state?.cycles[0]?.governance;
  const done = [...events].reverse().find((e) => e.type === "cycle.done") as Extract<AutopilotEvent, { type: "cycle.done" }> | undefined;
  const start = events.find((e) => e.type === "cycle.start") as Extract<AutopilotEvent, { type: "cycle.start" }> | undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#15233F" />
            <circle cx="16" cy="16" r="9" fill="none" stroke="#EAF2EE" strokeWidth="2.4" strokeDasharray="3 2" />
            <path d="M11.5 16.5l3 3 6-7" fill="none" stroke="#7FD1A6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Ad Spend Autopilot
        </div>
        {governance && (
          <span className={`seal ${governance.allowed ? "warn" : "ok"}`} title={governance.detail}>
            <span className="dot">{governance.allowed ? "!" : "✓"}</span>
            {governance.allowed ? <>Agent can read customer data: <b>set its own Zetaris key</b></> : <><b>Agent can't read customer data</b>, enforced by Zetaris</>}
          </span>
        )}
        {state && (
          <span className={`seal ${state.ledger.verify.ok ? "ok" : "bad"}`}>
            <span className="dot">{state.ledger.verify.ok ? "✓" : "✕"}</span>
            <b>Ledger {state.ledger.verify.ok ? "verified" : "broken"}</b> ({state.ledger.verify.entries} entries)
          </span>
        )}
      </header>

      <section className="hero">
        <div>
          <h1>Budget moves you can audit.</h1>
          <p className="lede">The autopilot reads Meta, Google and your own orders through Zetaris, moves money to what earns on real revenue, and signs every decision. Risky moves wait for you.</p>
          <div className="run">
            {REPLAY ? (
              <span className="runmeta">
                Replay of {REPLAY} at {SPEED}x speed{running ? "" : ", finished"}
              </span>
            ) : (
              <>
                <button className="btn" onClick={run} disabled={running}>
                  {running ? "Running a cycle" : "Run a cycle"}
                </button>
                <label className="toggle">
                  <input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} disabled={running} />
                  Explain each decision with Nemotron
                </label>
              </>
            )}
            <span className="runmeta">
              {start ? `${start.cycleId}, data as of ${start.asOf}, model ${start.model}` : state?.cycles[0] ? `Last cycle ${state.cycles[0].cycleId}, data as of ${state.cycles[0].asOf}` : "No cycles yet"}
            </span>
            {done && (
              <span className="runmeta">
                Finished in {Math.round(done.seconds)} s: {done.summary["auto-executed"]} executed, {done.summary["awaiting-approval"]} waiting for you, {done.summary.blocked} blocked
              </span>
            )}
          </div>
        </div>
        <FlowBoard lines={lines} budgets={budgets} move={move} onMoveDone={onMoveDone} />
      </section>

      {error && <div className="tamper" role="alert">{error}</div>}

      <div className="cols">
        <section>
          <h2 className="section-title">Decisions</h2>
          <p className="section-sub">
            {merged.length
              ? `${merged.length} decisions in this cycle. Total moved automatically: ${money(merged.filter((d) => d.status === "auto-executed").reduce((s, d) => s + d.candidate.amountUsd, 0))} a day.`
              : "Each budget move becomes a signed slip: executed, held for you, or blocked."}
          </p>
          <div className="slips">
            {merged.length ? (
              merged.map((d) => <DecisionSlip key={d.id} d={d} fresh={fresh.has(d.id)} onWhy={() => setOpen(d.id)} onReview={(o, n) => review(d.id, o, n)} />)
            ) : (
              <div className="empty">No decisions yet. Run a cycle and the autopilot will propose moves from this week's data.</div>
            )}
          </div>
        </section>
        <aside>
          <div className="panel">
            <h2>What the autopilot is doing</h2>
            <Trace events={events} />
          </div>
          {state && <LedgerChain ledger={state.ledger} />}
        </aside>
      </div>

      {openDecision && <WhyDrawer d={openDecision} ledgerSeq={ledgerSeq} onClose={() => setOpen(null)} />}
    </div>
  );
}
