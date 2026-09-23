import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../supabase/client", () => ({
  getSupabase: () => ({ auth: { getSession } }),
}));

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("api()", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    getSession.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function signIn() {
    getSession.mockResolvedValue({
      data: { session: { access_token: "tok-123" } },
    });
  }

  it("throws ApiError 401 without a session and never calls fetch", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(api("/workflows")).rejects.toMatchObject({
      status: 401,
      message: "Not authenticated",
    });
    expect(ApiError).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends Authorization and JSON Content-Type headers", async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: [] }));

    await api("/workflows", { method: "POST", body: JSON.stringify({ a: 1 }) });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/workflows");
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer tok-123");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("maps HTTP 401 to the session-expired message", async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({}, 401));

    await expect(api("/workflows")).rejects.toMatchObject({
      status: 401,
      message: "Your session expired. Sign in again to continue.",
    });
  });

  it("humanizes 'at least N characters' validation detail", async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { detail: "Value error, Input should have at least 10 characters" },
        422
      )
    );

    await expect(api("/feedback")).rejects.toMatchObject({
      status: 422,
      message: "Please add more detail — at least 10 characters are needed.",
    });
  });

  it("humanizes FastAPI array detail (first item)", async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { detail: [{ msg: "Value error, Input should have at least 5 items" }] },
        422
      )
    );

    await expect(api("/feedback")).rejects.toMatchObject({
      status: 422,
      message: "Please add more detail — at least 5 characters are needed.",
    });
  });

  it("humanizes 'at most / too long' detail", async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { detail: "String should have at most 100 characters" },
        422
      )
    );

    await expect(api("/feedback")).rejects.toMatchObject({
      message: "That input is too long. Please shorten it.",
    });
  });

  it("humanizes 'not a valid' detail", async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Value: not a valid uuid" }, 422)
    );

    await expect(api("/x")).rejects.toMatchObject({
      message: "That value could not be read. Please check the format.",
    });
  });

  it("humanizes 'required field' detail", async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "A required field is missing." }, 422)
    );

    await expect(api("/x")).rejects.toMatchObject({
      message: "A required field is missing.",
    });
  });

  it("capitalizes unknown detail strings", async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "database is unavailable" }, 503)
    );

    await expect(api("/x")).rejects.toMatchObject({
      status: 503,
      message: "Database is unavailable",
    });
  });

  it("falls back to Request failed (status) on non-JSON errors", async () => {
    signIn();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(api("/x")).rejects.toMatchObject({
      status: 500,
      message: "Request failed (500)",
    });
  });

  it("returns the parsed JSON body on success", async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [{ id: "w1" }] })
    );

    const result = await api<{ success: boolean; data: { id: string }[] }>(
      "/workflows"
    );
    expect(result.data[0].id).toBe("w1");
  });
});
