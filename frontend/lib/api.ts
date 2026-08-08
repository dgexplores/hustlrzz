import { getSupabase } from "./supabase/client";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

const WS_URL = API_URL.replace(/^http/, "ws");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new ApiError(401, "Not authenticated");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const auth = await authHeaders();
  Object.entries(auth).forEach(([k, v]) => headers.set(k, v));
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) message = String(body.detail);
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export function wsUrl(
  path: string,
  params: Record<string, string> = {}
): string {
  const qs = new URLSearchParams(params).toString();
  return `${WS_URL}${path}${qs ? `?${qs}` : ""}`;
}

export { API_URL };