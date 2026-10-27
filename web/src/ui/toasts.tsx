import { useCallback, useRef, useState, type ReactNode } from "react";
import { gsap, reducedMotion, useGSAP } from "../motion";
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
        {toasts.map((t) => <ToastItem key={t.id} t={t} onClose={() => setToasts((x) => x.filter((y) => y.id !== t.id))} />)}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ t, onClose }: { t: Toast; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => { if (!reducedMotion()) gsap.from(ref.current, { autoAlpha: 0, duration: 0.2 }); });
  return (
    <div ref={ref} className={`toast ${t.ok ? "" : "err"}`}>
      <span>{t.msg}</span>
      <button onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  );
}
