import { useCallback, useEffect, useMemo, useState } from "react";
import { WhyDrawer } from "./components/WhyDrawer";
import { REPLAY } from "./replay";
import { ThemeButton } from "./theme";
import { Landing } from "./landing/Landing";
import { content as landingContent } from "./landing/content";
import { useStore } from "./store-context";
import type { AutopilotEvent } from "./types";
import { Palette, type Command } from "./ui/Palette";
import { Decisions } from "./views/Decisions";
import { LedgerView } from "./views/LedgerView";
import { Replays } from "./views/Replays";
import { Today } from "./views/Today";

export type Section = "today" | "decisions" | "ledger" | "replays";
const PATHS: Record<Section, string> = { today: "/app", decisions: "/decisions", ledger: "/ledger", replays: "/replays" };
const TABS: { id: Section; label: string }[] = [
  { id: "today", label: "Today" }, { id: "decisions", label: "Decisions" }, { id: "ledger", label: "Ledger" }, { id: "replays", label: "Replays" },
];
/** "/" is the landing page, unless it carries a recorded cycle or a decision to open (links made before /app existed). */
const onLanding = () => location.pathname.replace(/\/+$/, "") === "" && !REPLAY && !new URLSearchParams(location.search).has("open");
const sectionFromPath = (p: string): Section => (Object.entries(PATHS).find(([, v]) => v === (p.replace(/\/+$/, "") || "/"))?.[0] as Section) ?? "today";

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" style={{ fill: "var(--accent)" }} />
      <circle cx="16" cy="16" r="9" fill="none" strokeWidth="2.4" strokeDasharray="3 2" style={{ stroke: "var(--on-accent)" }} />
      <path d="M11.5 16.5l3 3 6-7" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--on-accent)" }} />
    </svg>
  );
}

export default function App() {
  const s = useStore();
  const [section, setSection] = useState<Section>(() => sectionFromPath(location.pathname));
  const [palette, setPalette] = useState(false);
  const [landing, setLanding] = useState(onLanding);

  const go = useCallback((next: Section) => {
    if (next !== section || landing) history.pushState(null, "", PATHS[next] + location.search);
    setLanding(false);
    setSection(next);
    window.scrollTo({ top: 0 });
  }, [section, landing]);

  useEffect(() => {
    const onPop = () => { setLanding(onLanding()); setSection(sectionFromPath(location.pathname)); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => { document.title = landing ? "Ad Spend Autopilot: budget moves you can audit" : `${TABS.find((t) => t.id === section)?.label} · Ad Spend Autopilot`; }, [section, landing]);

  const waiting = s.allDecisions.filter((d) => d.status === "awaiting-approval").length;
  const gov = [...s.events].reverse().find((e) => e.type === "governance") as Extract<AutopilotEvent, { type: "governance" }> | undefined;
  const governance = gov ? { allowed: gov.allowed, unreachable: gov.unreachable, detail: gov.detail } : s.state?.cycles[0]?.governance;
  const ledger = s.state?.ledger;

  const openDecision = s.allDecisions.find((d) => d.id === s.open) ?? s.decisions.find((d) => d.id === s.open);
  const ledgerSeq = ledger?.entries.find((e) => e.type === "decision" && e.ref === s.open)?.seq;
  const recorded = s.state?.savedCycles[0];

  const commands = useMemo<Command[]>(() => [
    ...TABS.map((t) => ({ id: `go-${t.id}`, label: t.label, hint: "Go to", run: () => go(t.id) })),
    ...(REPLAY ? [] : [{ id: "run", label: "Run a cycle", hint: "Action", run: () => { go("today"); s.run(); } }]),
    ...(recorded && !REPLAY ? [{ id: "watch", label: "Watch recorded cycle", hint: "Action", run: () => { location.href = `/app?replay=${encodeURIComponent(recorded)}&speed=8`; } }] : []),
    ...s.allDecisions.map((d) => ({ id: d.id, label: `${d.id} ${d.candidate.request}`, hint: "Decision", run: () => s.setOpen(d.id) })),
  ], [go, s, recorded]);

  if (landing) {
    const open = (to: string) => { history.pushState(null, "", to); setLanding(false); setSection(sectionFromPath(to)); window.scrollTo({ top: 0 }); };
    // one block in the hero ring per signed ledger entry
    return <Landing c={landingContent} open={open} data={ledger?.entries.length ? [ledger.entries.length] : undefined} />;
  }

  return (
    <>
      <div className="paper-bg" aria-hidden />
      <div className="app">
        <header className="bar">
          <button className="brand" onClick={() => go("today")} aria-label="Ad Spend Autopilot, go to Today"><BrandMark />Ad Spend Autopilot</button>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} className="tab" aria-current={section === t.id ? "page" : undefined} onClick={() => go(t.id)}>
                {t.label}{t.id === "decisions" && waiting > 0 && <span className="badge" aria-label={`${waiting} waiting for you`}>{waiting}</span>}
              </button>
            ))}
          </nav>
          <span className="spacer" />
          <ThemeButton className="btn ghost sm" />
          <button className="btn ghost sm" onClick={() => setPalette(true)}>Search <span className="kbd hide-sm">Ctrl K</span></button>
        </header>
        <div className="trust" role="group" aria-label="Trust status">
          {governance && (governance.unreachable ? (
            <span className="seal muted" title={governance.detail}><span className="dot">?</span><b className="hide-sm">Customer-data access not checked</b></span>
          ) : (
            <span className={`seal ${governance.allowed ? "warn" : "ok"}`} title={governance.detail}>
              <span className="dot">{governance.allowed ? "!" : "✓"}</span>
              {governance.allowed ? <span>Agent can read customer data: <b>set its own Zetaris key</b></span> : <span><b>Agent can't read customer data</b><span className="hide-sm">, enforced by Zetaris</span></span>}
            </span>
          ))}
          {ledger && (ledger.verify.entries === 0 ? (
            <span className="seal muted"><span className="dot">·</span><b>Ledger empty</b></span>
          ) : (
            <span className={`seal ${ledger.verify.ok ? "ok" : "bad"}`}>
              <span className="dot">{ledger.verify.ok ? "✓" : "✕"}</span><b>Ledger {ledger.verify.ok ? "verified" : "broken"}</b><span className="hide-sm">{ledger.verify.entries} entries</span>
            </span>
          ))}
        </div>
        <hr className="rule" />

        <main id="main">
          {section === "today" && <Today />}
          {section === "decisions" && <Decisions />}
          {section === "ledger" && <LedgerView />}
          {section === "replays" && <Replays />}
        </main>
      </div>

      {openDecision && (
        <WhyDrawer d={openDecision} ledgerSeq={ledgerSeq} onClose={() => s.setOpen(null)} onAll={() => { s.setOpen(null); go("decisions"); }} />
      )}
      {palette && <Palette commands={commands} onClose={() => setPalette(false)} />}
    </>
  );
}
