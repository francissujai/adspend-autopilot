import { useId, type ReactNode } from "react";
import { m } from "motion/react";
import { SPRING } from "../motion";

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string;
}) {
  const id = useId();
  return (
    <div className="segmented" role="tablist" aria-label={label}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = options.findIndex((o) => o.value === value);
        const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
        onChange(next.value);
        (e.currentTarget.querySelectorAll("button")[options.indexOf(next)] as HTMLButtonElement | undefined)?.focus();
      }}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}>
          {o.value === value && <m.span layoutId={`seg-${id}`} className="seg-ind" transition={SPRING} />}
          <span className="seg-label">{o.label}{o.count !== undefined && <span className="n">{o.count}</span>}</span>
        </button>
      ))}
    </div>
  );
}

export function Crumbs({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={c.label} style={{ display: "contents" }}>
          {i > 0 && <span aria-hidden>/</span>}
          {c.onClick ? <button onClick={c.onClick}>{c.label}</button> : <span aria-current="page">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

/** Placeholder blocks shaped like the Today layout while the first state loads. */
export function TodaySkeleton() {
  return (
    <div className="today" aria-busy="true" aria-label="Loading">
      <div style={{ display: "grid", gap: 14 }}>
        <div className="sk title" /><div className="sk line" style={{ width: "88%" }} /><div className="sk line" style={{ width: "60%" }} />
        <div className="sk block" />
      </div>
      <div className="sk block" style={{ height: 380 }} />
    </div>
  );
}
