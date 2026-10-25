import type { AppState, AutopilotEvent, ReplayResult, TamperResult } from "./types";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  state: () => call<AppState>("/api/state"),
  runCycle: (useModel: boolean) => call<{ job: string }>("/api/cycle", { method: "POST", body: JSON.stringify({ useModel }) }),
  review: (id: string, outcome: "approved" | "rejected", by: string, note: string) =>
    call<{ approvalSeq: number; memory: { id: string; content: string } }>(`/api/decisions/${id}/review`, { method: "POST", body: JSON.stringify({ outcome, by, note }) }),
  replay: (id: string) => call<ReplayResult>(`/api/decisions/${id}/replay`),
  evidence: (cycleId: string, id: string) => call<{ id: string; purpose: string; sql: string; columns: string[]; rows: unknown[][]; rowsSha256: string; ms: number }>(`/api/cycles/${cycleId}/evidence/${id}`),
  tamper: () => call<TamperResult>("/api/ledger/tamper-demo", { method: "POST" }),
  savedEvents: (cycleId: string) => call<{ t: number; e: AutopilotEvent }[]>(`/api/cycles/${cycleId}/events`),
};

/** Live cycle: server-sent events until the job ends. */
export function follow(job: string, onEvent: (e: AutopilotEvent) => void, onEnd: () => void): () => void {
  const es = new EventSource(`/api/jobs/${job}/events`);
  es.onmessage = (m) => onEvent((JSON.parse(m.data) as { e: AutopilotEvent }).e);
  es.addEventListener("end", () => {
    es.close();
    onEnd();
  });
  es.onerror = () => {
    es.close();
    onEnd();
  };
  return () => es.close();
}

/** Saved cycle played back with its real timing, sped up. */
export function replayCycle(items: { t: number; e: AutopilotEvent }[], speed: number, onEvent: (e: AutopilotEvent) => void, onEnd: () => void): () => void {
  const timers = items.map((it) => window.setTimeout(() => onEvent(it.e), it.t / speed));
  const end = window.setTimeout(onEnd, (items.at(-1)?.t ?? 0) / speed + 200);
  return () => [...timers, end].forEach((t) => window.clearTimeout(t));
}

export const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
export const short = (h: string, n = 10) => (h.length > n ? `${h.slice(0, n)}…` : h);
