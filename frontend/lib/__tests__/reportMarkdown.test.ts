import { describe, expect, it } from "vitest";
import {
  buildCoachingReportMarkdown,
  buildInterviewReportMarkdown,
  buildPreparePackMarkdown,
} from "../reportMarkdown";

const interviewReport = {
  scores: {
    communication: 85,
    structure: 80,
    depth: 82,
    technical_accuracy: 88,
  },
  strengths: ["Quantified the Redis caching win, p95 900ms to 540ms."],
  improvements: ["Name your personal decisions more explicitly."],
  delivery_notes: ["Slow down when listing numbers."],
  star_example: "Redis rollout cut p95 to 540ms.",
  next_drill: "Retell the story in 90 seconds with only numbers.",
  summary: "Strong evidence-backed answer.",
  verdict: "Hire signal on technical depth.",
  hiring_manager: {
    decision: "lean-hire",
    confidence: "medium",
    risk: "Thin leadership examples.",
    bar_raiser_notes: "Probe ownership language.",
  },
};

const practiceResult = {
  overall_score: 80,
  summary: "Clear answer with room for sharper numbers.",
  content: {
    score: 8,
    strengths: ["Concrete caching example."],
    improvements: ["Quantify the team impact."],
  },
  delivery: {
    score: 7,
    strengths: ["Steady pace."],
    improvements: ["Reduce filler before the result."],
  },
  transcript_evidence: [
    { quote: "we cut latency 40%", insight: "Quantified outcome landed well." },
  ],
  better_answer: "I led the cache rollout and cut p95 latency from 900ms to 540ms.",
  next_drill: "Retell the story in 90 seconds with only numbers.",
  presence: { eyeContactConsistency: 92, postureStability: 88, cameraEnabled: true },
  scenario: "behavioral interview",
  difficulty: "realistic",
};

const preparePack = {
  workflow_id: "wf-123",
  questions: [
    {
      type: "behavioral",
      question: "Tell me about a difficult project.",
      tests: "ownership",
      difficulty: 4,
      answer_hint: "Use STAR.",
      follow_up: "What would you do differently?",
    },
    {
      type: "technical",
      question: "How would you scale this API?",
      tests: "system design",
      difficulty: 5,
    },
  ],
  company_match: {
    matched_skills: ["Python", "FastAPI"],
    gap_skills: ["Kubernetes"],
    resume_weaknesses: ["No quantified metrics on page one."],
    overall_match_percent: 78,
    summary: "Strong backend overlap; infra evidence is thin.",
  },
  company_research: { status: "live", company: "Google" },
};

describe("buildInterviewReportMarkdown", () => {
  it("includes verdict and summary from the report JSON", () => {
    const md = buildInterviewReportMarkdown(interviewReport);
    expect(md).toContain("## Verdict");
    expect(md).toContain("Hire signal on technical depth.");
    expect(md).toContain("## Summary");
    expect(md).toContain("Strong evidence-backed answer.");
  });

  it("renders every score as a table row matching the JSON", () => {
    const md = buildInterviewReportMarkdown(interviewReport);
    expect(md).toContain("| communication | 85/100 |");
    expect(md).toContain("| structure | 80/100 |");
    expect(md).toContain("| depth | 82/100 |");
    expect(md).toContain("| technical_accuracy | 88/100 |");
  });

  it("lists strengths and improvements verbatim", () => {
    const md = buildInterviewReportMarkdown(interviewReport);
    expect(md).toContain("- Quantified the Redis caching win, p95 900ms to 540ms.");
    expect(md).toContain("- Name your personal decisions more explicitly.");
  });

  it("includes hiring-manager view, delivery notes, STAR example, and next drill", () => {
    const md = buildInterviewReportMarkdown(interviewReport);
    expect(md).toContain("**Decision:** lean-hire");
    expect(md).toContain("**Confidence:** medium");
    expect(md).toContain("**Risk if hired:** Thin leadership examples.");
    expect(md).toContain("**Bar-raiser:** Probe ownership language.");
    expect(md).toContain("- Slow down when listing numbers.");
    expect(md).toContain("Redis rollout cut p95 to 540ms.");
    expect(md).toContain("Retell the story in 90 seconds with only numbers.");
  });

  it("uses meta title and date when provided", () => {
    const md = buildInterviewReportMarkdown(interviewReport, { title: "Acme loop debrief", date: "2026-09-23" });
    expect(md).toContain("# Acme loop debrief");
    expect(md).toContain("**Date:** 2026-09-23");
  });

  it("tolerates a fallback report with missing scores and strengths", () => {
    const md = buildInterviewReportMarkdown({ improvements: ["Review the saved transcript."] });
    expect(md).toContain("# Interview Report");
    expect(md).toContain("_No scores returned._");
    expect(md).toContain("_None reported._");
    expect(md).toContain("- Review the saved transcript.");
    expect(md).not.toContain("## Verdict");
    expect(md).not.toContain("## Hiring-manager view");
  });

  it("coerces numeric-string scores from the model", () => {
    const md = buildInterviewReportMarkdown({ scores: { communication: "85" } });
    expect(md).toContain("| communication | 85/100 |");
  });
});

