import { createClient, type Session } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let client: ReturnType<typeof createClient> | null = null;
let cookieSyncStarted = false;

export const isSupabaseConfigured = Boolean(url && anon);

/**
 * PKCE leaves a `code_verifier` behind before the browser is sent to the
 * identity provider, and needs it again on the way back. That round trip is a
 * full page unload, so a verifier kept only in the JS heap is gone by the time
 * `/auth/callback` runs — the exchange then never happens and sign-in fails
 * with a misleading "check your provider configuration" message.
 *
 * The verifier is a single-use nonce, not a credential, so it is allowed in a
 * tab-scoped store that dies with the tab. Session and user keys stay in
 * memory, so access and refresh tokens never touch browser storage; reload
 * restore continues to go through the httpOnly cookie.
 */
const PKCE_KEY = /-code-verifier$/;

export function createAuthStorage() {
  const memory: Record<string, string> = {};
  let tab: Storage | null = null;
  try {
    tab = window.sessionStorage;
  } catch {
    tab = null;
  }

  const safe = <T,>(fn: () => T, fallback: T): T => {
    if (!tab) return fallback;
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  return {
    getItem(key: string) {
      if (PKCE_KEY.test(key)) return safe(() => tab!.getItem(key), null);
      return memory[key] ?? null;
    },
    setItem(key: string, value: string) {
      if (PKCE_KEY.test(key)) {
        safe(() => tab!.setItem(key, value), undefined);
        return;
      }
      memory[key] = value;
    },
    removeItem(key: string) {
      if (PKCE_KEY.test(key)) {
        safe(() => tab!.removeItem(key), undefined);
        return;
      }
      delete memory[key];
    },
  };
}

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
        // The split adapter keeps tokens in memory and the PKCE verifier in
        // sessionStorage, so persistSession must be true: it is what makes
        // auth-js read the adapter on init and find the verifier that the
        // pre-redirect page load left behind. Nothing else is read — the
        // session key is memory-only and always empty on a fresh page load.
        // Cross-load restore comes from the httpOnly refresh cookie (AuthGate).
        persistSession: true,
        storage: createAuthStorage(),
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
