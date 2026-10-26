import { useMemo, useRef, useState } from "react";
import { money } from "../api";
import { enter, useGSAP } from "../motion";
import { useStore } from "../store-context";
import type { Status } from "../types";
import { Empty, Segmented } from "../ui/bits";

type Filter = "all" | "auto-executed" | "awaiting-approval" | "blocked" | "reviewed";
const CHIP: Record<Status, { cls: string; word: string }> = {
  "auto-executed": { cls: "exec", word: "Executed" }, approved: { cls: "exec", word: "Approved" }, "awaiting-approval": { cls: "held", word: "Held" },
  rejected: { cls: "block", word: "Rejected" }, blocked: { cls: "block", word: "Blocked" },
};
const inGroup = (f: Filter, s: Status) => f === "all" || (f === "reviewed" ? s === "approved" || s === "rejected" : s === f);

export function Decisions() {
  const { allDecisions, setOpen, state } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => enter(".reveal"), { scope: root });
  const rows = useMemo(() => allDecisions.filter((d) => inGroup(filter, d.status)), [allDecisions, filter]);
  const count = (f: Filter) => allDecisions.filter((d) => inGroup(f, d.status)).length;

  return (
    <div className="page" ref={root}>
      <div className="page-head reveal">
        <div>
          <h1>Decisions</h1>
          <p>Every move the autopilot has proposed, across all cycles. Open one to see its evidence, the policy that decided it and the signed contract.</p>
        </div>
        <Segmented<Filter> label="Filter decisions" value={filter} onChange={setFilter} options={[
          { value: "all", label: "All", count: count("all") }, { value: "awaiting-approval", label: "Held", count: count("awaiting-approval") },
          { value: "auto-executed", label: "Executed", count: count("auto-executed") }, { value: "blocked", label: "Blocked", count: count("blocked") },
          { value: "reviewed", label: "Reviewed", count: count("reviewed") },
        ]} />
      </div>
      <div className="reveal">
        {rows.length ? (
          <div className="dtable">
            {rows.map((d) => {
              const chip = CHIP[d.status];
              return (
                <button key={d.id} className="drow" onClick={() => setOpen(d.id)} aria-label={`Open ${d.id}: ${d.candidate.request}`}>
                  <span className="serial">{d.id}</span>
                  <span className="req"><b>{d.candidate.request}</b><span>Cycle {d.cycleId}{d.review ? `, ${d.review.outcome} by ${d.review.by}` : ""}</span></span>
                  <span className="amt">{money(d.candidate.amountUsd)}<span className="muted small"> /day</span></span>
                  <span className="conf num muted">{d.confidence.value.toFixed(2)}</span>
                  <span className="chip-col"><span className={`chip ${chip.cls}`}>{chip.word}</span></span>
                </button>
              );
            })}
          </div>
        ) : (
          <Empty title={state && !state.decisions.length ? "No decisions yet" : "No decisions in this group"}>
            {state && !state.decisions.length ? "Run a cycle from Today and every proposed move is listed here." : "Choose another filter."}
          </Empty>
        )}
      </div>
    </div>
  );
}
