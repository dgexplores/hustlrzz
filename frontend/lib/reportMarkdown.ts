export interface ReportMeta {
  title?: string;
  date?: string;
  company?: string;
}

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body}`;
}

function bulletList(items: string[]): string {
  if (!items.length) return "_None reported._";
  return items.map((item) => `- ${item}`).join("\n");
}

function cell(label: string): string {
  return label.replace(/\|/g, "\\|");
}

function finish(lines: string[]): string {
  return `${lines.join("\n").trimEnd()}\n`;
}

export function buildInterviewReportMarkdown(report: unknown, meta?: ReportMeta): string {
  const data = asDict(report);
  const lines: string[] = [];

  lines.push(`# ${meta?.title?.trim() || "Interview Report"}`);
  lines.push("");
  if (meta?.date) {
    lines.push(`**Date:** ${meta.date}`);
    lines.push("");
  }

  const verdict = asString(data.verdict);
  if (verdict) {
    lines.push(section("Verdict", verdict), "");
  }

  const summary = asString(data.summary);
  if (summary) {
    lines.push(section("Summary", summary), "");
  }

  const scoreEntries = Object.entries(asDict(data.scores)).filter(([, value]) => asNumber(value) !== null);
  if (scoreEntries.length) {
    const rows = [
      "| Area | Score |",
      "| --- | --- |",
      ...scoreEntries.map(([label, value]) => `| ${cell(label)} | ${asNumber(value)}/100 |`),
    ];
    lines.push(section("Scores", rows.join("\n")), "");
  } else {
    lines.push(section("Scores", "_No scores returned._"), "");
  }

  lines.push(section("Strengths", bulletList(asStringList(data.strengths))), "");
  lines.push(section("Improvements", bulletList(asStringList(data.improvements))), "");

  const hiring = asDict(data.hiring_manager);
  const hiringRows: string[] = [];
  const decision = asString(hiring.decision);
  if (decision) hiringRows.push(`- **Decision:** ${decision}`);
  const confidence = asString(hiring.confidence);
  if (confidence) hiringRows.push(`- **Confidence:** ${confidence}`);
  const risk = asString(hiring.risk);
  if (risk) hiringRows.push(`- **Risk if hired:** ${risk}`);
  const barRaiser = asString(hiring.bar_raiser_notes);
  if (barRaiser) hiringRows.push(`- **Bar-raiser:** ${barRaiser}`);
  if (hiringRows.length) {
    lines.push(section("Hiring-manager view", hiringRows.join("\n")), "");
  }

  const deliveryNotes = asStringList(data.delivery_notes);
  if (deliveryNotes.length) {
    lines.push(section("Delivery notes", bulletList(deliveryNotes)), "");
  }

  const starExample = asString(data.star_example);
  if (starExample) {
    lines.push(section("Strongest STAR moment", starExample), "");
  }

  const nextDrill = asString(data.next_drill);
  if (nextDrill) {
    lines.push(section("Next drill", nextDrill), "");
  }

  return finish(lines);
}

