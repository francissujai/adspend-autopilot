import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, follow, replayCycle } from "./api";
import type { Move } from "./components/FlowBoard";
import { OPEN_PARAM, REPLAY, SPEED } from "./replay";
import { StoreCtx, type RunStatus, type Store } from "./store-context";
import type { AppState, AutopilotEvent, Decision, Line } from "./types";
import { useToast } from "./ui/toast-context";

export function StoreProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [state, setState] = useState<AppState | null>(null);
  const [events, setEvents] = useState<AutopilotEvent[]>([]);
  const [live, setLive] = useState<Decision[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [move, setMove] = useState<Move>();
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(OPEN_PARAM);
  const [running, setRunning] = useState(false);
  const [useModel, setUseModel] = useState(true);
  const [error, setError] = useState("");
  const [runFailed, setRunFailed] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedSeconds, setFinishedSeconds] = useState<number | null>(null);
  const pendingBudgets = useRef<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
      return s;
    } catch (e) {
      setError(`Cannot reach the autopilot API: ${(e as Error).message}. Start it with npm run serve.`);
      return undefined;
    }
  }, []);

  // First load: latest cycle's lines and the current sandbox budgets.
  useEffect(() => {
    refresh().then((s) => {
      if (!s || REPLAY) return;
      const cycle = s.cycles[0];
      if (cycle) setLines(cycle.lines);
      const b: Record<string, number> = {};
      for (const l of cycle?.lines ?? []) b[l.id] = s.platforms?.budgets[l.id]?.dailyBudget ?? l.dailyBudget;
      setBudgets(b);
    });
  }, [refresh]);

  const onEvent = useCallback((e: AutopilotEvent) => {
    setEvents((xs) => [...xs, e]);
    if (e.type === "error") {
      setError(e.message);
      setRunFailed(true);
    }
    if (e.type === "cycle.start") setStartedAt(Date.now());
    if (e.type === "cycle.done") setFinishedSeconds(e.seconds);
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
    // Capture before clearing: the state updater runs later, during render.
    const after = pendingBudgets.current;
    pendingBudgets.current = {};
    setBudgets((b) => ({ ...b, ...after }));
  }, []);

  // Replay mode: play a saved cycle with its real timing, sped up.
  useEffect(() => {
    if (!REPLAY) return;
    let stop = () => {};
    api.savedEvents(REPLAY)
      .then((items) => {
        setRunning(true);
        stop = replayCycle(items, SPEED, onEvent, () => setRunning(false));
      })
      .catch((e) => setError((e as Error).message));
    return () => stop();
  }, [onEvent]);

  const run = useCallback(async () => {
    setError("");
    setRunFailed(false);
    setEvents([]);
    setLive([]);
    setFresh(new Set());
    setStartedAt(null);
    setFinishedSeconds(null);
    setRunning(true);
    try {
      const { job } = await api.runCycle(useModel);
      follow(job, onEvent, async () => {
        setRunning(false);
        await refresh();
      });
    } catch (e) {
      setRunning(false);
      setRunFailed(true);
      setError((e as Error).message);
    }
  }, [useModel, onEvent, refresh]);

  const review = useCallback(async (id: string, outcome: "approved" | "rejected", note: string, by: string) => {
    setError("");
    try {
      await api.review(id, outcome, by, note);
      const s = await refresh();
      const d = s?.decisions.find((x) => x.id === id);
      setLive((xs) => xs.map((x) => (x.id === id && d ? d : x)));
      setFresh((f) => new Set(f).add(id));
      const exec = d?.executions?.at(-1);
      if (exec?.ok) onEvent({ type: "execution", id, receipt: exec });
      toast(outcome === "approved" ? `${id} approved and signed into the ledger` : `${id} rejected. The autopilot will trust this move less next time.`, true);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, false);
    }
  }, [refresh, onEvent, toast]);

  // Live decisions win while a cycle runs; otherwise show the latest cycle from the ledger.
  const decisions = useMemo(() => {
    let base: Decision[] = [];
    if (live.length) base = live;
    else if (state && !REPLAY) {
      const latest = state.cycles[0]?.cycleId;
      base = state.decisions.filter((d) => d.cycleId === latest);
    }
    const ordered = [...base].sort((a, b) => a.id.localeCompare(b.id));
    return ordered.map((d) => state?.decisions.find((x) => x.id === d.id && (x.review || x.status !== d.status)) ?? d);
  }, [live, state]);

  const allDecisions = useMemo(() => [...(state?.decisions ?? [])].sort((a, b) => b.id.localeCompare(a.id)), [state]);

  const hasStart = events.some((e) => e.type === "cycle.start");
  const finished = events.some((e) => e.type === "cycle.done");
  const awaiting = decisions.some((d) => d.status === "awaiting-approval");
  let status: RunStatus = "idle";
  if (running) status = hasStart ? "running" : "queued";
  else if (runFailed) status = "failed";
  else if (finished) status = awaiting ? "waiting" : "done";
  else if (!live.length && state?.cycles[0]) status = awaiting ? "waiting" : "done";

  const value: Store = {
    state, loading: !state && !error, events, decisions, allDecisions, lines, budgets, move, onMoveDone, fresh, running, status,
    startedAt, finishedSeconds, useModel, setUseModel, error, clearError: () => setError(""), open, setOpen, run, review, refresh,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

