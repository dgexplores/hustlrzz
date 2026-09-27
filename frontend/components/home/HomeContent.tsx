"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { motion, useMotionValue, useSpring, type MotionStyle } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  ArrowUpRight,
  Buildings,
  Camera,
  FileText,
  ChatsCircle,
  Microphone,
  ArrowsClockwise,
  Fingerprint,
  Note,
  Target,
  Trophy,
} from "@phosphor-icons/react";
import { usePressAndHover, useHoverSpring } from "@/hooks/useSprings";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Hero } from "@/components/home/Hero";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

gsap.registerPlugin(ScrollTrigger);

const SCRUB_LINE = "Great interviews are rehearsed under pressure, not memorized from lists.";
const SCRUB_TAIL =
  "Hustlrzz puts your hard-earned evidence, the company's bar, and an executive coach in one continuous feedback loop.";

const MARQUEE = ["Prepare", "Assess", "Rehearse", "Negotiate", "Remember", "Perform"];

const MODES = [
  {
    key: "prepare",
    title: "Prepare",
    descriptor: "Evidence extraction",
    copy: "Resume plus job description becomes a focused pack: questions, evidence map, company brief.",
    href: "/prepare",
    icon: Note,
  },
  {
    key: "rehearse",
    title: "Rehearse",
    descriptor: "Simulated adversary bot",
    copy: "A live interviewer that follows up, paces the clock, and judges against your material.",
    href: "/interview",
    icon: ChatsCircle,
  },
  {
    key: "assess",
    title: "Assess",
    descriptor: "Gridular scoring matrix",
    copy: "Timed aptitude, technical, and judgment rounds. Scored blind, reported honestly.",
    href: "/assessment",
    icon: Target,
  },
  {
    key: "coach",
    title: "Coach",
    descriptor: "Tactical roleplays",
    copy: "Salary scripts and coaching turns for the conversations after the interview.",
    href: "/coaching",
    icon: Trophy,
  },
];

function Magnetic({ children, strength = 0.25 }: { children: React.ReactNode; strength?: number }) {
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

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { scale, handlers } = useHoverSpring(1, 1);
  return (
    <motion.span {...handlers} style={{ scale }} className="pressable text-[13px] font-medium text-foreground/70 transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Link href={href} className="flex min-h-[44px] items-center hover:text-foreground">{children}</Link>
    </motion.span>
  );
}

function NavCTA({ href, children }: { href: string; children: React.ReactNode }) {
  const { scale, handlers } = usePressAndHover(0.97, 1.03);
  return (
    <motion.span {...handlers} style={{ scale }} className="pressable rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Link href={href} className="flex min-h-[44px] items-center">{children}</Link>
    </motion.span>
  );
}

