import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { buildEventPayload, trackEvent, type ProductEventName } from "../analytics";

vi.mock("../api", () => ({ api: vi.fn().mockResolvedValue(undefined) }));

const ALLOWED: ProductEventName[] = [
  "prepare_started",
  "prepare_completed",
  "interview_completed",
  "feedback_submitted",
];

describe("buildEventPayload", () => {
  it("emits only event_name for every allowlisted event", () => {
    for (const name of ALLOWED) {
      const payload = buildEventPayload(name);
      expect(Object.keys(payload)).toEqual(["event_name"]);
      expect(payload.event_name).toBe(name);
    }
  });

  it("omits empty props entirely", () => {
    expect(buildEventPayload("prepare_started", {})).toEqual({ event_name: "prepare_started" });
  });

  it("keeps props to non-string primitives only", () => {
    const payload = buildEventPayload("interview_completed", { duration_seconds: 42, audio: false });
    expect(payload.props).toEqual({ duration_seconds: 42, audio: false });
    expect(
      Object.values(payload.props ?? {}).every((value) => typeof value !== "string")
    ).toBe(true);
  });
});

describe("trackEvent", () => {
  beforeEach(() => {
    vi.mocked(api).mockClear();
    vi.mocked(api).mockResolvedValue(undefined);
  });

  it("POSTs the payload to /analytics/events", async () => {
    trackEvent("prepare_started");

    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const [path, init] = vi.mocked(api).mock.calls[0];
    expect(path).toBe("/analytics/events");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(Object.keys(body)).toEqual(["event_name"]);
    expect(body.event_name).toBe("prepare_started");
  });

  it("swallows failures so analytics never blocks the UX", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("offline"));

    expect(() => trackEvent("feedback_submitted")).not.toThrow();
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  });
});
