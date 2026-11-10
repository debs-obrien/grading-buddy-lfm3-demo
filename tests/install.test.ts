import { describe, it, expect } from "vitest";
import {
  INSTALL_DISMISS_KEY,
  SKIP_WAITING,
  isIosSafari,
  isStandaloneDisplay,
  refreshClickAction,
  shouldPromptForSwUpdate,
  shouldReloadForSwUpdate,
  shouldShowInstall,
  shouldShowSwUpdateBanner,
} from "../shared/install.ts";
import { cacheState, modelFileUrls } from "../shared/model-cache.ts";

describe("install helpers", () => {
  it("exposes a stable dismiss key", () => {
    expect(INSTALL_DISMISS_KEY).toBe("grading-buddy:install-dismissed");
  });

  it("detects standalone via display-mode or iOS navigator.standalone", () => {
    expect(isStandaloneDisplay(() => ({ matches: true }), false)).toBe(true);
    expect(isStandaloneDisplay(() => ({ matches: false }), true)).toBe(true);
    expect(isStandaloneDisplay(() => ({ matches: false }), undefined)).toBe(false);
  });

  it("detects iOS Safari but not Chrome/Firefox on iOS", () => {
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", 5, "iPhone")).toBe(true);
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1", 5, "iPhone")).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile", 5, "Linux armv8l")).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 5, "MacIntel")).toBe(true);
  });

  it("hides Install when installed or dismissed; shows for prompt or iOS Safari", () => {
    expect(shouldShowInstall({ standalone: true, dismissed: false, canPrompt: true, iosSafari: true })).toBe(false);
    expect(shouldShowInstall({ standalone: false, dismissed: true, canPrompt: true, iosSafari: true })).toBe(false);
    expect(shouldShowInstall({ standalone: false, dismissed: false, canPrompt: true, iosSafari: false })).toBe(true);
    expect(shouldShowInstall({ standalone: false, dismissed: false, canPrompt: false, iosSafari: true })).toBe(true);
    expect(shouldShowInstall({ standalone: false, dismissed: false, canPrompt: false, iosSafari: false })).toBe(false);
  });
});

describe("service worker update prompt", () => {
  it("posts the standard SKIP_WAITING payload", () => {
    expect(SKIP_WAITING).toEqual({ type: "SKIP_WAITING" });
  });

  it("prompts only when a controlled page has a waiting worker", () => {
    expect(shouldPromptForSwUpdate(true, true)).toBe(true);
    expect(shouldPromptForSwUpdate(false, true)).toBe(false); // first install
    expect(shouldPromptForSwUpdate(true, false)).toBe(false);
    expect(shouldPromptForSwUpdate(false, false)).toBe(false);
  });

  it("hides the New version bar while the model is busy; shows it only when idle", () => {
    expect(shouldShowSwUpdateBanner(true, true, true)).toBe(true); // start or ready
    expect(shouldShowSwUpdateBanner(true, true, false)).toBe(false); // downloading / loading
    expect(shouldShowSwUpdateBanner(true, false, true)).toBe(false);
    expect(shouldShowSwUpdateBanner(false, true, true)).toBe(false);
  });

  it("never reloads without an explicit user Refresh tap", () => {
    expect(shouldReloadForSwUpdate(false, true)).toBe(false); // controllerchange alone
    expect(shouldReloadForSwUpdate(false, false)).toBe(false);
    expect(shouldReloadForSwUpdate(true, false)).toBe(false); // tapped, SW not active yet
    expect(shouldReloadForSwUpdate(true, true)).toBe(true); // tapped + new SW took over
  });

  it("reloads immediately on Refresh when another tab already activated the waiting worker", () => {
    expect(refreshClickAction(true)).toBe("reload");
    expect(refreshClickAction(false)).toBe("skip-waiting");
  });

  it("still treats a full transformers-cache + model-ready flag as cached after reload", () => {
    const urls = modelFileUrls("onnx-community/LFM3-1.7B-ONNX", "q4f16");
    expect(cacheState(urls, urls, true)).toBe("cached");
    expect(cacheState(urls, urls, false)).toBe("cached"); // cache wins over flag
    expect(cacheState(urls, [], true)).toBe("download"); // stale flag alone is not enough
  });
});

