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

async function offline() {
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
    return (await caches.match(request)) || offline();
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
    return offline();
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
