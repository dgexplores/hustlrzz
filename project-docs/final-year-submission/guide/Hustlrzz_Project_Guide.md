# Hustlrzz — Project Guide

Everything about the project in plain language: what it is, what it does, how it works, what it's built from, what it's built with, and how we know it works.

**Group 3** · Arsh Yar Khan, Deepak Gangwar, Nikhil Singh, Riya Rastogi
**Guide:** Er. Ashish Agrawal · SRMS CET, Bareilly

---

## 1. What is Hustlrzz?

Hustlrzz is a **web application that acts as a mock interviewer**.

You give it your resume and a job description. It reads them, works out what the role actually needs, and writes interview questions aimed at *your* experience — not a generic list. Then it interviews you. A real AI interviewer asks questions one at a time, listens to your answers, and asks follow-ups based on what you actually said. When it finishes, you get a structured report: scores, a plain-language takeaway, the single highest-priority thing to fix, and the evidence behind it.

While you answer, it also watches **how** you're answering — your posture, eye contact, and gestures — using the camera on your own device.

**In one line:** it practises both *what you say* and *how you say it*, which is what an interviewer actually judges.

---

## 2. Who is it for, and what problem does it solve?

| Problem today | What Hustlrzz does |
|---|---|
| Question banks are generic — no connection to your CV | Questions are generated from your own resume and the specific job description |
| Feedback arrives too late to matter | You get the report immediately after the session |
| Most tools only score the words in an answer | Posture, eye contact, and delivery are measured in parallel |
| Practising with friends is inconsistent and awkward | A private, always-available interviewer that never gets tired of you |
| Paid tools lock you into their data | Your documents stay yours — you can export or delete everything |

**Intended users:** students and graduates preparing for placements, career switchers, and professionals rehearsing for a specific senior or salary conversation. Placement cells can also use it to structure preparation.

---

## 3. How it works — the candidate journey

### Step 1 · Prepare
You paste or upload a resume (text, PDF, or DOCX) and a job description. Optionally a company name. The system reads both in memory, extracts the evidence of what you've actually done, matches it against what the role needs, and returns a **question pack** — the questions you're likely to face, with guidance on what a strong answer covers, and a match analysis.

If you add a company, it also researches that company so the questions match their interview style.

### Step 2 · Interview
You start a session. A WebSocket connection opens and an AI interviewer begins. You answer by **typing or speaking**. Because it's a live connection, it can react — it reads your last answer and picks a follow-up intent: `probe-depth`, `challenge-claim`, `clarify`, `objection`, or `close`. It asks exactly one useful follow-up at a time, so it is a conversation rather than a fixed script.

### Step 3 · Parallel body-language tracking
At the same time, and **entirely on your device**, MediaPipe reads your camera for posture, face, and hand signals. The frames are analysed in the browser and never uploaded. You get cues on delivery while you're still talking.

### Step 4 · Feedback
The transcript becomes a structured report: scores across dimensions, a takeaway in plain language, the highest-priority action, and supporting evidence you can check.

### Step 5 · Progress
Every pack and session is saved to your account so you can see where you are and what's next.

---

## 4. Architecture

The system has five layers. The most important design decision is the **first** one.

```
┌─────────────────────────────────────────────┐
│  CANDIDATE'S BROWSER  ← private boundary     │
│                                             │
│  ┌────────────────┐  ┌───────────────────┐  │
│  │ Next.js 16 +   │  │ On-device analysis│  │
│  │ React 18 + TS  │  │ MediaPipe + Web   │  │
│  │ Tailwind       │  │ Speech STT/TTS    │  │
│  └────────────────┘  │ camera stays here │  │
│                       └───────────────────┘  │
└──────────────┬──────────────────────────────┘
               │  REST  +  authenticated WebSocket
┌──────────────▼──────────────────────────────┐
│  FastAPI application (Python 3.14)          │
│  preparation · knowledge · coaching · history│
└───────┬──────────────────────────┬──────────┘
        │                          │
┌───────▼────────┐        ┌────────▼──────────┐
│  AI gateway    │        │  Supabase Postgres │
│  Groq → Gemini │        │  RLS + pgvector    │
│  free tiers    │        │  768-dim vectors   │
└───────┬────────┘        └────────┬──────────┘
        │                          │
┌───────▼────────┐        ┌────────▼──────────┐
│  LLM providers │        │ Candidate knowledge│
│  generation    │        │ documents + chunks │
│  judging       │        │ user-scoped search │
└────────────────┘        └───────────────────┘
```

