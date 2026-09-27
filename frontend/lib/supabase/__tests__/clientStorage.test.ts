import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Google OAuth sends the browser away to accounts.google.com and back to
 * /auth/callback. That is a full page unload in between, so anything the
 * PKCE exchange needs must live outside the JS heap — or the code verifier is
 * gone by the time the callback runs and sign-in silently fails.
 *
 * The access/refresh tokens must NOT be persisted, so the adapter splits the
 * two: verifiers go to a tab-scoped store, the session stays in memory.
 */
describe("supabase client storage split", () => {
  const fetchMock = vi.fn();
  const store = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      get size() {
        return map.size;
      },
      keys: () => [...map.keys()],
    };
  };

  let sessionStorageMock: ReturnType<typeof store>;
  let localStorageMock: ReturnType<typeof store>;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    sessionStorageMock = store();
    localStorageMock = store();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("sessionStorage", sessionStorageMock);
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps a PKCE code verifier readable after the page is reloaded", async () => {
    const first = await import("../client");
    const adapter = first.createAuthStorage();

    const verifierKey = "sb-example-auth-token-flow-abc-code-verifier";
    adapter.setItem(verifierKey, "the-verifier");

    // A fresh module registry is what a real redirect to /auth/callback gives us.
    vi.resetModules();
    const second = await import("../client");
    expect(second.createAuthStorage().getItem(verifierKey)).toBe("the-verifier");
  });

  it("also keeps the pending-flow index readable across the redirect", async () => {
    const first = await import("../client");
    first.createAuthStorage().setItem("sb-example-auth-token-flows-code-verifier", '["abc"]');

    vi.resetModules();
    const second = await import("../client");
    expect(second.createAuthStorage().getItem("sb-example-auth-token-flows-code-verifier")).toBe('["abc"]');
  });

  it("never writes the session or its tokens to browser storage", async () => {
    const { createAuthStorage } = await import("../client");
    const adapter = createAuthStorage();

    adapter.setItem("sb-example-auth-token", '{"access_token":"secret","refresh_token":"secret"}');
    adapter.setItem("sb-example-auth-token-user", '{"id":"u1"}');

    expect(localStorageMock.keys()).toEqual([]);
    expect(sessionStorageMock.keys()).toEqual([]);
  });

  it("keeps the session readable for the live client, then forgets it on reload", async () => {
    const { createAuthStorage } = await import("../client");
    const adapter = createAuthStorage();
    adapter.setItem("sb-example-auth-token", '{"access_token":"secret"}');

    expect(adapter.getItem("sb-example-auth-token")).toBe('{"access_token":"secret"}');

    vi.resetModules();
    const second = await import("../client");
    expect(second.createAuthStorage().getItem("sb-example-auth-token")).toBeNull();
  });

  it("removes a verifier from browser storage when the flow completes", async () => {
    const { createAuthStorage } = await import("../client");
    const key = "sb-example-auth-token-flow-abc-code-verifier";
    createAuthStorage().setItem(key, "the-verifier");

    createAuthStorage().removeItem(key);
    expect(sessionStorageMock.getItem(key)).toBeNull();
  });

  it("survives a blocked sessionStorage without throwing", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });

    const { createAuthStorage } = await import("../client");
    const adapter = createAuthStorage();
    expect(() => adapter.setItem("sb-x-flow-abc-code-verifier", "v")).not.toThrow();
    expect(adapter.getItem("sb-x-auth-token")).toBeNull();
  });

  it("hands the auth client a storage adapter so the verifier can be found after a reload", async () => {
    const mod = await import("../client");
    const auth = (mod.getSupabase() as unknown as { auth: { persistSession: boolean; storage: { getItem(k: string): string | null } } }).auth;

    // persistSession must stay true so auth-js reads the adapter on init and
    // can find the PKCE verifier left behind by the pre-redirect page load.
    expect(auth.persistSession).toBe(true);
    expect(typeof auth.storage.getItem).toBe("function");
  });
});
