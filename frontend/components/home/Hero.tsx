"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { ArrowRight, Fingerprint, Play } from "@phosphor-icons/react";
import Link from "next/link";
import { usePressAndHover } from "@/hooks/useSprings";
import { HeroValueChain } from "@/components/home/HeroValueChain";
import { heroContainer, maskLine, riseIn } from "./heroMotion";

function Magnetic({ children, strength = 0.18 }: { children: React.ReactNode; strength?: number }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 150, damping: 15 });
  const sy = useSpring(y, { stiffness: 150, damping: 15 });
  return (
    <motion.div
      className="inline-block"
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        const rect = el.getBoundingClientRect();
        x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
        y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

function HeroAction({ href, primary = true, children }: { href: string; primary?: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const { scale, handlers } = usePressAndHover(0.97, 1.03);

  const link = (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-none sm:px-7 sm:py-3.5 ${
        primary
          ? "bg-primary text-primary-foreground shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.55)] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          : "border border-border bg-secondary text-secondary-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      }`}
    >
      {children}
    </Link>
  );

  if (reduce) return <span className="inline-flex">{link}</span>;

  return (
    <Magnetic>
      <motion.span
        {...handlers}
        style={{ scale }}
        className="pressable inline-flex transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {link}
      </motion.span>
    </Magnetic>
  );
}

function MaskLine({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span className="block overflow-hidden pb-[0.14em] -mb-[0.14em]">
      {reduce ? (
        children
      ) : (
        <motion.span variants={maskLine} className="block">
          {children}
        </motion.span>
      )}
    </span>
  );
}

function Reveal({ variants, className, children }: { variants?: typeof riseIn; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div variants={variants} className={className}>
      {children}
    </motion.div>
  );
}

function Pill() {
  return (
    <span
      aria-hidden="true"
      className="mx-1 inline-block h-[0.72em] w-16 rounded-full bg-cover bg-center align-middle opacity-80 grayscale -translate-y-[0.04em] sm:w-20"
      style={{ backgroundImage: "url(/images/pill-accent.svg)" }}
    />
  );
}

export function Hero() {
  const reduce = useReducedMotion() ?? false;

  const inner = (
    <>
      <Reveal variants={riseIn}>
        <p className="eyebrow text-muted-foreground">Interview prep</p>
      </Reveal>

      <h1 className="hero-display text-balance font-semibold text-foreground">
        <MaskLine>Walk in rehearsed.</MaskLine>
        <MaskLine>
          <Pill /> Leave unforgettable.
        </MaskLine>
      </h1>

      <Reveal variants={riseIn}>
        <p className="mt-5 max-w-[58ch] text-pretty text-base leading-7 text-muted-foreground md:mt-7 md:text-lg md:leading-8">
          Paste your resume, get a focused question pack, and practise like it is real. Three steps, about five
          minutes.
        </p>
      </Reveal>

      <Reveal variants={riseIn}>
        <div className="mt-7 flex flex-wrap items-center gap-2.5 md:mt-10 md:gap-3">
          <HeroAction href="/prepare" primary>
            Start preparing
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </HeroAction>
          <HeroAction href="/interview" primary={false}>
            <Play className="h-4 w-4" aria-hidden="true" />
            Try a sample
          </HeroAction>
        </div>
      </Reveal>

      <Reveal variants={riseIn}>
        <p className="mt-5 flex items-center gap-2 text-[13px] text-muted-foreground md:mt-6">
          <Fingerprint className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>Your camera never leaves the browser.</span>
        </p>
      </Reveal>
    </>
  );

  return (
    <section className="hero-bg relative overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 hero-overlay" />

      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-24 sm:px-6 md:pb-20 md:pt-28 lg:min-h-[100dvh] lg:grid-cols-12 lg:gap-12 lg:pt-24">
        {reduce ? (
          <div className="text-start lg:col-span-7">{inner}</div>
        ) : (
          <motion.div variants={heroContainer} initial="hidden" animate="show" className="text-start lg:col-span-7">
            {inner}
          </motion.div>
        )}

        <div className="lg:col-span-4 lg:col-start-9">
          <HeroValueChain />
        </div>
      </div>
    </section>
  );
}