export function buildCoachingReportMarkdown(result: unknown, meta?: ReportMeta): string {
  const data = asDict(result);
  const lines: string[] = [];

  lines.push(`# ${meta?.title?.trim() || "Coaching Practice Report"}`);
  lines.push("");

  const overall = asNumber(data.overall_score);
  if (overall !== null) {
    lines.push(`**Overall score:** ${overall}/100`, "");
  }

  const scenario = asString(data.scenario);
  const difficulty = asString(data.difficulty);
  const context = [scenario, difficulty].filter(Boolean).join(" · ");
  if (context) {
    lines.push(`**Scenario:** ${context}`, "");
  }

  const summary = asString(data.summary);
  if (summary) {
    lines.push(section("Summary", summary), "");
  }

  const content = asDict(data.content);
  const delivery = asDict(data.delivery);
  const presence = asDict(data.presence);
  const scoreRows: string[] = ["| Dimension | Score |", "| --- | --- |"];
  const contentScore = asNumber(content.score);
  if (contentScore !== null) scoreRows.push(`| Content | ${contentScore}/10 |`);
  const deliveryScore = asNumber(delivery.score);
  if (deliveryScore !== null) scoreRows.push(`| Delivery | ${deliveryScore}/10 |`);
  const eyeContact = asNumber(presence.eyeContactConsistency);
  if (eyeContact !== null) scoreRows.push(`| Eye contact | ${eyeContact}% |`);
  const posture = asNumber(presence.postureStability);
  if (posture !== null) scoreRows.push(`| Posture | ${posture}% |`);
  if (scoreRows.length > 2) {
    lines.push(section("Scores", scoreRows.join("\n")), "");
  }

  const topStrengths = asStringList(data.strengths);
  if (topStrengths.length) {
    lines.push(section("Strengths", bulletList(topStrengths)), "");
  }
  const topImprovements = asStringList(data.improvements);
  if (topImprovements.length) {
    lines.push(section("Improvements", bulletList(topImprovements)), "");
  }

  for (const [label, raw] of [["Content", content], ["Delivery", delivery]] as const) {
    const strengths = asStringList(raw.strengths);
    const improvements = asStringList(raw.improvements);
    if (!strengths.length && !improvements.length) continue;
    const parts: string[] = [];
    if (strengths.length) parts.push(`### Strengths\n\n${bulletList(strengths)}`);
    if (improvements.length) parts.push(`### Improvements\n\n${bulletList(improvements)}`);
    lines.push(section(`${label} feedback`, parts.join("\n\n")), "");
  }

  const evidence = Array.isArray(data.transcript_evidence) ? data.transcript_evidence : [];
  const evidenceBlocks = evidence
    .map((entry) => {
      const item = asDict(entry);
      const quote = asString(item.quote);
      const insight = asString(item.insight);
      const parts: string[] = [];
      if (quote) parts.push(`> ${quote}`);
      if (insight) parts.push(`>\n> — ${insight}`);
      return parts.join("\n");
    })
    .filter(Boolean);
  if (evidenceBlocks.length) {
    lines.push(section("Feedback grounded in your words", evidenceBlocks.join("\n\n")), "");
  }

  const betterAnswer = asString(data.better_answer);
  if (betterAnswer) {
    lines.push(section("A stronger version", betterAnswer), "");
  }

  const nextDrill = asString(data.next_drill);
  if (nextDrill) {
    lines.push(section("Next drill", nextDrill), "");
  }

  return finish(lines);
}

export function buildPreparePackMarkdown(pack: unknown, meta?: ReportMeta): string {
  const data = asDict(pack);
  const lines: string[] = [];

  lines.push(`# ${meta?.title?.trim() || "Prepare Pack Summary"}`);
  lines.push("");

  const research = asDict(data.company_research);
  const intelligence = asDict(data.company_intelligence);
  const company =
    asString(meta?.company) || asString(data.company) || asString(research.company) || asString(intelligence.company);
  if (company) {
    lines.push(`**Company:** ${company}`, "");
  }
  const workflowId = asString(data.workflow_id);
  if (workflowId) {
    lines.push(`**Workflow:** ${workflowId}`, "");
  }

  const match = asDict(data.company_match);
  const matchPercent = asNumber(match.overall_match_percent);
  const matchSummary = asString(match.summary);
  const matchLines: string[] = [];
  if (matchPercent !== null) matchLines.push(`**Match:** ${matchPercent}%`);
  if (matchSummary) matchLines.push(matchSummary);
  if (matchLines.length) {
    lines.push(section("Role match", matchLines.join("\n\n")), "");
  }
  const matchedSkills = asStringList(match.matched_skills);
  if (matchedSkills.length) {
    lines.push(section("Matched strengths", bulletList(matchedSkills)), "");
  }
  const gapSkills = asStringList(match.gap_skills);
  if (gapSkills.length) {
    lines.push(section("Gaps", bulletList(gapSkills)), "");
  }
  const resumeWeaknesses = asStringList(match.resume_weaknesses);
  if (resumeWeaknesses.length) {
    lines.push(section("Resume weaknesses", bulletList(resumeWeaknesses)), "");
  }

  const questions = Array.isArray(data.questions) ? data.questions : [];
  if (questions.length) {
    const rows = questions.map((raw, index) => {
      const question = asDict(raw);
      const text = asString(question.question) || "(untitled question)";
      const bits: string[] = [];
      const tests = asString(question.tests);
      if (tests) bits.push(tests);
      const difficulty = asNumber(question.difficulty);
      if (difficulty !== null) bits.push(`difficulty ${difficulty}/5`);
      let block = `${index + 1}. ${text}${bits.length ? ` — ${bits.join(" · ")}` : ""}`;
      const hint = asString(question.answer_hint);
      if (hint) block += `\n   - Hint: ${hint}`;
      const followUp = asString(question.follow_up);
      if (followUp) block += `\n   - Follow-up: ${followUp}`;
      return block;
    });
    lines.push(section(`Questions (${questions.length})`, rows.join("\n")), "");
  }

  return finish(lines);
}
