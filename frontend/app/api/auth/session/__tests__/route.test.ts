import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshSession = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { refreshSession } }),
}));

import { GET } from "../route";

const COOKIE = "hustlrzz_rt";

function request(cookie?: string) {
  return new Request("https://hustlrzz.vercel.app/api/auth/session", {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    refreshSession.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
  });

  it("answers 200 with a null session when the visitor has no refresh cookie", async () => {
    const res = await GET(request());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ session: null });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("answers 200 with a null session when the refresh token is rejected", async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "invalid" } });

    const res = await GET(request(`${COOKIE}=stale-token`));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ session: null });
  });

  it("clears the refresh cookie when the token is rejected", async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "invalid" } });

    const res = await GET(request(`${COOKIE}=stale-token`));

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE}=;`);
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it("still reports 503 when Supabase is not configured, so misconfiguration is not masked", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const res = await GET(request());

    expect(res.status).toBe(503);
  });

  it("returns the session and rotates the cookie when the refresh succeeds", async () => {
    const session = { access_token: "access-1", refresh_token: "refresh-2" };
    refreshSession.mockResolvedValue({ data: { session }, error: null });

    const res = await GET(request(`${COOKIE}=refresh-1`));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ session });
    expect(res.cookies.get(COOKIE)?.value).toBe("refresh-2");
  });
});
