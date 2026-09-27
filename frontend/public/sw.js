const CACHE = "hustlrzz-v3";
const SHELL = ["/", "/prepare", "/interview", "/dashboard", "/manifest.json"];

/**
 * Files that crawlers and agents read directly. The worker must never claim
 * these: answering a robots.txt request from cache — or with a synthetic
 * offline 503 — makes the file unreadable to crawlers, which costs search and
 * agentic-browsing scores on every page that installs this worker.
 */
const NETWORK_ONLY = ["/robots.txt", "/llms.txt", "/sitemap.xml", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

/**
 * Offline fallback. A navigation gets a real document, because "Offline" as
 * plain text is a dead end: no styling, no navigation, no way back. A cached
 * response is preferred when one exists, so the precached routes still render
 * their own offline-aware pages. Everything is inline because there is no
 * network to fetch an asset from.
 */
const OFFLINE_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Offline — Hustlrzz</title>
<style>
  :root{color-scheme:light dark;--bg:#ffffff;--fg:#0a0a0a;--muted:#6b6b6b;--line:rgba(10,10,10,.12);--primary:hsl(217 70% 45%)}
  @media (prefers-color-scheme:dark){:root{--bg:#09090b;--fg:#f5f5f5;--muted:#a1a1a1;--line:rgba(245,245,245,.14);--primary:hsl(213 70% 60%)}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--fg);font:400 16px/1.5 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif}
  main{max-width:42ch;text-align:center}
  .mark{margin:0 0 28px;font-weight:700;letter-spacing:-.01em}
  h1{margin:0 0 12px;font-size:clamp(28px,7vw,40px);line-height:1.05;letter-spacing:-.02em;font-weight:600}
  p{margin:0 0 28px;color:var(--muted);font-size:15px}
  a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 22px;border-radius:999px;background:var(--primary);color:var(--bg);font-size:14px;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<main>
  <p class="mark">Hustlrzz</p>
  <h1>You are offline</h1>
  <p>This page needs a connection. The homepage and your preparation pack are still available.</p>
  <a href="/">Back to Hustlrzz</a>
</main>
</body>
</html>`;

function offline(request) {
  if (request.mode === "navigate") {
    return new Response(OFFLINE_DOCUMENT, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || offline(request);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offline(request);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (NETWORK_ONLY.includes(url.pathname)) return;
  if (url.pathname.includes("/auth/") || url.pathname.includes("/api/")) return;

  const isRsc = request.headers.has("rsc") || url.searchParams.has("_rsc");
  const isNavigation = request.mode === "navigate";
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/icon") ||
    /\.(?:css|js|woff2?|svg|png|jpe?g|webp|avif|ico)$/.test(url.pathname);

  // Claim only what this worker actually serves. Everything else goes straight
  // to the network untouched rather than through an offline fallback.
  if (!isNavigation && !isRsc && !isStaticAsset) return;

  event.respondWith(isNavigation || isRsc ? networkFirst(request) : cacheFirst(request));
});
