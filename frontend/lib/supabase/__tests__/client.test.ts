import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("supabase/client guards", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("isSupabaseConfigured is false when env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const mod = await import("../client");
    expect(mod.isSupabaseConfigured).toBe(false);
  });

  it("isSupabaseConfigured is true when both env vars are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const mod = await import("../client");
    expect(mod.isSupabaseConfigured).toBe(true);
  });

  it("restoreSessionFromCookie early-returns null without fetching when unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const mod = await import("../client");
    await expect(mod.restoreSessionFromCookie()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("getSupabase throws a configuration error when unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const mod = await import("../client");
    expect(() => mod.getSupabase()).toThrow(/not configured/i);
  });

  it("restoreSessionFromCookie returns null when the cookie endpoint is not ok", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    const mod = await import("../client");
    await expect(mod.restoreSessionFromCookie()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", {
      credentials: "include",
    });
  });

  it("restoreSessionFromCookie returns null when the cookie endpoint has no session", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ session: null }),
    });

    const mod = await import("../client");
    await expect(mod.restoreSessionFromCookie()).resolves.toBeNull();
  });

  it("restoreSessionFromCookie returns null when fetch throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    fetchMock.mockRejectedValue(new Error("offline"));

    const mod = await import("../client");
    await expect(mod.restoreSessionFromCookie()).resolves.toBeNull();
  });
});
