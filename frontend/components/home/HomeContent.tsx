"use client";

import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { Outfit } from "next/font/google";
import { motion } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Camera,
  FileSearch,
  MessageSquareText,
  Play,
  ShieldCheck,
} from "lucide-react";
import { usePressAndHover, useFlexSpring, useHoverSpring } from "@/hooks/useSprings";

gsap.registerPlugin(ScrollTrigger);

const display = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"] });

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

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { scale, handlers } = useHoverSpring(1, 1);
  return (
    <motion.span {...handlers} style={{ scale }} className="pressable text-[13px] font-medium text-foreground/70 transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Link href={href} className="block hover:text-foreground">{children}</Link>
    </motion.span>
  );
}

function NavCTA({ href, children }: { href: string; children: React.ReactNode }) {
  const { scale, handlers } = usePressAndHover(0.97, 1.03);
  return (
    <motion.span {...handlers} style={{ scale }} className="pressable rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Link href={href} className="block">{children}</Link>
    </motion.span>
  );
}

function HeroCTA({ href, children, primary = true }: { href: string; children: React.ReactNode; primary?: boolean }) {
  const { scale, handlers } = usePressAndHover(0.97, 1.03);
  return (
    <motion.span {...handlers} style={{ scale }} className="pressable inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Link
        href={href}
        className={`block ${
          primary
            ? "bg-primary text-primary-foreground shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
            : "border border-border bg-secondary text-secondary-foreground hover:bg-accent"
        }`}
      >
        {children}
      </Link>
    </motion.span>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { scale, handlers } = useHoverSpring(1, 1);
  return (
    <motion.span {...handlers} style={{ scale }} className="pressable transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Link href={href} className="hover:text-foreground">{children}</Link>
    </motion.span>
  );
}

function AccordionSlice({ mode }: { mode: typeof MODES[0] }) {
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
      style={{ flexGrow: flex }}
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
        <p className={`${display.className} text-2xl font-semibold text-foreground`}>{mode.title}</p>
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

function BentoCard({ span, icon, title, copy, seed }: { span: string; icon: React.ReactNode; title: string; copy: string; seed: string }) {
  const { scale, handlers } = useHoverSpring(1, 1.02);
  const { scale: imgScale } = useHoverSpring(1, 1.05);

  return (
    <motion.article
      {...handlers}
      style={{ scale }}
      className={`group relative ${span} min-h-64 overflow-hidden rounded-3xl border border-border bg-card/50 p-7 md:p-9 transition-none spring-scale`}
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

function GalleryImage({ seed }: { seed: string }) {
  const { scale, handlers } = useHoverSpring(1, 1.05);
  return (
    <div className="group overflow-hidden rounded-3xl border border-border">
      <motion.div {...handlers} style={{ scale }} className="spring-scale aspect-[3/2] w-full overflow-hidden">
        {/* Plain img: GSAP scale/scrub transforms on the raw element; next/image wrappers break the effect. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://picsum.photos/seed/${seed}/1200/800`}
          alt=""
          loading="lazy"
          width="1200"
          height="800"
          className="rise-fade w-full h-full object-cover grayscale contrast-110 transition-none"
        />
      </motion.div>
    </div>
  );
}

export function HomeContent() {
  const root = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

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
      gsap.utils.toArray<HTMLElement>(".rise-fade").forEach((img) => {
        gsap.fromTo(
          img,
          { scale: 0.8, opacity: 0.35 },
          {
            scale: 1,
            opacity: 1,
            ease: "none",
            scrollTrigger: { trigger: img, start: "top 92%", end: "top 45%", scrub: 0.7 },
          }
        );
        gsap.to(img, {
          opacity: 0.2,
          filter: "brightness(0.5)",
          ease: "none",
          scrollTrigger: { trigger: img, start: "center 40%", end: "top -10%", scrub: 0.7 },
        });
      });
      gsap.fromTo(
        ".hero-frame",
        { y: 44, opacity: 0, scale: 0.985 },
        { y: 0, opacity: 1, scale: 1, duration: 1.1, ease: "power3.out", delay: 0.35 }
      );
    },
    { scope: root }
  );

  return (
    <main ref={root} className="w-full max-w-full overflow-x-hidden">
      {/* Floating glass navigation - spring-driven */}
      <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <nav
          aria-label="Primary"
          className="flex w-full max-w-3xl items-center justify-between gap-2 rounded-full border border-border bg-card/80 py-2 pl-5 pr-2 shadow-[0_18px_60px_rgba(0,0,0,0.1)] backdrop-blur-[20px] backdrop-saturate-[180%]"
        >
          <Link href="/" className="pressable text-sm font-bold tracking-tight text-foreground" aria-label="Hustlrzz home">
            Hustlrzz
          </Link>
          <div className="hidden items-center gap-6 sm:flex">
            <NavLink href="/prepare">Prepare</NavLink>
            <NavLink href="/assessment">Assess</NavLink>
            <NavLink href="/coaching">Coach</NavLink>
          </div>
          <NavCTA href="/prepare">Start preparing</NavCTA>
        </nav>
      </header>

      {/* ATTENTION — cinematic center hero */}
      <section className="hero-bg grain relative flex min-h-[100svh] items-center justify-center overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 hero-overlay" />

        <div className="relative mx-auto w-full max-w-6xl px-5 pb-20 pt-32 text-center">
          <h1
            className={`${display.className} mx-auto w-full max-w-6xl font-semibold text-foreground text-balance`}
            style={{ fontSize: "clamp(2.75rem, 5vw, 5rem)", lineHeight: 1.04, letterSpacing: "-0.03em" }}
          >
            Walk in rehearsed.{" "}
            <span
              aria-hidden="true"
              className="mx-2 inline-block h-[0.72em] w-24 rounded-full bg-cover bg-center align-middle opacity-80 grayscale"
              style={{ backgroundImage: "url(https://picsum.photos/seed/coach-mic/400/160)" }}
            />
            Leave unforgettable.
          </h1>
          <p className="mx-auto mt-7 max-w-[58ch] text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
            Paste your resume, get a focused question pack, and practice like it is real. Three steps, about five minutes.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <HeroCTA href="/prepare" primary>
              Start preparing <ArrowRight className="h-4 w-4" />
            </HeroCTA>
            <HeroCTA href="/interview" primary={false}>
              <Play className="h-4 w-4" /> Try sample interview
            </HeroCTA>
          </div>
        </div>
      </section>

      {/* Marquee interlude */}
      <div className="bg-background overflow-hidden border-t border-border py-8" aria-hidden="true">
        <div className="marquee-track flex w-max items-center gap-10 pr-10">
          {[...MARQUEE, ...MARQUEE].map((word, i) => (
            <span key={i} className={`${display.className} text-4xl font-semibold tracking-tight text-muted-foreground/40 md:text-5xl`}>
              {word} <span className="ml-10 text-primary">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* INTEREST — gapless bento */}
      <section className="bg-background px-5 py-24 md:px-10 md:py-40">
        <div className="mx-auto max-w-6xl">
          <h2
            className={`${display.className} max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl text-balance`}
            style={{ letterSpacing: "-0.025em", lineHeight: 1.08 }}
          >
            One room for{" "}
            <span
              aria-hidden="true"
              className="mx-1 inline-block h-[0.72em] w-20 rounded-full bg-cover bg-center align-middle opacity-80 grayscale"
              style={{ backgroundImage: "url(https://picsum.photos/seed/focus-desk/320/140)" }}
            />{" "}
            every round.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            Each surface serves the same goal: a more specific, confident answer next time.
          </p>

          <div className="mt-12 grid grid-flow-dense grid-cols-1 gap-4 md:grid-cols-12">
            <BentoCard
              span="md:col-span-7"
              icon={<FileSearch className="h-6 w-6 text-primary" />}
              title="Questions built around your experience"
              copy="Add a resume and job description. Hustlrzz finds the evidence worth practising and creates a focused interview pack."
              seed="evidence-wall"
            />
            <BentoCard
              span="md:col-span-5"
              icon={<Building2 className="h-6 w-6 text-primary" />}
              title="Current company context"
              copy="Research runs when you need it, with source links and preparation cues for the role you selected."
              seed="company-glass"
            />
            <BentoCard
              span="md:col-span-5"
              icon={<MessageSquareText className="h-6 w-6 text-primary" />}
              title="A conversation, not a question list"
              copy="The interviewer listens to each answer, asks follow-ups, and keeps the discussion grounded in your preparation."
              seed="dialogue-loop"
            />
            <BentoCard
              span="md:col-span-7"
              icon={<Camera className="h-6 w-6 text-primary" />}
              title="Content and presence in one review"
              copy="Answer quality alongside posture, gaze, and gesture signals. Camera processing stays on your device."
              seed="presence-studio"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            {["Voice and typing", "Multi-provider AI with automatic failover", "Private on-device camera processing"].map((label) => (
              <p key={label} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-4 text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-green-500" /> {label}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* INTEREST II — horizontal accordions with spring expand/collapse */}
      <section className="border-t border-border bg-muted/50 px-5 py-24 md:px-10 md:py-40">
        <div className="mx-auto max-w-6xl">
          <h2
            className={`${display.className} max-w-2xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl text-balance`}
            style={{ letterSpacing: "-0.025em", lineHeight: 1.08 }}
          >
            Four modes. One momentum.
          </h2>
          <div className="acc-group mt-12 flex flex-col gap-3 md:h-[420px] md:flex-row">
            {MODES.map((mode) => (
              <AccordionSlice key={mode.key} mode={mode} />
            ))}
          </div>
        </div>
      </section>

      {/* DESIRE — scrub reveal + scale gallery */}
      <section className="scrub-block border-t border-border bg-background px-5 py-24 md:px-10 md:py-40">
        <div className="mx-auto max-w-4xl text-center">
          <p className={`${display.className} text-2xl font-medium leading-snug tracking-tight text-foreground md:text-4xl md:leading-snug`}>
            {SCRUB_LINE.split(" ").map((word, i) => (
              <span key={i} className="scrub-word">
                {word}{" "}
              </span>
            ))}
          </p>
        </div>
        <div className="mx-auto mt-20 grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2">
          {["stage-light", "quiet-booth"].map((seed) => (
            <GalleryImage key={seed} seed={seed} />
          ))}
        </div>
      </section>

      {/* ACTION — massive CTA + footer */}
      <section className="relative overflow-hidden border-t border-border bg-primary/5 px-5 py-24 md:py-40">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-[120px]"
        />
        <div className="relative mx-auto max-w-6xl">
          <h2
            className={`${display.className} w-full max-w-6xl text-center font-semibold text-foreground text-balance`}
            style={{ fontSize: "clamp(2.5rem, 6vw, 5.5rem)", lineHeight: 1.02, letterSpacing: "-0.03em" }}
          >
            Your next interview starts tonight.
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <HeroCTA href="/prepare" primary>
              Build my question pack <ArrowRight className="h-4 w-4" />
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