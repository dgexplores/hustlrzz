import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Refresh token lives only in this httpOnly cookie — never in JS-readable storage. */
const COOKIE_NAME = "hustlrzz_rt";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches Supabase refresh window

function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function sessionCookie(res: NextResponse, refreshToken: string | null) {
  if (refreshToken === null) {
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
  res.cookies.set(COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

function readRefreshToken(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * GET: exchange the httpOnly refresh cookie for a fresh session (memory-bound
 * on the client). Rotates the cookie on success; clears it on failure.
 */
export async function GET(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ session: null }, { status: 503 });
  }
  const refreshToken = readRefreshToken(req);
  if (!refreshToken) {
    return NextResponse.json({ session: null }, { status: 401 });
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    return sessionCookie(NextResponse.json({ session: null }, { status: 401 }), null);
  }
  const res = NextResponse.json({ session: data.session });
  return sessionCookie(res, data.session.refresh_token);
}

/** POST: persist the rotating refresh token into the httpOnly cookie. */
export async function POST(req: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  let body: { refresh_token?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  if (!body.refresh_token) {
    return NextResponse.json({ error: "refresh_token required" }, { status: 400 });
  }
  return sessionCookie(NextResponse.json({ ok: true }), body.refresh_token);
}

/** DELETE: clear the auth cookie on sign-out. */
export async function DELETE() {
  return sessionCookie(NextResponse.json({ ok: true }), null);
}
