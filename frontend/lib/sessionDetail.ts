import type { ReportMeta } from "./reportMarkdown";

export interface SessionDetailLike {
  session_id?: string | null;
  created_at?: string | null;
  report?: unknown;
}

/** Report meta for the T3 Markdown builder — date only, builder keeps its default title. */
export function sessionDetailMeta(session: SessionDetailLike | null | undefined): ReportMeta {
  const createdAt = session?.created_at;
  if (!createdAt) return {};
  if (Number.isNaN(new Date(createdAt).getTime())) return {};
  return { date: createdAt };
}

/** Stable export filename base shared by JSON + MD downloads. */
export function sessionExportBase(sessionId: string): string {
  const short = (sessionId || "").slice(0, 8);
  return `hustlrzz-session-${short || "export"}`;
}

/** A report counts as complete when it is a non-empty object. */
export function isCompleteReport(report: unknown): boolean {
  return (
    !!report &&
    typeof report === "object" &&
    !Array.isArray(report) &&
    Object.keys(report as object).length > 0
  );
}
