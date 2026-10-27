import { useRef } from "react";
import { ButtonLink } from "../ui/Button";
import { SPEED } from "../replay";
import { useStore } from "../store-context";
import { Empty } from "../ui/bits";

/** Turns a cycle id like C-20261026031020 into "Oct 26, 03:10 UTC". */
function cycleTime(id: string) {
  const m = /^C-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(id);
  if (!m) return id;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return `${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

export function Replays() {
  const { state } = useStore();
  const root = useRef<HTMLDivElement>(null);
  const saved = state?.savedCycles ?? [];
  return (
    <div className="page" ref={root}>
      <div className="page-head">
        <div>
          <h1>Replays</h1>
          <p>Finished cycles are recorded with their real timing. Replaying one shows the run as it happened, with no Zetaris or model needed.</p>
        </div>
      </div>
      <div>
        {saved.length ? (
          <div className="dtable">
            {saved.map((id) => {
              const cycle = state?.cycles.find((c) => c.cycleId === id);
              return (
                <div className="drow" key={id} style={{ gridTemplateColumns: "minmax(0,1fr) auto", cursor: "default" }}>
                  <span className="req"><b>{cycleTime(id)}</b><span><span className="mono">{id}</span>{cycle ? `, data as of ${cycle.asOf}, ${cycle.decisions.length} decisions` : ""}</span></span>
                  <ButtonLink href={`/app?replay=${encodeURIComponent(id)}&speed=${SPEED}`}>Watch replay</ButtonLink>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title="No recorded cycles yet">Run a cycle from Today. Each finished cycle is saved here automatically.</Empty>
        )}
      </div>
    </div>
  );
}
