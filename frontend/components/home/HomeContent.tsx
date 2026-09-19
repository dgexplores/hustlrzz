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
  Mic,
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
    <motion.span {...handlers} style={{ scale }} className="pressable text-[13px] font-medium text-white/70 transition-none">
      <Link href={href} className="block hover:text-white">{children}</Link>
    </motion.span>
  );
}

function NavCTA({ href, children }: { href: string; children: React.ReactNode }) {
  const { scale, handlers } = usePressAndHover(0.97, 1.03);
  return (
    <motion.span {...handlers} style={{ scale }} className="pressable rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#05070d] transition-none">
      <Link href={href} className="block">{children}</Link>
    </motion.span>
  );
}

function HeroCTA({ href, children, primary = true }: { href: string; children: React.ReactNode; primary?: boolean }) {
  const { scale, handlers } = usePressAndHover(0.97, 1.03);
  return (
    <motion.span {...handlers} style={{ scale }} className="pressable inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold transition-none">
      <Link
        href={href}
        className={`block ${
          primary
            ? "bg-white text-[#05070d] shadow-[0_10px_40px_rgba(255,255,255,0.25)]"
            : "border border-white/25 bg-white/10 text-white backdrop-blur-md hover:bg-white/20"
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
    <motion.span {...handlers} style={{ scale }} className="pressable transition-none">
      <Link href={href} className="hover:text-white">{children}</Link>
    </motion.span>
  );
}

function AccordionSlice({ mode }: { mode: typeof MODES[0] }) {
  const { flex, isExpanded, expand, collapse } = useFlexSpring(1, 2.4);
  const { scale: imgScale } = useHoverSpring(1, 1.05);

  return (
    <motion.a
      href={mode.href}
      className="acc-slice pressable group relative min-h-[220px] flex-1 overflow-hidden rounded-3xl border border-white/10 md:min-h-0"
      style={{ flexGrow: flex }}
      onMouseEnter={expand}
      onMouseLeave={collapse}
      onFocus={expand}
      onBlur={collapse}
    >
      <motion.div
        style={{ scale: imgScale }}
        className="absolute inset-0 bg-cover bg-center grayscale transition-none"
        aria-hidden="true"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[#05070d] via-[#05070d]/45 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 p-6">
        <p className={`${display.className} text-2xl font-semibold text-white`}>{mode.title}</p>
        <motion.p
          style={{ opacity: isExpanded ? 1 : 0, y: isExpanded ? 0 : 10 }}
          className="mt-2 max-w-[36ch] text-sm leading-6 text-white/70 transition-none"
        >
          {mode.copy}
        </motion.p>
        <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-white">
          Open <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <style jsx>{`
        .acc-slice:hover {
          filter: saturate(.6) brightness(.75);
        }
        .acc-slice:hover > * {
          filter: none;
        }
        .acc-slice .absolute.inset-0.bg-cover.bg-center.grayscale:hover {
          transform: scale(1.05);
        }
      `}</style>
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
      className={`group relative ${span} min-h-64 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-7 md:p-9 transition-none spring-scale`}
    >
      <motion.div
        {...handlers}
        style={{ scale: imgScale, opacity: 0.25, backgroundImage: `url(https://picsum.photos/seed/${seed}/1000/700)` }}
        className="absolute inset-0 bg-cover bg-center grayscale mix-blend-luminosity transition-none"
        aria-hidden="true"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#05070d] via-[#05070d]/55 to-transparent" />
      <div className="relative">
        {icon}
        <h3 className="mt-16 max-w-md text-xl font-semibold tracking-tight text-white md:mt-20">{title}</h3>
        <p className="mt-3 max-w-lg text-sm leading-6 text-white/65">{copy}</p>
      </div>
    </motion.article>
  );
}

function GalleryImage({ seed }: { seed: string }) {
  const { scale, handlers } = useHoverSpring(1, 1.05);
  return (
    <motion.div {...handlers} style={{ scale }} className="group overflow-hidden rounded-3xl border border-white/10 spring-scale">
      {/* Plain img: GSAP scale/scrub transforms on the raw element; next/image wrappers break the effect. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://picsum.photos/seed/${seed}/1200/800`}
        alt=""
        loading="lazy"
        className="rise-fade aspect-[3/2] w-full object-cover grayscale contrast-125 transition-none"
      />
    </motion.div>
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
          filter: "brightness(0.45)",
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
          className="flex w-full max-w-3xl items-center justify-between gap-2 rounded-full border border-white/15 bg-[#0a0e18]/60 py-2 pl-5 pr-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-[20px] backdrop-saturate-[180%]"
        >
          <Link href="/" className="pressable text-sm font-bold tracking-tight text-white">
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
      <section className="campaign-ink grain relative flex min-h-[108svh] items-center justify-center overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-90 grayscale contrast-125"
          style={{ backgroundImage: "url(https://picsum.photos/seed/interview-stage/1920/1080)" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1100px 520px at 50% 42%, rgba(5,7,13,0.15), rgba(5,7,13,0.88) 78%), linear-gradient(to bottom, rgba(5,7,13,0.55), rgba(5,7,13,0.35) 40%, #05070d 96%)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-[#2e5bff]/30 blur-[130px]"
        />
        <div
          aria-hidden="true"
          className="absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-[#7c5cff]/25 blur-[130px]"
        />

        <div className="relative mx-auto w-full max-w-6xl px-5 pb-28 pt-40 text-center">
          <h1
            className={`${display.className} mx-auto w-full max-w-6xl font-semibold text-white`}
            style={{ fontSize: "clamp(2.75rem, 5vw, 5rem)", lineHeight: 1.04, letterSpacing: "-0.03em" }}
          >
            Walk in rehearsed.{" "}
            <span
              aria-hidden="true"
              className="mx-2 inline-block h-[0.72em] w-24 rounded-full bg-cover bg-center align-middle grayscale"
              style={{ backgroundImage: "url(https://picsum.photos/seed/coach-mic/400/160)" }}
            />
            Leave unforgettable.
          </h1>
          <p className="mx-auto mt-7 max-w-[58ch] text-base leading-7 text-white/70 md:text-lg md:leading-8">
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

          <div className="hero-frame relative mx-auto mt-16 max-w-4xl overflow-hidden rounded-[1.5rem] border border-white/15 bg-white/[0.06] shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2e5bff]/25 text-white">
                  <Mic className="h-4 w-4" />
                </span>
                <p className="text-left text-sm font-semibold text-white">Product interview</p>
              </div>
              <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">Live</span>
            </div>
            <div className="grid gap-4 p-5 text-left md:grid-cols-[1fr_190px] md:p-7">
              <div className="flex flex-col gap-4">
                <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-white/10 p-4">
                  <p className="text-sm leading-6 text-white/90">Tell me about a technical decision you changed after new evidence.</p>
                </div>
                <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-white px-4 py-3.5">
                  <p className="text-sm leading-6 text-[#05070d]">I changed our client-side data strategy after profiling the slowest journeys…</p>
                </div>
                <div className="mt-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
                  <div className="live-wave flex flex-1 items-center gap-1" aria-hidden="true">
                    {[5, 11, 17, 9, 22, 14, 7, 19, 12, 6, 15, 9, 20, 11, 5].map((h, i) => (
                      <span key={i} className="w-full rounded-full bg-white/60" style={{ height: h }} />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-white/60">Listening</span>
                </div>
              </div>
              <aside className="hidden rounded-xl border border-white/10 bg-white/[0.04] p-4 lg:block">
                <p className="text-xs font-semibold text-white/50">Session signals</p>
                <div className="mt-4 space-y-4">
                  {[["Structure", "Clear"], ["Eye contact", "Steady"], ["Posture", "Balanced"]].map(([l, v]) => (
                    <div key={l}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-white/55">{l}</span>
                        <span className="text-xs font-semibold text-white">{v}</span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-[76%] rounded-full bg-[#2e5bff]" />
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee interlude */}
      <div className="campaign-ink overflow-hidden border-t border-white/10 py-8" aria-hidden="true">
        <div className="marquee-track flex w-max items-center gap-10 pr-10">
          {[...MARQUEE, ...MARQUEE].map((word, i) => (
            <span key={i} className={`${display.className} text-4xl font-semibold tracking-tight text-white/25 md:text-5xl`}>
              {word} <span className="ml-10 text-[#2e5bff]">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* INTEREST — gapless bento */}
      <section className="campaign-ink px-5 py-32 md:px-10 md:py-48">
        <div className="mx-auto max-w-6xl">
          <h2
            className={`${display.className} max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-5xl`}
            style={{ letterSpacing: "-0.025em", lineHeight: 1.08 }}
          >
            One room for{" "}
            <span
              aria-hidden="true"
              className="mx-1 inline-block h-[0.72em] w-20 rounded-full bg-cover bg-center align-middle opacity-90 grayscale"
              style={{ backgroundImage: "url(https://picsum.photos/seed/focus-desk/320/140)" }}
            />{" "}
            every round.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/60">
            Each surface serves the same goal: a more specific, confident answer next time.
          </p>

          <div className="mt-12 grid grid-flow-dense grid-cols-1 gap-4 md:grid-cols-12">
            <BentoCard
              span="md:col-span-7"
              icon={<FileSearch className="h-6 w-6 text-[#8fb0ff]" />}
              title="Questions built around your experience"
              copy="Add a resume and job description. Hustlrzz finds the evidence worth practising and creates a focused interview pack."
              seed="evidence-wall"
            />
            <BentoCard
              span="md:col-span-5"
              icon={<Building2 className="h-6 w-6 text-[#8fb0ff]" />}
              title="Current company context"
              copy="Research runs when you need it, with source links and preparation cues for the role you selected."
              seed="company-glass"
            />
            <BentoCard
              span="md:col-span-5"
              icon={<MessageSquareText className="h-6 w-6 text-[#8fb0ff]" />}
              title="A conversation, not a question list"
              copy="The interviewer listens to each answer, asks follow-ups, and keeps the discussion grounded in your preparation."
              seed="dialogue-loop"
            />
            <BentoCard
              span="md:col-span-7"
              icon={<Camera className="h-6 w-6 text-[#8fb0ff]" />}
              title="Content and presence in one review"
              copy="Answer quality alongside posture, gaze, and gesture signals. Camera processing stays on your device."
              seed="presence-studio"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            {["Voice and typing", "Multi-provider AI with automatic failover", "Private on-device camera processing"].map((label) => (
              <p key={label} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white/70">
                <ShieldCheck className="h-4 w-4 text-emerald-300" /> {label}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* INTEREST II — horizontal accordions with spring expand/collapse */}
      <section className="border-t border-white/10 bg-[#070b16] px-5 py-32 md:px-10 md:py-48">
        <div className="mx-auto max-w-6xl">
          <h2
            className={`${display.className} max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-5xl`}
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
      <section className="scrub-block border-t border-white/10 bg-[#05070d] px-5 py-32 md:px-10 md:py-48">
        <div className="mx-auto max-w-4xl text-center">
          <p className={`${display.className} text-2xl font-medium leading-snug tracking-tight text-white md:text-4xl md:leading-snug`}>
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
      <section className="relative overflow-hidden border-t border-white/10 bg-[#2e5bff] px-5 py-32 md:py-48">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/20 blur-[120px]"
        />
        <div className="relative mx-auto max-w-6xl">
          <h2
            className={`${display.className} w-full max-w-6xl text-center font-semibold text-white`}
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
          <footer className="mt-24 flex flex-col items-center justify-between gap-6 border-t border-white/25 pt-8 text-[13px] text-white/80 sm:flex-row">
            <p className="font-bold text-white">Hustlrzz</p>
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