// Generated into dist/sw.js at build time. Precaches the app shell so the app opens offline.
// ignoreVary: the server sends "Vary: Origin", and module scripts are requested with an Origin
// header the precache request did not have, so without it nothing matched offline.
// The model files are cached separately by Transformers.js (Cache Storage "transformers-cache").
// ORT asyncify.wasm is fetched by the worker from jsDelivr (too big for Pages) into
// Cache Storage "chonji-ort-engine" — this SW must NOT intercept jsDelivr / cross-origin.
// Updates: a new SW stays waiting until the page posts SKIP_WAITING (user taps Refresh), then
// skipWaiting + clients.claim. The page reloads only after that user action — never on its own.
const CACHE = "chonji-shell-__VERSION__";
const FILES = __FILES__;

self.addEventListener("install", (event) => {
  // Precache the new shell, but do NOT skipWaiting — leave the old SW in control until Refresh.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("chonji-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Cross-origin (Hugging Face model, jsDelivr ORT wasm): never intercept — leave to the page/worker.
  if (url.origin !== self.location.origin) return;

  // Never precache-serve the service worker itself — always hit the network so updates land.
  if (url.pathname === "/sw.js") {
    event.respondWith(fetch(req));
    return;
  }

  if (req.mode === "navigate") {
    // Network-first for the document so a new deploy is seen when online; fall back to the shell offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match("/index.html", { ignoreSearch: true, ignoreVary: true })
            .then((r) => r || caches.match("/", { ignoreSearch: true, ignoreVary: true })),
        ),
    );
    return;
  }

  // App-shell assets: cache-first (hashed filenames). Transformers / ORT engine caches are untouched.
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })),
  );
});
