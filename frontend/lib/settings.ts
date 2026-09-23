export const MIN_PASSWORD_LENGTH = 6;

/** Pure client-side validation for the settings change-password form. */
export function validatePasswordChange(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return "Passwords do not match.";
  }
  return null;
}

export interface SignInUserLike {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}

export interface SignInMethod {
  id: string;
  label: string;
  detail: string;
}

function hasGoogleHint(user: SignInUserLike): boolean {
  const app = user.app_metadata ?? {};
  const meta = user.user_metadata ?? {};
  if (app.provider === "google") return true;
  const providers = Array.isArray(app.providers) ? app.providers : [];
  if (providers.includes("google")) return true;
  return Boolean(meta.avatar_url);
}

/** Read-only sign-in methods derived from Supabase user metadata. */
export function signInMethods(user: SignInUserLike | null | undefined): SignInMethod[] {
  if (!user) return [];
  const methods: SignInMethod[] = [];
  if (user.email) {
    methods.push({ id: "email", label: "Email", detail: user.email });
  }
  if (hasGoogleHint(user)) {
    methods.push({ id: "google", label: "Google", detail: "Connected" });
  }
  return methods;
}
