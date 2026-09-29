# Hustlrzz — Presentation Script

**Deck:** `ppt major (1) updated.pptx` · 24 slides
**Target length:** 15–18 minutes + questions
**Guide:** Er. Ashish Agrawal · Group 3

---

## Before you start

**Opening line (say this, don't read the slide):**
> "Good morning sir. We are Group 3. Our project is Hustlrzz — an AI mock interview coach. This is a plan-and-progress presentation, so I'll cover what the system is, how it's built, what's working today, and what's still to come."

**One rule for the whole talk:** every claim about the product must match the tag on screen. Green "Working", amber "In progress", grey "UI built". If you say something is done, it must be one of the four green slides.

---

## Slides 1–2 · Title and contents (30 seconds)

**Slide 1 — HUSTLRZZ**

> "Hustlrzz is an AI mock interview coach. The candidate uploads a resume and a job description, gets role-specific questions, then holds a real voice or text interview with an AI that scores them and tells them what to fix next. We are presenting this as a plan with current progress, so you can see exactly where we are."

Do not read the author names aloud — they're on screen.

**Slide 2 — Contents**

> "I'll start with why this problem exists, then what we're building, how the architecture works, what we've completed, and finally where we go next."

---

## Slide 3 · Motivation (1 minute)

> "Three things are true for most candidates today."

> **"First — feedback-free preparation."** Static question banks give you questions but never probe your answers. You don't find out you were vague until the real interview.

> **"Second — single-dimension tools."** Most tools only score the words in your answer. They say nothing about posture, eye contact, or how you actually come across.

> **"Third — no private interviewer."** Practising with friends works until it doesn't. They can't be consistent, they can't be honest, and they're expensive to keep asking.

---

## Slide 4 · Problem statement (1 minute)

> "Put together: current tools don't connect your real context to a live, multi-dimensional evaluation."

Read the left column quickly — static banks, keyword matching, no non-verbal feedback.

> "Our plan addresses each one: generate questions from the candidate's *own* resume and job description, conduct a real-time conversational interview, score the answers, and track posture in parallel while they answer."

---

## Slide 5 · Literature review (1 minute)

> "We didn't design this from nothing. Three papers shaped it."

> **"Retrieval-Augmented Generation, Lewis et al. 2020"** — this is why we have a knowledge base. It's the standard way to ground a model in your own documents instead of its memory.

> **"Chain-of-Thought Prompting, Wei et al. 2022"** — this is why the coach can show its reasoning in the report rather than just giving a score.

> **"BlazePose, Bazarevsky et al."** — MediaPipe's on-device pose tracking. This is what lets us measure posture without ever sending video anywhere.

> "One more dependency: Groq and Gemini for generation, and the Web Speech API for voice."

---

## Slide 6 · How it works (2 minutes)

This is the core slide. Walk the four cards left to right.

> **"Step 1, Prepare."** The candidate pastes or uploads a resume and a job description. Optionally a company. The system returns a question pack with answer direction.

> **"Step 2, Interview."** A WebSocket connection opens. The AI interviewer asks questions live. The candidate answers by typing or speaking.

> **"Step 3, Feedback."** The interviewer can follow up — it reacts to what was actually said. The whole transcript becomes a structured, scored report.

> **"Step 4, Parallel."** And this runs the entire time — in-browser body-language tracking, so posture and eye contact are measured while they answer, not afterwards."

> Point at the bottom bar: "And in progress alongside this — candidate-owned documents are retrieved as source-labelled context, so the interviewer can ask about *their* material."

---

## Slide 7 · Architecture (2 minutes)

Trace the diagram top-left downward, then across.

> "**Top left is the candidate's browser, and this is a privacy boundary.** Next.js and TypeScript render the interface. Alongside it, MediaPipe and the Web Speech API run *on the device* — camera frames never leave the browser. That's deliberate."

> "**REST and an authenticated WebSocket** go down to the FastAPI application — that's where preparation, knowledge, coaching, and history live."

> "**The AI gateway** sits below that. It tries Groq, then Gemini, and it only uses free tiers. If you want a paid provider, you bring your own key. That's a design decision we made after finding the original fallback would silently spend money."

> "**Right side is the data layer.** Supabase Postgres with row-level security. Below it, the candidate's knowledge base — their documents, chunked, embedded, and stored user-scoped."

> "**The arrow that matters** is 'bounded source context': the top five source-labelled chunks (`RAG_TOP_K=5`, capped at 10) flow back into the interview. And note the last line — if retrieval fails, the interview still works. A knowledge base failure must never block practice."

---

## Slide 8 · Technology stack (45 seconds)

Don't read all eight. Name the shape of it:

> "Next.js 16 and React on the front end. Python and FastAPI behind it, talking over REST and WebSockets. Supabase Postgres with pgvector for candidate-owned vectors. MediaPipe and the Web Speech API in the browser. Vercel and Render, deployed independently."

> "One line to stress: **free tiers only, bring your own key for paid providers.** We did not want a student project that silently generates a bill."

---

## Slide 9 · Demo (1 minute)

> "This is the path that works end to end today. I'll run it in front of you."

1. Open the app, sign in
2. Submit a resume and target job description
3. Start an interview — AI asks a role-specific question
4. Answer by voice, show the follow-up
5. Show the live camera posture signal
6. End the session — report and history

> **If the network fails, say this and move on:**
> "The live environment is rate-limited on the free tier, so I have the recorded run on the next slides. The code path is identical."

---

## Slide 10 · Current progress (2 minutes) — the most important slide

Slow down here. This is the honesty slide.

> "About forty percent of the plan is functional today."

> **"Green — working, end to end."** Prepare, Resume Analyzer, Interview, and Coaching. Sign in to a written coaching result, no manual steps.

> **"Amber — in progress."** The knowledge base. Uploading and searching both work. But retrieval *quality* is still being validated against real documents, so we're not calling it done."

> **"Grey — UI built, behaviour not wired."** Coaching workspaces, assessment, settings, and data rights. The screens exist and look right. The logic behind them is what we're building next."

> **"Not started."** Capacity planning, backup and recovery, and evaluation with real users."

> "The next ten slides are the actual screens, so you can judge that claim yourself."

---

## Slides 11–19 · Product screens (2–3 minutes total)

Move quickly. One line each.

| # | Slide | Say |
|---|---|---|
| 11 | Divider | "These are the screens in the current build. I will mark each one honestly." |
| 12 | Practice | "Live interview setup — working." |
| 13 | Prepare | "Resume in, question pack out — working." |
| 14 | Coaching | "Role fit, company playbooks, offer negotiation, practice room. Screen: built, not yet wired." |
| 15 | Progress | "Packs and interview history — working." |
| 16 | Resume Analyzer | "Upload a PDF, get skills, gaps, and a revision priority. Note the counter in the corner — three free reviews a day, zero paid credits." |
| 17 | Knowledge base | "This is the in-progress one. Search for 'onboarding' and it returns a 68% match from a document the candidate actually added." |
| 18 | Assessment | "Screen: built, not yet wired." |
| 19 | Settings | "Your own AI key, and your data rights — export or erase. Built, not yet wired." |

> On slide 17, if asked: "We mark it in progress because it passed our tests but hadn't been used against a live embedding provider. Then we signed in and used it — and found the model had been withdrawn upstream. The tests had passed because they stubbed the provider. That's why we verify against the real thing now."

---

## Slide 20 · Enhancements (45 seconds)

> "Four things on the roadmap."

> "Improve retrieval quality and add hybrid ranking. Compare reports across sessions so candidates see measurable improvement. Explore smaller local models for offline practice. And widen the assessment rubrics."

---

## Slide 21 · Conclusion (45 seconds)

> "What works today: role-specific questions from a real resume, a live voice or text interview, in-browser body-language feedback, and a structured coaching report."

> "What's next: coaching workspaces, assessment, settings, and data rights — the screens are built, the behaviour is coming."

> "The point of the whole system is one line: **it evaluates both what you said and how you said it.** Most preparation only does the first."

---

## Slides 22–24 · References, close, links (20 seconds)

> "References are on the source. Thank you sir — and every link is on the last slide: the live app, the backend health check, and the repository."

---

## Questions you should expect

**"Is it deployed?"** Yes — Vercel for the front end, Render for the API. The link is on the last slide.

**"Why only forty percent?"** The core journey works end to end. The remaining modules have finished interfaces and pending logic. We chose to show that honestly rather than claim completion.

**"How do you know it works if the modules aren't wired?"** 249 backend tests and 141 frontend tests pass on every change, and the working modules were verified by signing in and using them live.

**"What happens when the AI provider fails?"** Each eligible provider is tried once, then it fails visibly. We never fall through to a paid provider silently.

**"Is the candidate's data private?"** Camera frames never leave the browser. Everything else is owner-scoped with row-level security, and candidates can export or delete their data.

**"Why is the knowledge base only 'in progress'?"** It passed its tests, but those tests stubbed the embedding provider. Used for real, the configured model had been withdrawn. We found it by using it, not by testing it.
