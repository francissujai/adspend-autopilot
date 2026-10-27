import { useEffect, useRef } from "react";
import { m } from "motion/react";
import { SPRING } from "../motion";
import { money } from "../api";
import type { Line } from "../types";

export interface Move {
  key: string;
  fromId?: string;
  toId?: string;
  amount: number;
}

/**
 * Every ad line: its daily budget (bar; outlined when budget-limited) and its
 * ROAS on backend orders, plus the platform's claim where the two disagree.
 * An executed move gives both bars their new budgets and they resize with a layout animation.
 */
export function FlowBoard({ lines, budgets, move, onMoveDone }: { lines: Line[]; budgets: Record<string, number>; move?: Move; onMoveDone?: () => void }) {
  const scale = Math.max(1600, ...lines.map((l) => budgets[l.id] ?? l.dailyBudget));
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const last = useRef<string | undefined>(undefined);

  // a new move updates the budgets at once; the bars then resize through their layout animation
  useEffect(() => {
    if (move && move.key !== last.current) {
      last.current = move.key;
      onMoveDone?.();
    }
  }, [move, onMoveDone]);

  if (!lines.length) return <div className="board empty">Run a cycle to load ad lines from Zetaris.</div>;
  const sorted = [...lines].sort((a, b) => (a.platform === b.platform ? b.backendRoas7 - a.backendRoas7 : a.platform === "meta" ? -1 : 1));
  return (
    <div className="board">
      <div className="board-head">
        <h2>Daily budget and return, by ad line</h2>
        <small>last 7 days, read through Zetaris</small>
      </div>
      {sorted.map((l) => {
        const b = budgets[l.id] ?? l.dailyBudget;
        const gap = l.platformRoas3 > 0 && l.backendRoas3 > 0 && l.platformRoas3 / l.backendRoas3 > 2;
        return (
          <div className="lane" key={l.id}>
            <div className="name">
              {l.name}
              <span>
                {l.platform === "meta" ? "Meta" : "Google"}, backend {l.backendRoas7}x{gap ? `, platform claims ${l.platformRoas3}x` : ""}
              </span>
            </div>
            <div className="track" role="img" aria-label={`Daily budget ${money(b)}`}>
              <m.div layout className={`bar-fill${l.budgetLostShare7 >= 0.2 ? " limited" : ""}`} data-bar={l.id} style={{ width: pct(b) }} transition={SPRING} />
            </div>
            <div className="amt">{money(b)}</div>
          </div>
        );
      })}
      <div className="legend">
        <span><i style={{ background: "var(--paper-deep)", boxShadow: "inset 0 0 0 1px var(--rule)" }} />daily budget</span>
        <span><i style={{ background: "var(--paper)", boxShadow: "inset 0 0 0 1px var(--ink-soft)" }} />budget-limited: lost delivery to budget</span>
      </div>
    </div>
  );
}
