import { describe, expect, it } from "vitest";
import { buildInterviewReportMarkdown } from "../reportMarkdown";
import { isCompleteReport, sessionDetailMeta, sessionExportBase } from "../sessionDetail";

describe("sessionDetailMeta", () => {
  it("returns the created_at date when parseable", () => {
    const meta = sessionDetailMeta({ created_at: "2026-09-23T12:00:00+00:00" });
    expect(meta.date).toBe("2026-09-23T12:00:00+00:00");
    expect(meta.title).toBeUndefined();
  });

  it("returns empty meta for missing or invalid dates", () => {
    expect(sessionDetailMeta(null)).toEqual({});
    expect(sessionDetailMeta(undefined)).toEqual({});
    expect(sessionDetailMeta({})).toEqual({});
    expect(sessionDetailMeta({ created_at: "not-a-date" })).toEqual({});
  });

  it("feeds the T3 markdown builder a Date line", () => {
    const md = buildInterviewReportMarkdown(
      { scores: { communication: 85 } },
      sessionDetailMeta({ created_at: "2026-09-23T12:00:00+00:00" }),
    );
    expect(md).toContain("**Date:** 2026-09-23T12:00:00+00:00");
    expect(md).toContain("# Interview Report");
  });
});

describe("sessionExportBase", () => {
  it("truncates the session id to 8 chars with the shared prefix", () => {
    expect(sessionExportBase("sess-abcdef12-xyz")).toBe("hustlrzz-session-sess-abc");
    expect(sessionExportBase("12345678-abcd")).toBe("hustlrzz-session-12345678");
  });

  it("falls back safely for empty ids", () => {
    expect(sessionExportBase("")).toBe("hustlrzz-session-export");
    expect(sessionExportBase("abc")).toBe("hustlrzz-session-abc");
  });
});

describe("isCompleteReport", () => {
  it("accepts a non-empty report object", () => {
    expect(isCompleteReport({ summary: "ok" })).toBe(true);
    expect(isCompleteReport({ scores: {} })).toBe(true);
  });

  it("rejects missing, empty, and non-object reports", () => {
    expect(isCompleteReport(null)).toBe(false);
    expect(isCompleteReport(undefined)).toBe(false);
    expect(isCompleteReport({})).toBe(false);
    expect(isCompleteReport([])).toBe(false);
    expect(isCompleteReport("report")).toBe(false);
  });
});
