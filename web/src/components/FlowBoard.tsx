import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
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
 * An executed move resizes both bars to their new budgets (250 ms).
 */
export function FlowBoard({ lines, budgets, move, onMoveDone }: { lines: Line[]; budgets: Record<string, number>; move?: Move; onMoveDone?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const scale = Math.max(1600, ...lines.map((l) => budgets[l.id] ?? l.dailyBudget));
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const last = useRef<string | undefined>(undefined);

  const { contextSafe } = useGSAP({ scope: root });

  const animate = contextSafe((m: Move) => {
    const board = root.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tl = gsap.timeline({ onComplete: onMoveDone });
    for (const [id, delta] of [[m.fromId, -m.amount], [m.toId, m.amount]] as const) {
      const bar = id ? board.querySelector<HTMLElement>(`[data-bar="${id}"]`) : null;
      if (bar) tl.to(bar, { width: pct((budgets[id!] ?? 0) + delta), duration: reduce ? 0 : 0.25, ease: "power2.out" }, 0);
    }
  });

  useEffect(() => {
    if (move && move.key !== last.current) {
      last.current = move.key;
      animate(move);
    }
  }, [move, animate]);

  if (!lines.length) return <div className="board empty">Run a cycle to load ad lines from Zetaris.</div>;
  const sorted = [...lines].sort((a, b) => (a.platform === b.platform ? b.backendRoas7 - a.backendRoas7 : a.platform === "meta" ? -1 : 1));
  return (
    <div className="board" ref={root}>
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
              <div className={`bar-fill${l.budgetLostShare7 >= 0.2 ? " limited" : ""}`} data-bar={l.id} style={{ width: pct(b) }} />
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
