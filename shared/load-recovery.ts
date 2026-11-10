import type { CacheState } from "./model-cache.ts";

/** Set just before a model load starts; cleared only when the worker reports ready. */
export const LOAD_ATTEMPTED_KEY = "chonji-buddy:model-load-attempted";

export type StartupScreen = "load-cached" | "setup" | "recover";

export type LoadStage = "model-download" | "model-save" | "engine-download" | "engine-start";

/**
 * Decide the first screen after boot.
 * A prior load that never reached ready must not look like a fresh "please download" start,
 * and must not auto-resume from cache (that can reload-loop on a memory-tight phone).
 * Explicit Try again can still load from cache.
 */
export function startupScreen(cache: CacheState, loadAttempted: boolean): StartupScreen {
  if (loadAttempted) return "recover";
  if (cache === "cached") return "load-cached";
  return "setup";
}

/** Kid/parent-friendly wording for a load that was interrupted. Mentions iPhone only on iPhone. */
export function recoverLoadMessage(isiPhone: boolean): string {
  if (isiPhone) {
    return "The brain started loading last time, but this page had to reload before it finished. On an iPhone, browser tabs sometimes run out of memory with a big download, so try Safari, or a computer. If the download already finished, tap Try again; we may already have it saved on this device. Or look around in Learn and Quiz first.";
  }
  return "The brain started loading last time, but this page had to reload before it finished. Tap Try again. We may already have it saved on this device. Or look around in Learn and Quiz first.";
}

/** When the browser also has no WebGPU: recover copy + Learn/Quiz still work. */
export const RECOVER_NO_GPU_MESSAGE =
  "The brain started loading last time, but this page had to reload before it finished. This browser can't run the on-device AI (it needs WebGPU). You can still use Learn and Quiz offline. For Ask answers, try Safari on a newer iPhone, or a computer.";

/** Short clue from a raw error (keeps "Load failed" when WebKit says that). */
export function errorClue(raw: string): string {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "unknown error";
  if (/load failed/i.test(t)) return "Load failed";
  if (/expected magic word|1f 8b/i.test(t)) return "damaged file";
  if (/quota/i.test(t)) return "storage full";
  if (/out of memory|OOM|Exceeded .* memory/i.test(t)) return "out of memory";
  return t.slice(0, 120);
}

/**
 * Name the failing stage so a phone test tells us where it broke.
 * Example: Couldn't download the engine from cdn.jsdelivr.net (Load failed)
 */
export function stagedLoadError(stage: LoadStage, raw: string, host?: string): string {
  const clue = errorClue(raw);
  const where = host ? ` from ${host}` : "";
  switch (stage) {
    case "model-download":
      return `Couldn't download the brain${where} (${clue})`;
    case "model-save":
      return `Couldn't save the brain on this device (${clue})`;
    case "engine-download":
      return `Couldn't download the engine${where || " from cdn.jsdelivr.net"} (${clue})`;
    case "engine-start":
      return `Couldn't start the AI engine (${clue})`;
  }
}

/**
 * Map raw worker/ORT errors to plain words parents can act on.
 * Prefer stagedLoadError when the worker already named the stage.
 */
export function friendlyLoadError(raw: string): string {
  const t = String(raw ?? "");
  // Already staged by the worker — pass through (no jargon wrapping).
  if (/^Couldn't (download the brain|save the brain|download the engine|start the AI engine)/i.test(t)) {
    return t;
  }
  if (/expected magic word|1f 8b|WebAssembly\.instantiate/i.test(t)) {
    return stagedLoadError("engine-start", t);
  }
  if (/no available backend|Aborted\(CompileError/i.test(t)) {
    return stagedLoadError("engine-start", t);
  }
  if (/out of memory|OOM|memory|Exceeded .* memory/i.test(t)) {
    return "This device ran out of memory while loading the brain. Try a computer, or close other apps and tabs and tap Try again.";
  }
  if (/load failed/i.test(t)) {
    return stagedLoadError("engine-download", t, "cdn.jsdelivr.net");
  }
  const short = t.replace(/\s+/g, " ").trim().slice(0, 180);
  return short
    ? `Something went wrong while loading the brain. ${short}`
    : "Something went wrong while loading the brain. Tap Try again, or open Grading Buddy on a computer.";
}
