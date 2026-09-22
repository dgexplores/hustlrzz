import { createClient, type Session } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let client: ReturnType<typeof createClient> | null = null;
let cookieSyncStarted = false;

export const isSupabaseConfigured = Boolean(url && anon);

/** Legacy installs persisted the session under sb-*-auth-token in localStorage. */
function purgeLegacyLocalStorageSessions() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* storage may be blocked */
  }
}

/**
 * Mirror the rotating refresh token into an httpOnly cookie so a reload can
 * restore a session without any token living in localStorage/DOM storage.
 * Access tokens stay in the in-memory supabase client only.
 */
function startSessionCookieSync(supabase: ReturnType<typeof createClient>) {
  if (cookieSyncStarted || typeof window === "undefined") return;
  cookieSyncStarted = true;
  purgeLegacyLocalStorageSessions();

  const post = (session: Session) => {
    void fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }).catch(() => {
      /* offline: memory session still works until reload */
    });
  };

  supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
      post(session);
    } else if (event === "SIGNED_OUT") {
      void fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    }
  });
}

export function getSupabase() {
  if (!client) {
    if (!url || !anon) {
      throw new Error(
        "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    client = createClient(url, anon, {
      auth: {
        // Memory-only: never write tokens to localStorage/sessionStorage.
        // Cross-load restore comes from the httpOnly refresh cookie (AuthGate).
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
    startSessionCookieSync(client);
  }
  return client;
}

/**
 * Restore a session after a full page load from the httpOnly refresh cookie.
 * Returns the session (also set on the in-memory client) or null.
 */
export async function restoreSessionFromCookie(): Promise<Session | null> {
  if (!isSupabaseConfigured || typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    if (!res.ok) return null;
    const { session } = (await res.json()) as { session: Session | null };
    if (!session) return null;
    const { error } = await getSupabase().auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Wait for the session a redirect (OAuth or password-recovery) just produced.
 * The client is created with detectSessionInUrl: true, so it already
 * exchanges the ?code= PKCE param during its own initialization.
 * getSession() awaits that same initialization internally, so it is the
 * correct way to wait for the result. Calling exchangeCodeForSession
 * again here would try to reuse a PKCE verifier the automatic exchange
 * already consumed, and fail deterministically.
 */
export async function waitForRedirectSession() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}