describe("buildCoachingReportMarkdown", () => {
  it("includes overall score and summary", () => {
    const md = buildCoachingReportMarkdown(practiceResult);
    expect(md).toContain("**Overall score:** 80/100");
    expect(md).toContain("Clear answer with room for sharper numbers.");
    expect(md).toContain("**Scenario:** behavioral interview · realistic");
  });

  it("renders dimension scores and presence rows", () => {
    const md = buildCoachingReportMarkdown(practiceResult);
    expect(md).toContain("| Content | 8/10 |");
    expect(md).toContain("| Delivery | 7/10 |");
    expect(md).toContain("| Eye contact | 92% |");
    expect(md).toContain("| Posture | 88% |");
  });

  it("lists content and delivery strengths/improvements from JSON", () => {
    const md = buildCoachingReportMarkdown(practiceResult);
    expect(md).toContain("## Content feedback");
    expect(md).toContain("- Concrete caching example.");
    expect(md).toContain("- Quantify the team impact.");
    expect(md).toContain("## Delivery feedback");
    expect(md).toContain("- Steady pace.");
    expect(md).toContain("- Reduce filler before the result.");
  });

  it("includes evidence, stronger answer, and next drill", () => {
    const md = buildCoachingReportMarkdown(practiceResult);
    expect(md).toContain("> we cut latency 40%");
    expect(md).toContain("> — Quantified outcome landed well.");
    expect(md).toContain("I led the cache rollout and cut p95 latency from 900ms to 540ms.");
    expect(md).toContain("## Next drill");
  });

  it("tolerates an empty result object", () => {
    const md = buildCoachingReportMarkdown({});
    expect(md).toContain("# Coaching Practice Report");
    expect(md).not.toContain("**Overall score:**");
    expect(md).not.toContain("## Scores");
  });
});

describe("buildPreparePackMarkdown", () => {
  it("includes company and match percentage from JSON", () => {
    const md = buildPreparePackMarkdown(preparePack);
    expect(md).toContain("**Company:** Google");
    expect(md).toContain("**Workflow:** wf-123");
    expect(md).toContain("**Match:** 78%");
    expect(md).toContain("Strong backend overlap; infra evidence is thin.");
  });

  it("lists matched strengths, gaps, and resume weaknesses", () => {
    const md = buildPreparePackMarkdown(preparePack);
    expect(md).toContain("- Python");
    expect(md).toContain("- FastAPI");
    expect(md).toContain("- Kubernetes");
    expect(md).toContain("- No quantified metrics on page one.");
  });

  it("lists every question with tests and difficulty", () => {
    const md = buildPreparePackMarkdown(preparePack);
    expect(md).toContain("## Questions (2)");
    expect(md).toContain("1. Tell me about a difficult project. — ownership · difficulty 4/5");
    expect(md).toContain("   - Hint: Use STAR.");
    expect(md).toContain("   - Follow-up: What would you do differently?");
    expect(md).toContain("2. How would you scale this API? — system design · difficulty 5/5");
  });

  it("prefers explicit company meta over pack fields", () => {
    const md = buildPreparePackMarkdown(preparePack, { company: "Stripe" });
    expect(md).toContain("**Company:** Stripe");
  });

  it("tolerates an empty pack without throwing", () => {
    const md = buildPreparePackMarkdown(null);
    expect(md).toContain("# Prepare Pack Summary");
    expect(md).not.toContain("## Questions");
    expect(md).not.toContain("**Match:**");
  });
});