function HeroCTA({ href, children }: { href: string; children: React.ReactNode }) {
  const { scale, handlers } = usePressAndHover(0.97, 1.03);
  return (
    <Magnetic>
      <motion.span {...handlers} style={{ scale }} className="pressable inline-flex transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.55)] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {children}
        </Link>
      </motion.span>
    </Magnetic>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { scale, handlers } = useHoverSpring(1, 1);
  return (
    <motion.span {...handlers} style={{ scale }} className="pressable transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Link href={href} className="inline-flex min-h-[44px] items-center hover:text-foreground">{children}</Link>
    </motion.span>
  );
}

function ModeCard({ mode, index }: { mode: typeof MODES[number]; index: number }) {
  const { scale, handlers } = usePressAndHover(0.99, 1.01);
  const { scale: iconScale } = useHoverSpring(1, 1.06);
  const Icon = mode.icon;

  return (
    <motion.a
      href={mode.href}
      {...handlers}
      style={{ scale, "--i": index } as MotionStyle}
      className="pressable group flex min-h-[240px] flex-1 flex-col justify-between rounded-2xl border border-border bg-card/60 p-6 transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <motion.span style={{ scale: iconScale }} className="text-primary" aria-hidden="true">
        <Icon className="h-8 w-8" weight="light" />
      </motion.span>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="display-serif text-2xl text-foreground">{mode.title}</p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{mode.descriptor}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
    </motion.a>
  );
}

function PanelLabel({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
      <span>{left}</span>
      <span className="text-emerald-600 dark:text-emerald-400">{right}</span>
    </div>
  );
}

function SignalRow({ quote, badge }: { quote: string; badge: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-border/60 py-2 last:border-b-0">
      <p className="flex-1 text-[12px] leading-5 text-foreground/90">&ldquo;{quote}&rdquo;</p>
      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {badge}
      </span>
    </div>
  );
}

function BarRow({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-foreground/90">{label}</span>
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MetricTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-3 py-2 text-center">
      <p className="display-serif text-xl text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
    </div>
  );
}

function BentoCard({ span, icon, title, index, children }: { span: string; icon: React.ReactNode; title: string; index: number; children: React.ReactNode }) {
  const { scale, handlers } = useHoverSpring(1, 1.02);
  const { scale: imgScale } = useHoverSpring(1, 1.05);

  return (
    <motion.article
      {...handlers}
      style={{ scale, "--i": index } as MotionStyle}
      className={`group relative ${span} min-h-64 overflow-hidden rounded-2xl border border-border bg-card/50 p-7 md:p-9 transition-none spring-scale shadow-[0_20px_40px_-24px_hsl(var(--foreground)/0.15)]`}
    >
      <motion.div
        {...handlers}
        style={{ scale: imgScale, opacity: 0.15, backgroundImage: "url(/images/bg-bento.svg)" }}
        className="absolute inset-0 bg-cover bg-center grayscale mix-blend-overlay transition-none"
        aria-hidden="true"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/40 to-transparent" />
      <div className="relative">
        <div className="text-primary" aria-hidden="true">{icon}</div>
        <h3 className="mt-16 max-w-md text-xl font-semibold tracking-tight text-foreground md:mt-20">{title}</h3>
        {children}
      </div>
    </motion.article>
  );
}

export function HomeContent() {
  const root = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    try {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data }) => {
        if (active) setHasSession(!!data.session);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
        if (active) setHasSession(!!s);
      });
      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    } catch {
      return () => {
        active = false;
      };
    }
  }, []);

  useGSAP(
    () => {
      if (reduce) {
        root.current?.classList.add("no-scrub");
        return;
      }
      const words = gsap.utils.toArray<HTMLElement>(".scrub-word");
      if (words.length) {
        gsap.to(words, {
          opacity: 1,
          stagger: 0.06,
          ease: "none",
          scrollTrigger: { trigger: ".scrub-block", start: "top 78%", end: "bottom 42%", scrub: 0.6 },
        });
      }
    },
    { scope: root }
  );

  return (
    <main ref={root} id="main-content" className="w-full max-w-full overflow-x-hidden">
      <div aria-hidden="true" className="grain-fixed hidden md:block" />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground">
        Skip to content
      </a>
      {/* Floating glass navigation - visitors only; signed-in users get the app header */}
      {!hasSession && (
      <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <nav
          aria-label="Primary"
          className="glass-panel flex w-full max-w-3xl items-center justify-between gap-2 rounded-full py-2 pe-2 ps-5"
        >
          <Link href="/" className="pressable flex min-h-11 items-center text-sm font-bold tracking-tight text-foreground" aria-label="Hustlrzz home">
            Hustlrzz
          </Link>
          <div className="hidden items-center gap-6 sm:flex">
            <NavLink href="/prepare">Prepare</NavLink>
            <NavLink href="/interview">Rehearse</NavLink>
            <NavLink href="/coaching">Coach</NavLink>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NavCTA href="/prepare">Start preparing</NavCTA>
          </div>
        </nav>
      </header>
      )}

      <Hero />

      {/* Marquee interlude */}
      <div className="bg-background overflow-hidden border-t border-border py-8" aria-hidden="true">
        <div className="marquee-track flex w-max items-center gap-10 pe-10">
          {[...MARQUEE, ...MARQUEE].map((word, i) => (
            <span key={i} className="display-serif text-2xl italic text-muted-foreground/90 md:text-3xl">
              {word} <span className="ms-10 text-primary">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* Bento grid */}
      <section className="bg-background px-5 py-24 md:px-10 md:py-40">
        <div className="mx-auto max-w-7xl">
          <h2 className="section-display display-serif text-balance max-w-3xl text-foreground">
            One room for <em>every round.</em>
          </h2>
          <p className="mt-5 max-w-[65ch] text-base leading-7 text-muted-foreground">
            Each surface serves the same goal: a more specific, confident answer next time.
          </p>

          <div className="cascade mt-12 grid grid-flow-dense grid-cols-1 gap-6 md:grid-cols-12">
            <BentoCard
              span="md:col-span-7"
              icon={<FileText className="h-6 w-6 text-primary" aria-hidden="true" />}
              title="Questions built around your experience"
              index={0}
            >
              <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                Add a resume and job description. Hustlrzz creates a tailored, high-pressure interview brief.
              </p>
              <div className="mt-6 rounded-xl border border-border bg-background/40 px-4 py-3">
                <PanelLabel left="Resume signals" right="Within score 98.4%" />
                <div className="mt-1">
                  <SignalRow quote="Reframed real-life storytelling engine for B2B CRM clients" badge="Bam" />
                  <SignalRow quote="Reduced latency by 40% across cross-border API endpoints" badge="Not chat" />
                </div>
              </div>
            </BentoCard>
            <BentoCard
              span="md:col-span-5"
              icon={<Buildings className="h-6 w-6 text-primary" aria-hidden="true" />}
              title="Current company context"
              index={1}
            >
              <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                Research runs when you need it, matching public disclosures, quarterly earnings, and engineering
                standards for the target tier.
              </p>
              <div className="mt-6 rounded-xl border border-border bg-background/40 px-4 py-3">
                <PanelLabel left="Targets &amp; telemetry" right="Top 3" />
                <div className="mt-1">
                  <BarRow label="System design paper" pct={80} />
                  <BarRow label="Case study" pct={80} />
                  <BarRow label="Executive discipline" pct={88} />
                </div>
              </div>
            </BentoCard>
            <BentoCard
              span="md:col-span-5"
              icon={<ChatsCircle className="h-6 w-6 text-primary" aria-hidden="true" />}
              title="A conversation, not a question list"
              index={2}
            >
              <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                The proctor listens closely, probes vague promises, pushes on unstated assumptions, and follows the
                line of thought.
              </p>
              <div className="mt-6 rounded-xl border border-border bg-background/40 px-4 py-3">
                <PanelLabel left="AI interview" right="Probing" />
                <blockquote className="border-l-2 border-primary/50 py-2 pl-3 text-[12px] leading-5 text-foreground/90">
                  &ldquo;You mentioned restructuring the team. What were the retention considerations at that
                  stage?&rdquo;
                </blockquote>
                <p className="pb-1 text-[11px] text-muted-foreground">
                  Yesterday&rsquo;s session logged 14 probes, with a resampled session digest.
                </p>
              </div>
            </BentoCard>
            <BentoCard
              span="md:col-span-7"
              icon={<Camera className="h-6 w-6 text-primary" aria-hidden="true" />}
              title="Content and presence in one review"
              index={3}
            >
              <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                Evaluate sentence integrity alongside cognitive load, posture, gaze stability, and filler words.
                Complete telemetry computed locally.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <MetricTile value="0.4/m" label="Filler count" />
                <MetricTile value="98%" label="Posture hold" />
                <MetricTile value="100%" label="On-device one" />
              </div>
            </BentoCard>
          </div>

          <div className="cascade mt-10 grid grid-cols-1 gap-4 border-t border-border pt-8 text-[13px] md:grid-cols-12 md:gap-6">
            {[
              { label: "Voice and typing modalities", icon: <Microphone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> },
              { label: "Multi-provider failover gateway", icon: <ArrowsClockwise className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> },
              { label: "Zero-cloud client processing", icon: <Fingerprint className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> },
            ].map(({ label, icon }, i) => (
              <p
                key={label}
                style={{ "--i": i + 4 } as CSSProperties}
                className={`flex items-center gap-2.5 text-muted-foreground ${i === 0 ? "md:col-span-5" : i === 1 ? "md:col-span-4" : "md:col-span-3"}`}
              >
                {icon} {label}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Horizontal accordions */}
      <section className="border-t border-border bg-muted/50 px-5 py-24 md:px-10 md:py-40">
        <div className="mx-auto max-w-7xl">
          <h2 className="section-display display-serif text-balance max-w-2xl text-foreground">
            The full room.
          </h2>
          <div className="cascade mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODES.map((mode, i) => (
              <ModeCard key={mode.key} mode={mode} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Scrubbed thesis, then the supporting claim at normal reading speed */}
      <section className="scrub-block border-t border-border bg-background px-5 py-24 md:px-10 md:py-40">
        <div className="relative mx-auto max-w-4xl text-start md:text-center">
          <span
            aria-hidden="true"
            className="display-serif pointer-events-none absolute -top-6 left-0 text-7xl leading-none text-primary/30 md:-left-8 md:text-8xl"
          >
            &ldquo;
          </span>
          <p className="display-serif text-[1.75rem] leading-snug text-foreground md:text-5xl md:leading-snug">
            {SCRUB_LINE.split(" ").map((word, i) => (
              <span key={i} className="scrub-word">
                {word}{" "}
              </span>
            ))}
          </p>
          <span
            aria-hidden="true"
            className="display-serif pointer-events-none absolute -bottom-6 right-0 text-7xl leading-none text-primary/30 md:-right-8 md:text-8xl"
          >
            &rdquo;
          </span>
          <p className="mx-auto mt-6 max-w-[52ch] text-pretty text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
            {SCRUB_TAIL}
          </p>
        </div>
      </section>

      {/* Closing CTA + footer */}
      <section className="relative overflow-hidden border-t border-border bg-primary/5 px-5 py-24 md:py-40">
        <div className="relative mx-auto max-w-7xl">
          <h2 className="section-display display-serif text-balance w-full text-foreground md:max-w-4xl">
            Your next interview{" "}
            <br />
            <em>starts tonight.</em>
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <HeroCTA href="/prepare">
              Start preparing <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </HeroCTA>
          </div>
          <footer className="mt-24 border-t border-border pt-8 text-[13px] text-muted-foreground">
            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div>
                <p className="font-bold text-foreground">Hustlrzz</p>
                <p className="mt-1">Process by design. Your camera never leaves the browser.</p>
              </div>
              <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-6">
                <FooterLink href="/prepare">Prepare</FooterLink>
                <FooterLink href="/assessment">Assessment</FooterLink>
                <FooterLink href="/interview">Interview</FooterLink>
                <FooterLink href="/coaching">Coaching</FooterLink>
                <FooterLink href="/legal/privacy">Privacy</FooterLink>
              </nav>
            </div>
            <p className="mt-8 text-[12px]">
              &copy; 2026 Hustlrzz Inc. AI-assisted coaching. Biometric rigour reserved.
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
}