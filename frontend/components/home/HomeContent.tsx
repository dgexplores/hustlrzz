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
  Play,
  Microphone,
  ArrowsClockwise,
  Fingerprint,
} from "@phosphor-icons/react";
import { usePressAndHover, useFlexSpring, useHoverSpring } from "@/hooks/useSprings";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ProductPreview } from "@/components/home/ProductPreview";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

gsap.registerPlugin(ScrollTrigger);

const SCRUB_LINE =
  "Great interviews are rehearsed under pressure, not memorized from lists. Hustlrzz puts your evidence, the company's bar, and a live coach in one room.";

const MARQUEE = ["Prepare", "Assess", "Rehearse", "Negotiate", "Remember", "Perform"];

const MODES = [
  {
    key: "prepare",
    title: "Prepare",
    copy: "Resume plus job description becomes a focused pack: questions, evidence map, company brief.",
    href: "/prepare",
    seed: "prepare-desk",
  },
  {
    key: "assess",
    title: "Assess",
    copy: "Timed aptitude, technical, and judgment rounds. Scored blind, reported honestly.",
    href: "/assessment",
    seed: "assess-stage",
  },
  {
    key: "rehearse",
    title: "Rehearse",
    copy: "A live interviewer that follows up, paces the clock, and judges against your material.",
    href: "/interview",
    seed: "rehearse-mic",
  },
  {
    key: "negotiate",
    title: "Negotiate",
    copy: "Salary scripts and coaching turns for the conversations after the interview.",
    href: "/coaching",
    seed: "negotiate-room",
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
      <Link href={href} className="flex min-h-[32px] items-center">{children}</Link>
    </motion.span>
  );
}

function HeroCTA({ href, children, primary = true }: { href: string; children: React.ReactNode; primary?: boolean }) {
  const { scale, handlers } = usePressAndHover(0.97, 1.03);
  return (
    <Magnetic>
      <motion.span {...handlers} style={{ scale }} className="pressable inline-flex transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Link
          href={href}
          className={`inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold ${
            primary
              ? "bg-primary text-primary-foreground shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.55)]"
              : "border border-border bg-secondary text-secondary-foreground hover:bg-accent"
          }`}
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

function AccordionSlice({ mode, index }: { mode: typeof MODES[0]; index: number }) {
  const { flex, isExpanded, expand, collapse } = useFlexSpring(1, 2.4);
  const { scale: imgScale } = useHoverSpring(1, 1.05);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      expand();
    }
  };

  return (
    <motion.a
      href={mode.href}
      className="acc-slice pressable group relative min-h-[220px] flex-1 overflow-hidden rounded-3xl border border-border md:min-h-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{ flexGrow: flex, "--i": index } as MotionStyle}
      onMouseEnter={expand}
      onMouseLeave={collapse}
      onFocus={expand}
      onBlur={collapse}
      onKeyDown={handleKeyDown}
    >
      <motion.div
        style={{ scale: imgScale, backgroundImage: `url(https://picsum.photos/seed/${mode.seed}/900/900)` }}
        className="acc-img absolute inset-0 bg-cover bg-center grayscale transition-none"
        aria-hidden="true"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/50 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 p-6">
        <p className={`display-type text-2xl font-semibold text-foreground`}>{mode.title}</p>
        <motion.p
          style={{ opacity: isExpanded ? 1 : 0, y: isExpanded ? 0 : 10 }}
          className="mt-2 max-w-[36ch] text-sm leading-6 text-muted-foreground transition-none"
        >
          {mode.copy}
        </motion.p>
        <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-foreground">
          Open <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </motion.a>
  );
}

