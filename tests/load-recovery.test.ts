import { describe, it, expect } from "vitest";
import {
  RECOVER_NO_GPU_MESSAGE,
  friendlyLoadError,
  recoverLoadMessage,
  stagedLoadError,
  startupScreen,
} from "../shared/load-recovery.ts";
import { cacheState, modelFileUrls } from "../shared/model-cache.ts";

const urls = modelFileUrls("onnx-community/LFM3-1.7B-ONNX", "q4f16");

describe("startup after a broken load", () => {
  it("auto-loads from cache only when files are present and no unfinished attempt", () => {
    expect(startupScreen("cached", false)).toBe("load-cached");
    expect(startupScreen(cacheState(urls, urls, false), false)).toBe("load-cached");
  });

  it("shows recover when a load was attempted — even if the cache already has the files", () => {
    expect(startupScreen(cacheState(urls, urls, true), true)).toBe("recover");
    expect(startupScreen("cached", true)).toBe("recover");
    expect(startupScreen(cacheState(urls, [], true), true)).toBe("recover");
    expect(startupScreen("download", true)).toBe("recover");
  });

  it("shows the normal download start screen only on a fresh visit", () => {
    expect(startupScreen("download", false)).toBe("setup");
  });

  it("uses plain parent-friendly recover copy; iPhone wording only on iPhone", () => {
    const phone = recoverLoadMessage(true);
    const desk = recoverLoadMessage(false);
    expect(phone.toLowerCase()).not.toMatch(/\bnotes\b/);
    expect(desk.toLowerCase()).not.toMatch(/\bnotes\b/);
    expect(phone).toMatch(/iPhone/i);
    expect(desk).not.toMatch(/iPhone/i);
    expect(desk).toMatch(/Try again/i);
    expect(RECOVER_NO_GPU_MESSAGE).toMatch(/Learn and Quiz/i);
  });
});

describe("staged load errors", () => {
  it("names engine download with host for WebKit Load failed", () => {
    expect(stagedLoadError("engine-download", "Load failed", "cdn.jsdelivr.net")).toBe(
      "Couldn't download the engine from cdn.jsdelivr.net (Load failed)",
    );
  });

  it("names model download / save / engine start", () => {
    expect(stagedLoadError("model-download", "network error", "huggingface.co")).toMatch(/Couldn't download the brain from huggingface\.co/);
    expect(stagedLoadError("model-save", "Quota exceeded")).toMatch(/Couldn't save the brain/);
    expect(stagedLoadError("engine-start", "CompileError")).toMatch(/Couldn't start the AI engine/);
  });
});

describe("friendlyLoadError", () => {
  it("explains the gzip-as-wasm magic-word failure in plain words", () => {
    const msg = friendlyLoadError(
      "no available backend found. ERR: [webgpu] RuntimeError: Aborted(CompileError: WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 1f 8b 08 08 @+0)",
    );
    expect(msg.toLowerCase()).not.toMatch(/\bnotes\b/);
    expect(msg).toMatch(/Couldn't start the AI engine|damaged/i);
  });

  it("maps bare Load failed to engine-download wording", () => {
    expect(friendlyLoadError("Load failed")).toBe(
      "Couldn't download the engine from cdn.jsdelivr.net (Load failed)",
    );
  });
});
