import {
  INSTALL_DISMISS_KEY,
  SKIP_WAITING,
  isIosSafari,
  isStandaloneDisplay,
  refreshClickAction,
  shouldReloadForSwUpdate,
  shouldShowInstall,
  shouldShowSwUpdateBanner,
} from "../../shared/install.ts";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Wire the Install app button, Chromium beforeinstallprompt, and the iOS sheet. */
export function wireInstallUi(opts: {
  button: HTMLButtonElement;
  sheet: HTMLElement;
  sheetClose: HTMLElement;
  sheetDismiss: HTMLElement;
  storage?: Storage;
  matchMedia?: (q: string) => { matches: boolean };
  nav?: Navigator & { standalone?: boolean };
}): void {
  const storage = opts.storage ?? localStorage;
  const matchMedia = opts.matchMedia ?? ((q: string) => window.matchMedia(q));
  const nav = opts.nav ?? (navigator as Navigator & { standalone?: boolean });

  let deferred: BeforeInstallPromptEvent | null = null;
  let opener: HTMLElement | null = null;
  let trapHandler: ((e: KeyboardEvent) => void) | null = null;

  const env = () => ({
    standalone: isStandaloneDisplay(matchMedia, nav.standalone),
    dismissed: storage.getItem(INSTALL_DISMISS_KEY) === "1",
    canPrompt: !!deferred,
    iosSafari: isIosSafari(nav.userAgent, nav.maxTouchPoints ?? 0, nav.platform ?? ""),
  });

  const focusables = () =>
    [
      ...opts.sheet.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => !el.hidden && el.getAttribute("aria-hidden") !== "true");

  const closeSheet = (restoreFocus: boolean) => {
    opts.sheet.hidden = true;
    if (trapHandler) {
      opts.sheet.removeEventListener("keydown", trapHandler);
      trapHandler = null;
    }
    if (restoreFocus) opener?.focus();
    opener = null;
  };

  const openSheet = () => {
    opener = (document.activeElement as HTMLElement) || opts.button;
    opts.sheet.hidden = false;
    opts.sheetClose.focus();
    trapHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSheet(true);
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    opts.sheet.addEventListener("keydown", trapHandler);
  };

  const refresh = () => {
    const show = shouldShowInstall(env());
    opts.button.hidden = !show;
    if (!show) closeSheet(false);
  };

  const dismiss = () => {
    try {
      storage.setItem(INSTALL_DISMISS_KEY, "1");
    } catch {
      /* quota */
    }
    closeSheet(true);
    refresh();
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    refresh();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    dismiss();
  });

  opts.button.addEventListener("click", async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      if (choice.outcome === "dismissed") dismiss();
      else refresh();
      return;
    }
    if (env().iosSafari) openSheet();
  });

  opts.sheetClose.addEventListener("click", () => closeSheet(true));
  opts.sheetDismiss.addEventListener("click", dismiss);

  // Hide if already installed; show on iOS immediately (no prompt event there).
  refresh();
}

/**
 * Register the production service worker. Never auto-reloads.
 * When a new SW is waiting, shows the update bar only while the app is idle
 * (start screen or ready); Reload only after the user taps Refresh
 * (posts SKIP_WAITING, then reloads on the following controllerchange).
 */
export function registerServiceWorker(
  scriptUrl: string,
  opts: { banner: HTMLElement; refreshBtn: HTMLButtonElement },
): { setAppIdle: (idle: boolean) => void } {
  const noop = { setAppIdle: (_idle: boolean) => {} };
  if (!("serviceWorker" in navigator)) return noop;

  let userRequestedRefresh = false;
  let waiting: ServiceWorker | null = null;
  let appIdle = true;

  const paintBanner = () => {
    const show = shouldShowSwUpdateBanner(!!navigator.serviceWorker.controller, !!waiting, appIdle);
    opts.banner.hidden = !show;
  };

  const showBanner = (worker: ServiceWorker | null) => {
    waiting = worker;
    paintBanner();
  };

  const watchInstalling = (reg: ServiceWorkerRegistration, worker: ServiceWorker | null) => {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") showBanner(reg.waiting);
    });
  };

  navigator.serviceWorker.register(scriptUrl).then((reg) => {
    // Already waiting from a prior visit / deploy.
    if (reg.waiting) showBanner(reg.waiting);
    watchInstalling(reg, reg.installing);

    reg.addEventListener("updatefound", () => {
      watchInstalling(reg, reg.installing);
    });

    // Periodic check so a long-lived tab (model download) still notices a new deploy.
    const poke = () => reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") poke();
    });
    setInterval(poke, 60 * 60 * 1000);
  }).catch((e) => console.warn("SW failed", e));

  opts.refreshBtn.addEventListener("click", () => {
    userRequestedRefresh = true;
    if (!waiting) {
      opts.banner.hidden = true;
      return;
    }
    // Another tab may already have activated this worker — no second controllerchange then.
    if (refreshClickAction(waiting === navigator.serviceWorker.controller) === "reload") {
      location.reload();
      return;
    }
    waiting.postMessage(SKIP_WAITING);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!shouldReloadForSwUpdate(userRequestedRefresh, true)) return;
    location.reload();
  });

  return {
    setAppIdle: (idle: boolean) => {
      appIdle = idle;
      paintBanner();
    },
  };
}
