import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** Durations in seconds; the CSS tokens --dur-fast, --dur and --dur-stamp carry the same values. */
export const DUR = { fast: 0.15, base: 0.25, stamp: 0.32 } as const;
gsap.defaults({ ease: "power3.out", duration: DUR.base });

/** True when the OS asks for reduced motion. Every animation in the app checks this first. */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Short entrance for a section's top-level blocks. Skipped under reduced motion. */
export function enter(targets: gsap.TweenTarget, opts: { y?: number; stagger?: number } = {}) {
  if (reducedMotion()) return;
  gsap.from(targets, { autoAlpha: 0, y: opts.y ?? 8, duration: DUR.base, stagger: opts.stagger ?? 0.04, clearProps: "transform,opacity,visibility" });
}

export { gsap, useGSAP };
