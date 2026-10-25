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
 * Every ad line: its daily budget (bar; striped when budget-limited) and its
 * ROAS on backend orders, plus the platform's claim where the two disagree.
 * An executed move sends a coin from donor to recipient while both bars
 * tween to their new widths.
 */
export function FlowBoard({ lines, budgets, move, onMoveDone }: { lines: Line[]; budgets: Record<string, number>; move?: Move; onMoveDone?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const coin = useRef<HTMLDivElement>(null);
  const scale = Math.max(1600, ...lines.map((l) => budgets[l.id] ?? l.dailyBudget));
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const last = useRef<string | undefined>(undefined);

  const { contextSafe } = useGSAP({ scope: root });

  const animate = contextSafe((m: Move) => {
    const board = root.current!;
    const box = board.getBoundingClientRect();
    const barEnd = (id?: string) => {
      const el = id ? board.querySelector<HTMLElement>(`[data-bar="${id}"]`) : null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.right - box.left, y: r.top - box.top + r.height / 2 - 11 };
    };
    const from = barEnd(m.fromId);
    const to = barEnd(m.toId);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tl = gsap.timeline({ onComplete: onMoveDone });
    if (coin.current && to) {
      gsap.set(coin.current, { x: (from ?? to).x - 30, y: (from ?? to).y, opacity: 0, scale: 0.6 });
      if (reduce) tl.set(coin.current, { opacity: 0 });
      else
        tl.to(coin.current, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" })
          .to(coin.current, { x: to.x - 30, y: to.y, duration: 1.1, ease: "power2.inOut" })
          .to(coin.current, { opacity: 0, scale: 0.6, duration: 0.25 }, "+=0.15");
    }
    for (const [id, delta] of [[m.fromId, -m.amount], [m.toId, m.amount]] as const) {
      const bar = id ? board.querySelector<HTMLElement>(`[data-bar="${id}"]`) : null;
      if (bar) tl.to(bar, { width: pct((budgets[id!] ?? 0) + delta), duration: reduce ? 0 : 0.9, ease: "power3.inOut" }, reduce ? 0 : 0.55);
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
            <div className="track" aria-label={`Daily budget ${money(b)}`}>
              <div className={`bar${l.budgetLostShare7 >= 0.2 ? " limited" : ""}`} data-bar={l.id} style={{ width: pct(b) }} />
            </div>
            <div className="amt">{money(b)}</div>
          </div>
        );
      })}
      <div className="legend">
        <span><i style={{ background: "var(--paper-deep)", boxShadow: "inset 0 0 0 1px var(--rule)" }} />daily budget</span>
        <span><i style={{ background: "repeating-linear-gradient(135deg,var(--paper-deep) 0 3px,#d2e3da 3px 6px)" }} />budget-limited: lost delivery to budget</span>
      </div>
      <div className="coin" ref={coin} aria-hidden="true">{move ? `+${money(move.amount)}` : ""}</div>
    </div>
  );
}
