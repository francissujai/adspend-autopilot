import { m, useTransform } from "motion/react";
import { lerp, scramble, useSeg, useVis, type P } from "./film-kit";

/** One decision, drawn as it happens. Chapters: read the ad lines, check the platform's claim against real orders, hold the big move at a policy gate,
 *  sign it into the chain. Every element below is a transform of the scroll progress `p`. */
export const CHAPTERS = [["Read the", "real numbers."], ["Don't trust", "the claim."], ["Big moves", "wait for you."], ["Sign it.", "Prove it."]];

const BUDGETS = [1100, 500, 900, 300, 6500, 800, 900, 1200, 500];

function ReadBar({ p, i }: { p: P; i: number }) {
  const s = 0.004 + i * 0.011;
  const x = useSeg(p, s, s + 0.12, -560, 0);
  const o = useSeg(p, s, s + 0.04);
  const w = 70 + (BUDGETS[i] / 6500) * 440;
  return (
    <m.g style={{ x, opacity: o }}>
      <circle cx="52" cy={80 + i * 42} r="4.5" className={i === 4 ? "f-warn" : "f-acc"} />
      <rect x="70" y={73 + i * 42} width={w} height="14" rx="3" className="f-mute" />
      <text x={w + 82} y={85 + i * 42} className="f-t f-dim">{`$${BUDGETS[i].toLocaleString("en-US")}`}</text>
    </m.g>
  );
}

function ReadLayer({ p }: { p: P }) {
  const o = useTransform(p, [0.2, 0.29], [1, 0]);
  const x = useTransform(p, [0.2, 0.29], [0, -150]);
  const scan = useSeg(p, 0.02, 0.19, 60, 790);
  const so = useVis(p, 0, 0.22, 0.03);
  const cap = useVis(p, 0.02, 0.26, 0.04);
  return (
    <m.g style={{ opacity: o, x }}>
      {BUDGETS.map((b, i) => <ReadBar key={`${b}-${i}`} p={p} i={i} />)}
      <m.rect x="0" y="50" width="2" height="400" className="f-acc" style={{ x: scan, opacity: so }} />
      <m.text x="70" y="506" className="f-t f-dim" style={{ opacity: cap }}>9 ad lines and your orders, read through Zetaris, read only</m.text>
    </m.g>
  );
}

function CheckLayer({ p }: { p: P }) {
  const vis = useVis(p, 0.25, 0.58, 0.05);
  const grow = useSeg(p, 0.28, 0.38);
  const collapse = useSeg(p, 0.44, 0.52);
  const plat = useTransform([grow, collapse], (v: number[]) => v[0] * (1 - v[1] * (1 - 0.97 / 5.58)));
  const back = useSeg(p, 0.32, 0.4);
  const val = useTransform(p, [0.28, 0.38, 0.44, 0.52], [0, 5.58, 5.58, 0.97]);
  const valText = useTransform(val, (v) => `${v.toFixed(2)}x`);
  const valY = useTransform(plat, (s) => 440 - 300 * s - 20);
  const backY = useTransform(back, (s) => 440 - 52 * s - 20);
  const backText = useTransform(back, (s) => `${(s * 0.97).toFixed(2)}x`);
  const gap = useSeg(p, 0.5, 0.54);
  return (
    <m.g style={{ opacity: vis }}>
      <line x1="120" y1="440" x2="720" y2="440" className="f-line" />
      <m.rect x="190" y="140" width="140" height="300" rx="4" className="f-mute fb" style={{ scaleY: plat }} />
      <m.rect x="190" y="140" width="140" height="300" rx="4" className="f-danger fb" style={{ scaleY: plat, opacity: collapse }} />
      <m.rect x="510" y="388" width="140" height="52" rx="4" className="f-acc fb" style={{ scaleY: back }} />
      <m.text x="260" textAnchor="middle" className="f-t f-big" style={{ y: valY }}>{valText}</m.text>
      <m.text x="580" textAnchor="middle" className="f-t f-big" style={{ y: backY }}>{backText}</m.text>
      <text x="260" y="472" textAnchor="middle" className="f-t f-dim">Platform says</text>
      <text x="580" y="472" textAnchor="middle" className="f-t f-dim">Your orders say</text>
      <m.text x="420" y="260" textAnchor="middle" className="f-t f-danger-t f-huge" style={{ opacity: gap }}>5.8x gap</m.text>
    </m.g>
  );
}

function Mover({ p, y, w, h, label, a, b, to, hold }: { p: P; y: number; w: number; h: number; label: string; a: number; b: number; to: number; hold?: boolean }) {
  const x = useSeg(p, a, b, 40, to);
  const warn = useSeg(p, 0.66, 0.69);
  return (
    <m.g style={{ x }}>
      <rect y={y} width={w} height={h} rx="8" className="f-card" />
      {hold && <m.rect y={y} width={w} height={h} rx="8" className="f-warn-line" style={{ opacity: warn }} />}
      <text x={w / 2} y={y + h / 2 + 6} textAnchor="middle" className="f-t f-bold">{label}</text>
    </m.g>
  );
}

