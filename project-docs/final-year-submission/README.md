# Hustlrzz — Final Year Submission Pack

Documentation for **Hustlrzz**, a real-time AI mock interview coach with live voice
practice, private browser-based body analysis, and candidate-owned retrieval.

Live app: <https://hustlrzz.vercel.app> · API health: <https://hustlrzz-api.onrender.com/health>

## Status

Roughly **40% of the plan is functional**. This is stated deliberately, and every
document in this folder is kept in step with it.

| State | Modules |
|---|---|
| **Working** | Prepare · Resume Analyzer · Interview · Coaching report · Progress |
| **In progress** | Knowledge base — upload and search work; retrieval quality still being validated against real documents |
| **UI built, backend not wired** | Coaching workspaces · Assessment · Settings and provider key · Account data rights |
| **Not started** | Capacity planning · backup and recovery · evaluation with real users |

## Contents

### `presentation/`
| File | |
|---|---|
| `Hustlrzz_Presentation.pptx` | 24-slide deck, 16:9 |
| `Hustlrzz_Presentation.pdf` | Same deck, 24 pages |
| `Hustlrzz_Presentation_Script.md` | Slide-by-slide script, timings, and expected questions |

Slide order: title → contents → motivation → problem → literature → how it works →
architecture → stack → demo → current progress → product screens (each tagged
**Working** / **In progress** / **UI built**) → enhancements → conclusion →
references → thank you → **links (final slide)**.

### `report/`
| File | |
|---|---|
| `Hustlrzz_Report.docx` | Synopsis report, 13 pages |
| `Hustlrzz_Report.pdf` | Same report, 13 pages |

### `guide/`
| File | |
|---|---|
| `Hustlrzz_Project_Guide.md` | How the system works: architecture, stack, RAG, API surface, security, deployment, and honest limitations |

## Conventions used throughout

- **RAG retrieval returns the top 5 source-labelled chunks** (`RAG_TOP_K=5`, capped at 10).
- **AI routing is free-tier only** — Groq, then Gemini. Paid providers require a
  candidate-supplied key or `AI_PROVIDER_ALLOW_PAID=1`.
- **Embedding model** is `models/gemini-embedding-001` at 768 dimensions.
- **Resume Analyzer** allows 3 free reviews per day.
- **Camera frames never leave the browser** — pose and gaze run on-device.
- **Tests:** 249 backend, 141 frontend, all passing.

## Regenerating the PDFs

Both PDFs are LibreOffice exports of the Office files. After editing a `.docx` or
`.pptx`, regenerate its PDF so the two stay identical:

```sh
soffice --headless --convert-to pdf --outdir <dir> <file>
```

Word users: after editing a `.docx`, select all and press `F9` to refresh the
table of contents page numbers.
