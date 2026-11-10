# Deploy Grading Buddy (Cloudflare Pages)

Static site. Build locally, then upload the `dist` folder. No secrets are required for the Pages deploy itself (the model downloads from Hugging Face in the browser; the ONNX Runtime wasm is fetched by the worker from jsDelivr on first visit and stored in Cache Storage).

## Why ORT wasm is not in `dist/`

Cloudflare Pages rejects any single file over **25 MiB**. The ORT build Transformers.js needs for WebGPU (`ort-wasm-simd-threaded.asyncify.wasm`) is about **25.6 MiB**, so it cannot be shipped as a Pages asset.

**Do not pre-gzip that file to squeeze under 25 MiB.** Pages ignores `Content-Encoding` from `_headers`, so a pre-gzipped `.wasm` is served as raw gzip bytes. Browsers then fail with:

`WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 1f 8b 08 08`

That was the live-site failure on https://grading-buddy.pages.dev.

**Chosen approach (cold path does not depend on the service worker):**

1. Ship the small `ort-wasm-simd-threaded.asyncify.mjs` under `/ort/` in `dist/` (same origin).
2. The worker fetches the matching `.wasm` from jsDelivr (exact `onnxruntime-web` version in `shared/ort.ts`), checks magic `00 61 73 6d`, stores it in Cache Storage `chonji-ort-engine`, and sets `env.backends.onnx.wasm.wasmBinary`.
3. The **service worker must not intercept jsDelivr** (or any cross-origin URL). iOS WebKit + SW + cross-origin fetch from a module worker is a suspected `Load failed` path; the worker talks to the CDN directly.

jsDelivr sends `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`, which works under our `COOP: same-origin` + `COEP: credentialless` headers.

The plain / jspi ORT wasm files are under 25 MiB but are not the WebGPU asyncify build Transformers.js 4.3.2 selects, so they are not a drop-in replacement.

## Build

```bash
npm ci
npm test
npm run typecheck
npm run build
```

`dist/` is a root-ready static site: `index.html`, hashed `/assets/*`, `/sw.js`, `/manifest.webmanifest`, icons, `/ort/*.mjs`, and Cloudflare `_headers`. The build **fails** if any emitted asset is over 25 MiB. The large asyncify `.wasm` must be absent.

Confirm after build:

```bash
find dist -type f -printf '%s %p\n' | sort -n | tail
# No file should be >= 26214400 bytes. The asyncify .wasm must be absent.
```

## Deploy

```bash
npx wrangler pages deploy dist --project-name grading-buddy-lfm3-demo
```

First time: log in with `npx wrangler login` and create the `grading-buddy-lfm3-demo` Pages project if it does not exist yet. **Do not** deploy to the v1 project name `grading-buddy`.

After deploy, open the Pages URL over **https://**, confirm Install app / Add to Home Screen, then check DevTools → Application → Manifest and Service workers. First load needs network for jsDelivr (ORT wasm) and Hugging Face (model); later visits can be offline.

## What `deploy.sh` must stop doing

If you use `./deploy.sh` in this repo (or any wrapper):

1. **Stop pre-gzipping** `ort-wasm-simd-threaded.asyncify.wasm` (or any ORT `.wasm`) before upload.
2. **Stop writing** `Content-Encoding: gzip` for those files in `_headers` / deploy overrides.
3. **Do not** re-add a >25 MiB wasm into `dist/` — the worker loads it from jsDelivr as above.
4. Keep deploying the repo’s `dist/_headers` (includes COOP/COEP credentialless). Do not strip those.
5. Do **not** add SW logic that `respondWith`s jsDelivr / CDN ORT URLs.

The build output from `npm run build` in this repo is what Pages should receive, unchanged.
