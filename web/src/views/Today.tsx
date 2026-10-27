import { useRef } from "react";
import { T_BASE } from "../motion";
import { AnimatePresence, m } from "motion/react";
import { ButtonLink } from "../ui/Button";
import { DecisionSlip } from "../components/DecisionSlip";
import { FlowBoard } from "../components/FlowBoard";
import { LedgerChain } from "../components/LedgerChain";
import { RunPanel } from "../components/RunPanel";
import { money } from "../api";
import { REPLAY } from "../replay";
import { useStore } from "../store-context";
import { Empty, TodaySkeleton } from "../ui/bits";

export function Today() {
  const s = useStore();
  const root = useRef<HTMLDivElement>(null);
  if (s.loading) return <div className="page"><TodaySkeleton /></div>;

  const moved = s.decisions.filter((d) => d.status === "auto-executed").reduce((sum, d) => sum + d.candidate.amountUsd, 0);
  const recorded = s.state?.savedCycles[0];
  const waiting = s.decisions.filter((d) => d.status === "awaiting-approval").length;

  return (
    <m.div className="page" ref={root} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={T_BASE}>
      <div className="today">
        <div>
          <h1 className="hero-title">Budget moves you can audit.</h1>
          <p className="lede">The autopilot reads Meta, Google and your own orders, moves money to what earns on real revenue, and signs every decision.</p>
          <RunPanel recorded={recorded} />
        </div>
        <div>
          <FlowBoard lines={s.lines} budgets={s.budgets} move={s.move} onMoveDone={s.onMoveDone} />
        </div>
      </div>

      {s.error && s.status !== "failed" && <div className="tamper" role="alert" style={{ marginTop: 24 }}>{s.error}</div>}

      <div className="cols" style={{ marginTop: 40 }}>
        <section>
          <h2 className="section-title">{REPLAY ? "Decisions in this cycle" : "This cycle"}</h2>
          <p className="section-sub">
            {s.decisions.length
              ? `${s.decisions.length} decisions. ${money(moved)} a day moved automatically${waiting ? `, ${waiting} waiting for you` : ""}.`
              : "Each budget move becomes a signed slip: executed, held for you, or blocked."}
          </p>
          <div className="slips">
            {s.decisions.length ? (
              <AnimatePresence initial={false}>
                {s.decisions.map((d) => (
                  <DecisionSlip key={d.id} d={d} fresh={s.fresh.has(d.id)} onWhy={() => s.setOpen(d.id)} onReview={REPLAY ? undefined : (o, n, b) => s.review(d.id, o, n, b)} />
                ))}
              </AnimatePresence>
            ) : (
              <Empty title={REPLAY ? "Replaying the recorded cycle" : "No decisions yet"}>
                {REPLAY ? "Decisions appear as they did when the cycle ran." : <>Run a cycle and the autopilot proposes moves from this week's data.{recorded ? " No Zetaris? Watch a recorded cycle instead." : ""}</>}
                {!REPLAY && recorded && <div><ButtonLink href={`?replay=${encodeURIComponent(recorded)}&speed=8`}>Watch recorded cycle</ButtonLink></div>}
              </Empty>
            )}
          </div>
        </section>
        <aside>{s.state && <LedgerChain ledger={s.state.ledger} compact />}</aside>
      </div>
    </m.div>
  );
}
