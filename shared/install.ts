/** Pure helpers for the Install app button and iOS Add-to-Home-Screen sheet. */

export const INSTALL_DISMISS_KEY = "grading-buddy:install-dismissed";

export type InstallEnv = {
  /** `(display-mode: standalone)` or iOS `navigator.standalone`. */
  standalone: boolean;
  /** User tapped Not now / dismissed the prompt. */
  dismissed: boolean;
  /** Chromium fired `beforeinstallprompt` (or we have a deferred event). */
  canPrompt: boolean;
  /** iOS Safari-like: no beforeinstallprompt API; Share → Add to Home Screen. */
  iosSafari: boolean;
};

/** True when the page is already running as an installed PWA. */
export function isStandaloneDisplay(
  matchMedia: (q: string) => { matches: boolean },
  navStandalone: boolean | undefined,
): boolean {
  return matchMedia("(display-mode: standalone)").matches || navStandalone === true;
}

/** Rough iOS Safari / iPadOS detection (no InstallPrompt API there). */
export function isIosSafari(ua: string, maxTouchPoints: number, platform: string): boolean {
  const ios = /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (!ios) return false;
  // Chrome/Firefox/Edge on iOS still use WebKit but expose CriOS/FxiOS/EdgiOS.
  // The Share → Add to Home Screen sheet is the Safari path; those browsers have their own UI.
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return false;
  return true;
}

/** Whether the unobtrusive Install app control should show. */
export function shouldShowInstall(env: InstallEnv): boolean {
  if (env.standalone || env.dismissed) return false;
  return env.canPrompt || env.iosSafari;
}

/** Message the waiting service worker understands (activates via skipWaiting). */
export const SKIP_WAITING = { type: "SKIP_WAITING" } as const;

/**
 * Prompt for a refresh only when this tab is already controlled and a new SW is waiting.
 * First-time install (no controller yet) must not nag.
 */
export function shouldPromptForSwUpdate(hasController: boolean, hasWaitingWorker: boolean): boolean {
  return hasController && hasWaitingWorker;
}

/**
 * Hide "New version available" while the model is downloading or loading.
 * Show it only on the start screen or the ready app screen (idle).
 */
export function shouldShowSwUpdateBanner(
  hasController: boolean,
  hasWaitingWorker: boolean,
  appIdle: boolean,
): boolean {
  return shouldPromptForSwUpdate(hasController, hasWaitingWorker) && appIdle;
}

/**
 * Never reload on controllerchange alone — only after the user tapped Refresh.
 * That avoids wiping an in-progress model load when a new deploy lands.
 */
export function shouldReloadForSwUpdate(userRequestedRefresh: boolean, controllerChanged: boolean): boolean {
  return userRequestedRefresh && controllerChanged;
}

/**
 * On Refresh: if another tab already activated this worker, it is now the controller
 * and no further controllerchange will fire — reload immediately. Otherwise ask it to skipWaiting.
 */
export function refreshClickAction(waitingIsCurrentController: boolean): "reload" | "skip-waiting" {
  return waitingIsCurrentController ? "reload" : "skip-waiting";
}
