/**
 * ONNX Runtime Web assets used by Transformers.js.
 *
 * The asyncify build (needed for WebGPU) is ~25.6 MiB — over Cloudflare Pages'
 * 25 MiB per-file limit — so the .wasm is NOT shipped in dist/. Production:
 *   - serves the small .mjs from our origin (/ort/…)
 *   - fetches the .wasm from jsDelivr in the worker, verifies magic 00 61 73 6d,
 *     caches it in Cache Storage, and passes bytes via wasmBinary
 * The service worker must NOT intercept jsDelivr (iOS WebKit + SW + cross-origin
 * from a module worker is a suspected "Load failed" path).
 *
 * Do not pre-gzip the wasm for Pages: Pages ignores Content-Encoding from
 * `_headers` and would serve gzip bytes as raw wasm (magic 1f 8b instead of 00 61 73 6d).
 */
export const ORT_VERSION = "1.31.0-dev.20260914-8d85527a0";
export const ORT_VARIANT = "ort-wasm-simd-threaded.asyncify";
/** Cloudflare Pages rejects any single asset larger than this. */
export const PAGES_MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Cache Storage bucket for the ORT engine wasm (worker-managed, not the SW). */
export const ORT_ENGINE_CACHE = "chonji-ort-engine";

export const ortCdnBase = (version = ORT_VERSION): string =>
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;

export function ortCdnWasmUrl(version = ORT_VERSION): string {
  return `${ortCdnBase(version)}${ORT_VARIANT}.wasm`;
}

/** @deprecated Prefer ortCdnWasmUrl + local mjs; kept for tests/docs. */
export function ortCdnUrls(version = ORT_VERSION): { mjs: string; wasm: string } {
  const base = ortCdnBase(version);
  return {
    mjs: `${base}${ORT_VARIANT}.mjs`,
    wasm: `${base}${ORT_VARIANT}.wasm`,
  };
}

/** Absolute same-origin paths (Vite dev middleware + production /ort/*.mjs). */
export function ortLocalUrls(originBase: string): { mjs: string; wasm: string } {
  const base = originBase.endsWith("/") ? originBase : `${originBase}/`;
  return {
    mjs: `${base}ort/${ORT_VARIANT}.mjs`,
    wasm: `${base}ort/${ORT_VARIANT}.wasm`,
  };
}

/** True when bytes start with Wasm magic 00 61 73 6d (not gzip 1f 8b). */
export function isWasmMagic(bytes: ArrayBuffer | Uint8Array): boolean {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return u8.length >= 4 && u8[0] === 0x00 && u8[1] === 0x61 && u8[2] === 0x73 && u8[3] === 0x6d;
}
