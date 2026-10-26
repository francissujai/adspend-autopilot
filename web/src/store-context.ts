import { createContext, useContext } from "react";
import type { Move } from "./components/FlowBoard";
import type { AppState, AutopilotEvent, Decision, Line } from "./types";

/** queued: asked but no event yet. waiting: finished, a human has to decide. */
export type RunStatus = "idle" | "queued" | "running" | "waiting" | "done" | "failed";

export interface Store {
  state: AppState | null;
  loading: boolean;
  events: AutopilotEvent[];
  decisions: Decision[];
  allDecisions: Decision[];
  lines: Line[];
  budgets: Record<string, number>;
  move?: Move;
  onMoveDone: () => void;
  fresh: Set<string>;
  running: boolean;
  status: RunStatus;
  startedAt: number | null;
  finishedSeconds: number | null;
  useModel: boolean;
  setUseModel: (v: boolean) => void;
  error: string;
  clearError: () => void;
  open: string | null;
  setOpen: (id: string | null) => void;
  run: () => Promise<void>;
  review: (id: string, outcome: "approved" | "rejected", note: string) => Promise<void>;
  refresh: () => Promise<AppState | undefined>;
}
export const StoreCtx = createContext<Store | null>(null);
export const useStore = () => useContext(StoreCtx)!;

