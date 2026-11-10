import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  isIosSafari,
  isStandaloneDisplay,
  refreshClickAction,
  shouldPromptForSwUpdate,
  shouldReloadForSwUpdate,
  shouldShowInstall,
  shouldShowSwUpdateBanner,
} from "../shared/install.ts";

describe("install helpers", () => {
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
});

// Copilot #4529813608 — do not cache failed navigation responses
describe("service worker shell cache", () => {
  it("sw-template only puts ok navigation responses in the shell cache", () => {
    const src = fs.readFileSync("app/sw-template.js", "utf8");
    expect(src).toMatch(/if\s*\(\s*!res\.ok\s*\)/);
    expect(src).toMatch(/Never cache HTTP error pages/);
    expect(src).toMatch(/return shell\(\)/);
  });
});

// Copilot #4529813811 — install sheet focus containment
describe("install sheet accessibility", () => {
  it("install-ui traps Tab and restores focus on close", () => {
    const src = fs.readFileSync("app/src/install-ui.ts", "utf8");
    expect(src).toMatch(/trapHandler/);
    expect(src).toMatch(/Escape/);
    expect(src).toMatch(/opener\?\.focus/);
    expect(src).toMatch(/shiftKey/);
  });
});
