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

/** Turn raw FastAPI/Pydantic validation strings into human guidance. */
function humanizeDetail(raw: string): string {
  const msg = raw.replace(/^Value error,\s*/i, "").trim();
  const atLeast = msg.match(/at least (\d+) (?:characters|items)/i);
  if (atLeast) return `Please add more detail — at least ${atLeast[1]} characters are needed.`;
  if (/at most|too long/i.test(msg)) return "That input is too long. Please shorten it.";
  if (/ensure this value has at least/i.test(msg)) return "Please add more detail before continuing.";
  if (/not a valid|could not be parsed/i.test(msg)) return "That value could not be read. Please check the format.";
  if (/required field/i.test(msg)) return "A required field is missing.";
  return msg.charAt(0).toUpperCase() + msg.slice(1);
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
  if (res.status === 401) {
    throw new ApiError(401, "Your session expired. Sign in again to continue.");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
        message = humanizeDetail(String(body.detail[0].msg));
      } else if (body?.detail) {
        message = typeof body.detail === "string" ? humanizeDetail(body.detail) : String(body.detail);
      }
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