### The five layers explained

**1. Browser (the privacy boundary)**
Next.js renders the interface. MediaPipe and the Web Speech API run on the device. **Camera frames never leave the browser** — only derived signals (posture score, eye contact, gesture flags) are used. We chose this because a candidate should never have to trust us with their camera.

**2. FastAPI application**
The backend. Exposes REST endpoints for preparation, knowledge, coaching, and history, plus a WebSocket for the live interview. It validates every input, coordinates the AI calls, and enforces the access rules.

**3. AI gateway**
Sits between the application and the model providers. It tries **Groq, then Gemini, and only free tiers**. This is a deliberate correction: the original design fell through to the next provider on *any* error, including a free-tier rate limit — which meant an exhausted free allowance silently started costing money. The gateway now attempts each eligible provider once and then fails visibly. A paid provider is reachable only if the candidate supplies their own key, or an operator explicitly opts in.

**4. Supabase Postgres**
Authentication, workflows, sessions, reports. Every table is protected by **row-level security**, so a query can't return another candidate's rows even if the application layer had a bug.

**5. Candidate knowledge (RAG)**
The candidate's own documents are chunked, embedded into 768-dimension vectors, and stored user-scoped. When the interview needs context, the **top five** relevant chunks are pulled in (`RAG_TOP_K`, capped at 10) — each carrying a label saying which document it came from, so the model can cite its source and the candidate can check it.

**Critically: retrieval failure never blocks the interview.** If the knowledge base is down, the core journey still works without it.

---

## 5. Features

### Working end to end

| Feature | What it does |
|---|---|
| **Prepare** | Resume + job description + optional company → question pack, answer direction, role context |
| **Resume Analyzer** | PDF/DOCX analysed in memory → visible skills, likely gaps, a directional readiness score, and the single highest-value revision |
| **Interview** | Live typed or spoken interview over WebSocket, with adaptive follow-ups and a session report |
| **Coaching** | Evidence-based takeaway, priority action, and next practice step |
| **Progress** | Packs and interview history in one place, with a clear next step |

### In progress

**Knowledge base** — add, search, and delete your own sources (resume, portfolio, notes, session reports, company research). Uploading and search both work. Retrieval *quality* is still being validated against real documents, so it is not yet called complete.

### Interface complete, behaviour not yet wired

| Feature | What it will do |
|---|---|
| **Coaching workspaces** | Role fit, company playbooks, offer negotiation, a practice room |
| **Assessment** | Timed multi-round responses → graded rounds and a readiness report |
| **Settings — provider key** | Optional candidate-supplied AI key, encrypted at rest, shown only as a four-character hint |
| **Account data rights** | Full data export, or irreversible erasure of every record |

### Not started
Operational work only — no product modules fall in this group: capacity planning · backup and recovery · evaluation with real users.

---

## 6. The API surface

Forty endpoints, grouped by what they do:

| Group | Endpoints |
|---|---|
| Preparation | `/workflows/start`, `/workflows/upload`, `/workflows/{id}` |
| Interview | `/interviews/start`, `/interviews`, `/interviews/{id}` |
| Coaching | `/coaching/analyze`, `/coaching/explain`, `/coaching/practice`, `/coaching/salary` |
| Knowledge | `/knowledge/documents`, `/knowledge/search`, `/knowledge/status` |
| Resume | `/resume-analyzer/analyze`, `/resume-analyzer/analyses`, `/usage` |
| Assessment | `/assessment/start`, `/assessment/attempts`, `/{id}/submit` |
| Memory & drills | `/memory/profile`, `/memory/drills`, `/memory/drills/{skill}/review` |
| Company | `/companies`, `/companies/{name}/intelligence` |
| Progress | `/analytics/summary`, `/analytics/events`, `/feedback/summary` |
| Account | `/account/export`, `/account` (delete) |
| AI keys | `/ai/keys`, `/ai/keys/{provider}`, `/ai/quota` |
| Health | `/health` |

---

## 7. How we know it works — testing

**Current verified state:**

| Suite | Result |
|---|---|
| Backend (pytest) | **249 passed** |
| Frontend (Vitest) | **141 passed** across **20 files** |
| TypeScript | Clean |
| Lint | Clean |
| Build | Clean |
| Dependency audit | No production vulnerabilities |

