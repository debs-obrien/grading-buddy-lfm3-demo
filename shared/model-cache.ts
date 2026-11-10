// Is the model already on this device? Decided from the real browser cache (Transformers.js
// stores each file in Cache Storage "transformers-cache", keyed by its Hugging Face URL), with
// the old localStorage flag only as a fallback when Cache Storage can't be read.
export const TRANSFORMERS_CACHE = "transformers-cache";

/** The big ONNX files for one dtype, as Transformers.js cache keys. */
export function modelFileUrls(modelId: string, dtype: string, host = "https://huggingface.co/"): string[] {
  const base = `${host.replace(/\/?$/, "/")}${modelId}/resolve/main/onnx/model_${dtype}.onnx`;
  return [base, `${base}_data`];
}

export type CacheState = "cached" | "download";

/**
 * cachedUrls: the URLs found in the cache, or null if the cache couldn't be read.
 * flag: the old "downloaded once" localStorage flag.
 */
export function cacheState(needed: string[], cachedUrls: string[] | null, flag: boolean): CacheState {
  if (cachedUrls === null) return flag ? "cached" : "download";
  const have = new Set(cachedUrls);
  return needed.every((u) => have.has(u)) ? "cached" : "download";
}
