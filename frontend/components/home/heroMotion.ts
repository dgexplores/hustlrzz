import type { Variants } from "motion/react";

export const HERO_SPRING = { type: "spring", stiffness: 120, damping: 18 } as const;
export const HERO_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Opacity that a reveal starts from. 0.6 clears the WCAG AA large-text contrast
 * floor in the light theme (the stricter of the two), so a single value is safe
 * for both themes. Lower values previously failed contrast at partial reveal.
 */
export const REVEAL_FLOOR = 0.6;

export const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

export const maskLine: Variants = {
  hidden: { y: "108%", opacity: REVEAL_FLOOR },
  show: { y: "0%", opacity: 1, transition: HERO_SPRING },
};

export const riseIn: Variants = {
  hidden: { y: 12, opacity: REVEAL_FLOOR },
  show: { y: 0, opacity: 1, transition: { duration: 0.5, ease: HERO_EASE } },
};

export const HERO_STEPS = [
  { key: "resume", label: "Paste your resume", detail: "Your evidence, in one file." },
  { key: "pack", label: "Get your question pack", detail: "Questions built around your experience." },
  { key: "live", label: "Rehearse live", detail: "An interviewer that listens and follows up." },
] as const;