### What the tests actually cover

**Backend — 18 files.** Core behaviour and integration flows; the RAG pipeline; grounding and the retrieval tools; BYOK and the keyring (including that a key can't be read back); resume analysis; account rights and deletion ordering; interview intensity; feedback; analytics; session detail; drills; the evaluation harness; and knowledge-workspace behaviour.

**Frontend — 20 files.** The API client and its storage handling; authentication gating, including that public routes stay public; the knowledge panel; AI-key and data-rights cards; analytics; settings; the landing hero including its reduced-motion behaviour; spring animations and their reduced-motion variants; markdown report rendering; session detail; downloads; and the service worker.

### The lesson that changed how we test

The knowledge base **passed every automated test** while being completely broken in production.

Its tests supplied a **stubbed embedding provider**, so they confirmed the code path ran. But the embedding model configured for production had been withdrawn by its provider and returned an error for every real request. The feature had never worked outside the test suite.

We found it by signing into the live deployment and using it the way a candidate would. The model was corrected, and retrieval is now re-validated against a live provider before the module is called complete.

**That is why the Current Progress slide separates "in progress" from "UI built".** A green test result is evidence the code runs. It is not evidence the feature works.

---

## 8. Security and privacy

- **Camera frames never leave the browser.** Body-language analysis is entirely on-device.
- **Row-level security** on every table, so a coding mistake in the application layer cannot leak another candidate's data.
- **Provider keys are encrypted at rest** with AES-256-GCM, and the provider name and owning user ID are bound in as additional authenticated data — a ciphertext copied to a different row fails to decrypt.
- **No key is ever returned by any endpoint**, including the data export.
- **Account erasure clears data first and removes the login last**, and only if every table succeeded. If one fails, the account survives so the action can be retried, and the response says what cleared and what didn't. A partial erasure is never reported as clean.
- **Outbound web research resolves each host once and connects to that literal address**, repeating the check on every redirect — closing the window where a hostname could be rebound to an internal address between validation and connection.
- **Free-tier-only routing**, so a candidate is never silently charged.
- Shared rate limiting in the database, so limits hold across every running instance.

---

## 9. Current status, honestly

Roughly **40% of the plan is functional**. The core journey — sign in, prepare, analyse, interview, receive coaching — runs end to end. The knowledge base is partly built. Four modules have finished interfaces with pending logic.

We chose to present it this way rather than claim completion. The screens are real, the working parts are verified by using them, and the gap is stated plainly.

---

## 10. Known limitations

- **Google sign-in** is configured correctly (provider, client ID, and the exact redirect URL allow-listed), but the final consent click has not been completed by a human.
- **Password reset is deliberately non-functional** — no mail provider is configured, so no reset email is ever sent. Email sign-up is instant and auto-confirmed.
- **The knowledge base** is in progress pending retrieval-quality validation against real documents.
- **Four modules** have interfaces but pending logic.
- **Free-tier rate limits** apply. The Resume Analyzer allows three free reviews a day (`RESUME_ANALYZER_FREE_DAILY_LIMIT = 3`), and the screen shows the remaining allowance against zero paid credits.

---

## 11. Where to find everything

| | |
|---|---|
| **Live application** | `https://hustlrzz.vercel.app` |
| **Backend health** | `https://hustlrzz-api.onrender.com/health` |
| **Source code** | `https://github.com/dgexplores/hustlrzz` |
| **Interface gallery** | `docs/images_project/` — 16 screens captured from the live deployment |
| **Evidence log** | `project-docs/evidence/commands.md` — every test run, deployment, and fix in order |
| **Local setup** | `README.md` |

---

## 12. If you're asked "why did you build it this way?"

Three decisions are worth defending, because each corrects a design that looked reasonable on paper.

**Why is the camera analysis on-device?** Because a candidate should never have to trust a college project with their camera. Analysing frames in the browser costs nothing extra here and removes the question entirely.

**Why free-tiers-only?** The original fallback chain moved to the next provider on any error, including a free-tier rate limit. Two of those providers are paid, so an exhausted free allowance didn't stop the request — it started charging. Now each eligible provider is tried once and then it fails visibly. A paid provider is reachable only with the candidate's own key.

**Why delete the login last during erasure?** Deleting it first would make the remaining deletes impossible, because every call needs authentication. The order is data first, login last, and the login survives any failure so the action can be retried.
