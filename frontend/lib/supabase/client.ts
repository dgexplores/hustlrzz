import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let client: ReturnType<typeof createClient> | null = null;

export const isSupabaseConfigured = Boolean(url && anon);

export function getSupabase() {
  if (!client) {
    if (!url || !anon) {
      throw new Error(
        "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
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
