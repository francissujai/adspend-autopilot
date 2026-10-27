import type { Scene } from "./hero-types";

/** Static still of the hero object: shown first, and instead of the WebGL scene on low-power devices and with reduced motion. */
export function Poster({ accent }: { scene: Scene; accent: string }) {
  const N = 16;
  const blocks = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2;
    return { x: 200 + Math.cos(a) * 128, y: 200 + Math.sin(a) * 46, a, lit: i < 11 };
  });
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true">
      <ellipse cx="200" cy="200" rx="128" ry="46" fill="none" stroke="#2a3038" strokeWidth="1.5" />
      {blocks.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${(b.a + Math.PI / 2) * 57.3 * 0.2})`}>
          <rect x="-19" y="-10" width="38" height="20" rx="3" fill="#14181d" stroke={b.lit ? accent : "#2a3038"} strokeWidth={b.lit ? 1.6 : 1} opacity={0.4 + 0.6 * ((Math.sin(b.a) + 1) / 2)} />
        </g>
      ))}
    </svg>
  );
}
