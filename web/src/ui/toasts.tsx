import { useCallback, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { NUDGE, T_BASE } from "../motion";
import { ToastCtx } from "./toast-context";

interface Toast { id: number; msg: string; ok: boolean }
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((msg: string, ok = true) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, msg, ok }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ok ? 5000 : 9000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => <ToastItem key={t.id} t={t} onClose={() => setToasts((x) => x.filter((y) => y.id !== t.id))} />)}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ t, onClose }: { t: Toast; onClose: () => void }) {
  return (
    <m.div layout className={`toast ${t.ok ? "" : "err"}`} initial={{ opacity: 0, y: NUDGE }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={T_BASE}>
      <span>{t.msg}</span>
      <button onClick={onClose} aria-label="Dismiss">×</button>
    </m.div>
  );
}
