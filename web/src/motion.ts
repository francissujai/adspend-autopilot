import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** Durations in seconds; the CSS tokens --dur-fast and --dur carry the same values. */
export const DUR = { fast: 0.15, base: 0.25 } as const;
gsap.defaults({ ease: "power2.out", duration: DUR.base });

/** True when the OS asks for reduced motion. Every animation in the app checks this first. */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A section's blocks fade in when the section opens. Opacity only; skipped under reduced motion. */
export function enter(targets: gsap.TweenTarget) {
  if (reducedMotion()) return;
  gsap.from(targets, { opacity: 0, duration: 0.2, clearProps: "opacity" });
}

export { gsap, useGSAP };
