import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { ORT_VARIANT, ORT_VERSION, PAGES_MAX_FILE_BYTES } from "./shared/ort.ts";

// Use the exact onnxruntime-web that Transformers.js uses (npm may nest it under it).
const ORT_DIR = [
  "node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist",
  "node_modules/onnxruntime-web/dist",
].map((p) => path.resolve(p)).find((p) => fs.existsSync(p))!;

const ORT_PKG = path.join(ORT_DIR, "..", "package.json");
const installedOrt = JSON.parse(fs.readFileSync(ORT_PKG, "utf8")).version as string;
if (installedOrt !== ORT_VERSION) {
  throw new Error(
    `shared/ort.ts ORT_VERSION (${ORT_VERSION}) must match installed onnxruntime-web (${installedOrt})`,
  );
}

const ORT_LOCAL_FILES = [`${ORT_VARIANT}.mjs`, `${ORT_VARIANT}.wasm`];

/** Only ship ORT files that fit under the Cloudflare Pages 25 MiB limit (the .mjs). */
function ortFilesForDist(): string[] {
  return ORT_LOCAL_FILES.filter((f) => {
    const size = fs.statSync(path.join(ORT_DIR, f)).size;
    return size <= PAGES_MAX_FILE_BYTES;
  });
}

// Serves ORT from node_modules in dev. Production ships only the small .mjs; the worker
// fetches asyncify.wasm from jsDelivr into wasmBinary (SW does not intercept CDN).
// Writes a service worker that precaches the app shell only.
function offlinePlugin(): Plugin {
  return {
    name: "chonji-offline",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/ort\/([^?]+)/);
        if (m && ORT_LOCAL_FILES.includes(m[1])) {
          res.setHeader("Content-Type", m[1].endsWith(".wasm") ? "application/wasm" : "text/javascript");
          fs.createReadStream(path.join(ORT_DIR, m[1])).pipe(res);
          return;
        }
        next();
      });
    },
    generateBundle(_opts, bundle) {
      // Transformers/ORT still emit a hashed asyncify.wasm via `new URL(..., import.meta.url)`.
      // We never load that copy (worker sets wasmBinary from jsDelivr) and it is over the
      // Pages 25 MiB limit, so drop it from the bundle before emit.
      for (const fileName of Object.keys(bundle)) {
        if (/ort-wasm-simd-threaded\.asyncify.*\.wasm$/.test(fileName) || /ort-wasm.*\.jsep.*\.wasm$/.test(fileName)) {
          delete bundle[fileName];
        }
      }

      const shippedOrt = ortFilesForDist();
      for (const f of shippedOrt) {
        this.emitFile({ type: "asset", fileName: `ort/${f}`, source: fs.readFileSync(path.join(ORT_DIR, f)) });
      }
      // Fail the build if anything left is over the Pages limit (guards against regressions).
      for (const [fileName, item] of Object.entries(bundle)) {
        const bytes =
          item.type === "asset"
            ? (typeof item.source === "string" ? Buffer.byteLength(item.source) : item.source.byteLength)
            : Buffer.byteLength(item.code);
        if (bytes > PAGES_MAX_FILE_BYTES) {
          throw new Error(
            `Build asset ${fileName} is ${(bytes / (1024 * 1024)).toFixed(2)} MiB — over Cloudflare Pages' 25 MiB limit. ` +
              `Do not pre-gzip to squeeze it in; load oversized ORT wasm from jsDelivr instead.`,
          );
        }
      }
      for (const f of shippedOrt) {
        const bytes = fs.statSync(path.join(ORT_DIR, f)).size;
        if (bytes > PAGES_MAX_FILE_BYTES) {
          throw new Error(`ORT file ort/${f} is over the Pages 25 MiB limit`);
        }
      }

      const publicFiles = [
        "manifest.webmanifest",
        "icons/icon-180.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-512-maskable.png",
      ];
      // Root-absolute URLs so the shell works when the installed PWA opens at `/`.
      const files = ["/", "/index.html", ...publicFiles.map((f) => `/${f}`), ...Object.keys(bundle).map((f) => `/${f}`), ...shippedOrt.map((f) => `/ort/${f}`)]
        .filter((f) => !f.endsWith(".map") && !/\/assets\/ort-wasm.*\.wasm$/.test(f)); // ORT also emits a hashed copy we never load
      const version = Date.now().toString(36);
      const sw = fs.readFileSync(path.resolve("app/sw-template.js"), "utf8")
        .replace("__VERSION__", version)
        .replace("__FILES__", JSON.stringify([...new Set(files)]));
      this.emitFile({ type: "asset", fileName: "sw.js", source: sw });
    },
    writeBundle(outputOpts) {
      const dir = outputOpts.dir ?? path.resolve("dist");
      const tooBig: string[] = [];
      const walk = (d: string) => {
        for (const name of fs.readdirSync(d)) {
          const p = path.join(d, name);
          const st = fs.statSync(p);
          if (st.isDirectory()) walk(p);
          else if (st.size > PAGES_MAX_FILE_BYTES) tooBig.push(path.relative(dir, p));
        }
      };
      walk(dir);
      if (tooBig.length) {
        throw new Error(
          `dist/ still contains file(s) over Pages 25 MiB limit: ${tooBig.join(", ")}. ` +
            `Remove them; production ORT wasm must load from jsDelivr.`,
        );
      }
    },
  };
}

const isolation = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" };

// HTTPS=1 npm run dev -- --host  -> self-signed cert so a phone on the same wifi
// gets a secure context (needed for WebGPU, Cache Storage and service workers).
export default defineConfig({
  root: "app",
  // Root deploy on Cloudflare Pages (`wrangler pages deploy dist`). Absolute `/` paths
  // keep the installed PWA, manifest scope and service worker aligned.
  base: "/",
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  // Cross-origin isolation lets the WASM "slow mode" use several CPU threads.
  // "credentialless" still allows the cross-origin model download from Hugging Face
  // and the ORT wasm from jsDelivr (CORP: cross-origin).
  server: { fs: { allow: [".."] }, headers: isolation },
  preview: { headers: isolation },
  plugins: [offlinePlugin(), ...(process.env.HTTPS ? [basicSsl()] : [])],
});
