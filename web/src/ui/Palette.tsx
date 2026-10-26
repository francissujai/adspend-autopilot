import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, reducedMotion, useGSAP } from "../motion";

export interface Command { id: string; label: string; hint: string; run: () => void }

/** Ctrl+K / ⌘K: jump to a section or a decision, or start a run. Escape closes and focus returns to where it was. */
export function Palette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useGSAP(() => { if (!reducedMotion()) gsap.from(box.current, { y: -10, opacity: 0, duration: 0.2 }); });
  const shown = useMemo(() => commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase())), [commands, q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);
  useEffect(() => () => { if (opener?.isConnected) opener.focus(); }, [opener]);
  const pick = (c?: Command) => { if (!c) return; onClose(); c.run(); };

  return (
    <div className="palette-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" ref={box} role="dialog" aria-modal="true" aria-label="Command palette">
        <input autoFocus placeholder="Search sections, decisions and actions" value={q} aria-label="Search" role="combobox" aria-expanded aria-controls="palette-list"
          aria-activedescendant={shown[sel] ? `cmd-${shown[sel].id}` : undefined} onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(shown.length - 1, i + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
            if (e.key === "Enter") pick(shown[sel]);
          }} />
        <ul ref={list} id="palette-list" role="listbox">
          {shown.map((c, i) => (
            <li key={c.id}>
              <button id={`cmd-${c.id}`} data-i={i} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => pick(c)}>
                <span>{c.label}</span><span className="hint">{c.hint}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li style={{ padding: 16, color: "var(--ink-soft)" }}>Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}