function DecideLayer({ p }: { p: P }) {
  const vis = useVis(p, 0.5, 0.82, 0.05);
  const stamp = useSeg(p, 0.66, 0.71);
  const stampScale = useTransform(stamp, [0, 0.6, 1], [0, 1.18, 1]);
  const need = useSeg(p, 0.69, 0.74);
  return (
    <m.g style={{ opacity: vis }}>
      <line x1="520" y1="70" x2="520" y2="470" className="f-gate" />
      <text x="520" y="54" textAnchor="middle" className="f-t f-dim">Policy</text>
      <Mover p={p} y={90} w={110} h={46} label="$500" a={0.52} b={0.7} to={780} />
      <Mover p={p} y={176} w={110} h={46} label="$300" a={0.54} b={0.72} to={780} />
      <Mover p={p} y={410} w={110} h={46} label="$900" a={0.56} b={0.74} to={780} />
      <Mover p={p} y={252} w={170} h={86} label="$5,000" a={0.54} b={0.66} to={320} hold />
      <m.g style={{ scale: stampScale, opacity: stamp }} className="fc">
        <rect x="359" y="186" width="92" height="46" rx="23" className="f-warn-fill" />
        <text x="405" y="216" textAnchor="middle" className="f-t f-bold f-on-warn">Held</text>
      </m.g>
      <m.text x="405" y="372" textAnchor="middle" className="f-t f-dim" style={{ opacity: need }}>Needs a person</m.text>
    </m.g>
  );
}

const SLOTS = [0, 1, 2, 3, 4].map((i) => 40 + i * 152);

function ChainBlock({ p, i }: { p: P; i: number }) {
  const isNew = i === 4;
  const a = isNew ? 0.84 : 0.76 + i * 0.015;
  const o = useSeg(p, a, a + 0.04);
  const s = useSeg(p, a, a + 0.05, 0.7, 1);
  const drop = useSeg(p, a, a + 0.06, -190, 0);
  const link = useSeg(p, a + 0.02, a + 0.07);
  const hash = useTransform(p, [0.86, 0.95], [0, 1]);
  const hashText = useTransform(hash, (v) => scramble("b408b144", v));
  return (
    <>
      {i > 0 && <m.path d={`M${SLOTS[i] - 32} 300 H${SLOTS[i]}`} className="f-link" style={{ pathLength: link, opacity: o }} />}
      <m.g style={{ opacity: o, scale: s, y: isNew ? drop : 0 }} className="fc">
        <rect x={SLOTS[i]} y="256" width="120" height="88" rx="10" className={isNew ? "f-card f-card-new" : "f-card"} />
        <text x={SLOTS[i] + 14} y="286" className="f-t f-dim">{isNew ? "D-0002" : `#${i + 1}`}</text>
        <text x={SLOTS[i] + 14} y="314" className="f-t f-bold">{isNew ? "$5,000" : ["Run", "Run", "Held", "Run"][i]}</text>
        {isNew ? <m.text x={SLOTS[i] + 14} y="334" className="f-t f-mono f-acc-t">{hashText}</m.text> : <text x={SLOTS[i] + 14} y="334" className="f-t f-mono f-dim">{["a41b9d9d", "d1611b65", "4c0e72aa", "9f13d6b0"][i]}</text>}
      </m.g>
    </>
  );
}

function SignLayer({ p }: { p: P }) {
  const vis = useSeg(p, 0.75, 0.79);
  const check = useSeg(p, 0.93, 0.98);
  const pulse = useSeg(p, 0.93, 1);
  const pulseScale = useTransform(pulse, (v) => lerp(0.4, 3, v));
  const pulseO = useTransform(pulse, [0, 0.15, 1], [0, 0.7, 0]);
  const ver = useSeg(p, 0.96, 1);
  return (
    <m.g style={{ opacity: vis }}>
      {SLOTS.map((_, i) => <ChainBlock key={i} p={p} i={i} />)}
      <m.circle cx={SLOTS[4] + 60} cy="300" r="60" className="f-pulse fc" style={{ scale: pulseScale, opacity: pulseO }} />
      <m.path d={`M${SLOTS[4] + 84} 232 l11 12 l22 -26`} className="f-check" style={{ pathLength: check, opacity: check }} />
      <m.text x="420" y="430" textAnchor="middle" className="f-t f-dim" style={{ opacity: ver }}>Ed25519 signature, linked to the entry before it. Chain verified.</m.text>
    </m.g>
  );
}

export function FilmScene({ p }: { p: P }) {
  return (
    <svg viewBox="0 0 840 540" className="film-svg" role="img" aria-label="One budget decision read, checked, held by policy and signed into the ledger">
      <ReadLayer p={p} />
      <CheckLayer p={p} />
      <DecideLayer p={p} />
      <SignLayer p={p} />
    </svg>
  );
}
