/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    // Tightened CSP: no blanket https: / unsafe-eval. External origins are
    // explicit (Supabase, Render API, MediaPipe CDN). Inline scripts remain
    // for Next.js hydration + the theme/service-worker bootstraps.
    const scriptSrc = [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      "https://cdn.jsdelivr.net",
    ].join(" ");

    const connectSrc = [
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://*.onrender.com",
      "wss://*.onrender.com",
      ...(process.env.NEXT_PUBLIC_API_URL
        ? [new URL(process.env.NEXT_PUBLIC_API_URL).origin]
        : []),
      ...(process.env.NODE_ENV !== "production"
        ? ["http://localhost:8000", "ws://localhost:8000"]
        : []),
    ].join(" ");

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "worker-src 'self' blob:",
      "child-src blob:",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Content-Security-Policy", value: csp },
      ],
    }];
  },
};

export default nextConfig;
