import { describe, it, expect } from "vitest";
import { modelFileUrls, cacheState } from "../shared/model-cache.ts";

const urls = modelFileUrls("onnx-community/LFM3-1.7B-ONNX", "q4f16");

describe("model cache decision", () => {
  it("is cached only when every model file is in the cache, whatever the flag says", () => {
    expect(cacheState(urls, [...urls, "https://huggingface.co/x/config.json"], false)).toBe("cached");
    expect(cacheState(urls, [urls[0]], true)).toBe("download"); // half-finished download
    expect(cacheState(urls, [], true)).toBe("download"); // cache cleared, stale flag
  });
  it("other dtypes don't count", () => {
    expect(cacheState(urls, modelFileUrls("onnx-community/LFM3-1.7B-ONNX", "q4"), true)).toBe("download");
  });
  it("falls back to the flag when the cache can't be read", () => {
    expect(cacheState(urls, null, true)).toBe("cached");
    expect(cacheState(urls, null, false)).toBe("download");
  });
});