function BentoCard({ span, icon, title, copy, seed, index }: { span: string; icon: React.ReactNode; title: string; copy: string; seed: string; index: number }) {
  const { scale, handlers } = useHoverSpring(1, 1.02);
  const { scale: imgScale } = useHoverSpring(1, 1.05);

  return (
    <motion.article
      {...handlers}
      style={{ scale, "--i": index } as MotionStyle}
      className={`group relative ${span} min-h-64 overflow-hidden rounded-3xl border border-border bg-card/50 p-7 md:p-9 transition-none spring-scale shadow-[0_20px_40px_-24px_hsl(var(--foreground)/0.15)]`}
    >
      <motion.div
        {...handlers}
        style={{ scale: imgScale, opacity: 0.15, backgroundImage: `url(https://picsum.photos/seed/${seed}/1000/700)` }}
        className="absolute inset-0 bg-cover bg-center grayscale mix-blend-overlay transition-none"
        aria-hidden="true"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/40 to-transparent" />
      <div className="relative">
        <div className="text-primary" aria-hidden="true">{icon}</div>
        <h3 className="mt-16 max-w-md text-xl font-semibold tracking-tight text-foreground md:mt-20">{title}</h3>
        <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{copy}</p>
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
      <div aria-hidden="true" className="grain-fixed" />
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
          <Link href="/" className="pressable text-sm font-bold tracking-tight text-foreground" aria-label="Hustlrzz home">
            Hustlrzz
          </Link>
          <div className="hidden items-center gap-6 sm:flex">
            <NavLink href="/prepare">Prepare</NavLink>
            <NavLink href="/assessment">Assess</NavLink>
            <NavLink href="/coaching">Coach</NavLink>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NavCTA href="/prepare">Start preparing</NavCTA>
          </div>
        </nav>
      </header>
      )}

      {/* Split hero: left content, right asset */}
      <section className="hero-bg relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 hero-overlay" />

        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-20 pt-28 md:px-6 lg:min-h-[100dvh] lg:grid-cols-12 lg:pt-24">
          <div className="text-start lg:col-span-7">
            <h1
              className={`display-type w-full font-semibold text-foreground text-4xl md:text-5xl tracking-tighter leading-none`}
            >
              Walk in rehearsed.{" "}
              <span
                aria-hidden="true"
                className="mx-1 inline-block h-[0.72em] w-20 rounded-full bg-cover bg-center align-middle opacity-80 grayscale"
                style={{ backgroundImage: "url(https://picsum.photos/seed/coach-mic/400/160)" }}
              />
              Leave unforgettable.
            </h1>
            <p className="mt-7 max-w-[58ch] text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
              Paste your resume, get a focused question pack, and practice like it is real. 3 steps, about 5 minutes.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <HeroCTA href="/prepare" primary>
                Start preparing <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </HeroCTA>
              <HeroCTA href="/interview" primary={false}>
                <Play className="h-4 w-4" aria-hidden="true" /> Try sample interview
              </HeroCTA>
            </div>
          </div>

          <div className="lg:col-span-4 lg:col-start-9">
            <ProductPreview />
          </div>
        </div>
      </section>

      {/* Marquee interlude */}
      <div className="bg-background overflow-hidden border-t border-border py-8" aria-hidden="true">
        <div className="marquee-track flex w-max items-center gap-10 pe-10">
          {[...MARQUEE, ...MARQUEE].map((word, i) => (
            <span key={i} className="display-type text-4xl font-semibold tracking-tight text-muted-foreground/40 md:text-5xl">
              {word} <span className="ms-10 text-primary">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* Bento grid */}
      <section className="bg-background px-5 py-24 md:px-10 md:py-40">
        <div className="mx-auto max-w-7xl">
          <h2
            className={`display-type max-w-3xl text-4xl font-semibold tracking-tighter leading-none text-foreground md:text-6xl`}
          >
            One room for{" "}
            <span
              aria-hidden="true"
              className="mx-1 inline-block h-[0.72em] w-20 rounded-full bg-cover bg-center align-middle opacity-80 grayscale"
              style={{ backgroundImage: "url(https://picsum.photos/seed/focus-desk/320/140)" }}
            />{" "}
            every round.
          </h2>
          <p className="mt-5 max-w-[65ch] text-base leading-7 text-muted-foreground">
            Each surface serves the same goal: a more specific, confident answer next time.
          </p>

          <div className="cascade mt-12 grid grid-flow-dense grid-cols-1 gap-6 md:grid-cols-12">
            <BentoCard
              span="md:col-span-7"
              icon={<FileText className="h-6 w-6 text-primary" aria-hidden="true" />}
              title="Questions built around your experience"
              copy="Add a resume and job description. Hustlrzz finds the evidence worth practising and creates a focused interview pack."
              seed="evidence-wall"
              index={0}
            />
            <BentoCard
              span="md:col-span-5"
              icon={<Buildings className="h-6 w-6 text-primary" aria-hidden="true" />}
              title="Current company context"
              copy="Research runs when you need it, with source links and preparation cues for the role you selected."
              seed="company-glass"
              index={1}
            />
            <BentoCard
              span="md:col-span-5"
              icon={<ChatsCircle className="h-6 w-6 text-primary" aria-hidden="true" />}
              title="A conversation, not a question list"
              copy="The interviewer listens to each answer, asks follow-ups, and keeps the discussion grounded in your preparation."
              seed="dialogue-loop"
              index={2}
            />
            <BentoCard
              span="md:col-span-7"
              icon={<Camera className="h-6 w-6 text-primary" aria-hidden="true" />}
              title="Content and presence in one review"
              copy="Answer quality alongside posture, gaze, and gesture signals. Camera processing stays on your device."
              seed="presence-studio"
              index={3}
            />
          </div>

          <div className="cascade mt-4 grid grid-cols-1 gap-6 text-sm md:grid-cols-12">
            {[
              { label: "Voice and typing", icon: <Microphone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> },
              { label: "Multi-provider AI with automatic failover", icon: <ArrowsClockwise className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> },
              { label: "Private on-device camera processing", icon: <Fingerprint className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> },
            ].map(({ label, icon }, i) => (
              <p key={label} style={{ "--i": i + 4 } as CSSProperties} className={`flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-4 text-muted-foreground ${i === 0 ? "md:col-span-5" : i === 1 ? "md:col-span-4" : "md:col-span-3"}`}>
                {icon} {label}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Horizontal accordions */}
      <section className="border-t border-border bg-muted/50 px-5 py-24 md:px-10 md:py-40">
        <div className="mx-auto max-w-7xl">
          <h2
            className={`display-type max-w-2xl text-4xl font-semibold tracking-tighter leading-none text-foreground md:text-6xl`}
          >
            Four modes. One momentum.
          </h2>
          <div className="cascade acc-group mt-12 flex flex-col gap-3 md:h-[420px] md:flex-row">
            {MODES.map((mode, i) => (
              <AccordionSlice key={mode.key} mode={mode} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Scrub reveal + gallery */}
      <section className="scrub-block border-t border-border bg-background px-5 py-24 md:px-10 md:py-40">
      <div className="mx-auto max-w-4xl text-start md:text-center">
          <p className="display-type text-2xl font-medium leading-snug tracking-tight text-foreground md:text-4xl md:leading-snug">
            {SCRUB_LINE.split(" ").map((word, i) => (
              <span key={i} className="scrub-word">
                {word}{" "}
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* Closing CTA + footer */}
      <section className="relative overflow-hidden border-t border-border bg-primary/5 px-5 py-24 md:py-40">
        <div
          aria-hidden="true"
          className="absolute -end-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-[120px]"
        />
        <div className="relative mx-auto max-w-7xl">
          <h2
            className={`display-type w-full text-start font-semibold text-foreground text-4xl md:text-6xl tracking-tighter leading-none md:max-w-4xl`}
          >
            Your next interview starts tonight.
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <HeroCTA href="/prepare" primary>
              Start preparing <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </HeroCTA>
            <HeroCTA href="/coaching" primary={false}>
              Open coaching
            </HeroCTA>
          </div>
          <footer className="mt-24 flex flex-col items-center justify-between gap-6 border-t border-border pt-8 text-[13px] text-muted-foreground sm:flex-row">
            <p className="font-bold text-foreground">Hustlrzz</p>
            <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-6">
              <FooterLink href="/prepare">Prepare</FooterLink>
              <FooterLink href="/assessment">Assessment</FooterLink>
              <FooterLink href="/interview">Interview</FooterLink>
              <FooterLink href="/coaching">Coaching</FooterLink>
              <FooterLink href="/legal/privacy">Privacy</FooterLink>
            </nav>
            <p>Private by design. Your camera never leaves the browser.</p>
          </footer>
        </div>
      </section>
    </main>
  );
}