import "./style.css";
import { TRANSFORMERS_CACHE, modelFileUrls, cacheState, type CacheState } from "../../shared/model-cache.ts";
import { LOAD_ATTEMPTED_KEY, RECOVER_NO_GPU_MESSAGE, friendlyLoadError, recoverLoadMessage, startupScreen } from "../../shared/load-recovery.ts";
import { activeNotes, activeContent } from "./belt-notes.ts";
import { BELTS, DEFAULT_BELT } from "../../shared/belts.ts";
import { CONFIG } from "../../shared/config.ts";
import {
  optionLabel,
  recordAnswer,
  currentId,
  isRoundOver,
  roundRight,
  roundTotal,
  progressText,
  missed,
  encouragement,
  ROUND_LENGTH,
  type Round,
  type Option,
} from "../../shared/quiz.ts";
import {
  buildQuizBank,
  buildOptionsFromQuestion,
  quizForGrading,
  seededRandom,
  type QuizQuestion,
} from "../../shared/quiz-templates.ts";
import { orderIdsByMisses, ATTEMPTS_KEY, parseAttempts, recordAttempt, serializeAttempts, type Attempt } from "../../shared/progress.ts";
import { renderLearn } from "./learn.ts";
import { wireTablist } from "./tabs.ts";
import { gradingBadge, topicChip, chonjiDiagram, isChonji, scoreBelt, celebrate } from "./art.ts";
import { registerServiceWorker, wireInstallUi } from "./install-ui.ts";
import type { Device, FromWorker, ToWorker } from "./messages.ts";
import { nextAskDisplay, type AskDisplay } from "../../shared/ask-view.ts";
import { itemById } from "../../shared/content.ts";
import { answerChromeHtml, escapeHtml, wireHowToggle } from "../../shared/how-answered-view.ts";
import type { HowAnswered } from "../../shared/provenance.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => {
  $(id).hidden = !on;
};
const screens = ["unsupported", "setup", "loading", "error", "app"];
let askReady = false;
/** True while an Ask request is in flight — blocks button and Enter. */
let askBusy = false;
let askWaitTimer: ReturnType<typeof setInterval> | null = null;
let swUpdate: { setAppIdle: (idle: boolean) => void } = { setAppIdle: () => {} };

const screen = (id: string) => {
  screens.forEach((s) => show(s, s === id));
  swUpdate.setAppIdle(id === "setup" || id === "app");
};

const notes = activeNotes();
const bundle = activeContent();
const quizBank = buildQuizBank(bundle);
const DOWNLOADED_KEY = "chonji-buddy:model-ready";
const params = new URLSearchParams(location.search);

const markLoadAttempted = () => {
  try {
    localStorage.setItem(LOAD_ATTEMPTED_KEY, "1");
  } catch {
    /* quota */
  }
};
const clearLoadAttempted = () => {
  try {
    localStorage.removeItem(LOAD_ATTEMPTED_KEY);
  } catch {
    /* ignore */
  }
};
const showLoadError = (raw: string) => {
  $("error-text").textContent = friendlyLoadError(raw);
  screen("error");
};

const isiPhoneDevice = () => {
  const ua = navigator.userAgent;
  return /iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1 && /Mobile/i.test(ua));
};

const loadAttempts = (): Attempt[] => parseAttempts(localStorage.getItem(ATTEMPTS_KEY));
const saveAttempts = (a: Attempt[]) => {
  try {
    localStorage.setItem(ATTEMPTS_KEY, serializeAttempts(a));
  } catch {
    /* quota */
  }
};
const clearAttempts = () => localStorage.removeItem(ATTEMPTS_KEY);

function renderBelts() {
  const host = $("belts");
  host.innerHTML = BELTS.map((b) => {
    const locked = b.status !== "ready";
    const active = b.id === DEFAULT_BELT;
    const aria = locked ? `${b.label} belt, locked, coming soon` : `${b.label} belt`;
    const swatch = `<span class="swatch" style="background:${b.colour}" aria-hidden="true"></span>`;
    return `<button type="button" class="belt${active ? " active" : ""}${locked ? " locked" : ""}" data-belt="${b.id}" aria-label="${aria}"${active ? ' aria-current="true"' : ""}${locked ? ` aria-disabled="true" title="${b.label} belt: coming soon"` : ""}>${swatch}${b.tab}${locked ? '<span class="lock" aria-hidden="true">🔒</span>' : ""}</button>`;
  }).join("");
  host.querySelectorAll<HTMLButtonElement>("button.locked").forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      $("belt-msg").textContent = `${BELTS.find((b) => b.id === btn.dataset.belt)!.label} belt: coming soon.`;
    };
  });
}

function unsupportedReason(): string | null {
  if (!window.isSecureContext)
    return "This page was opened over plain http from another device. Browsers only allow offline storage and WebGPU on https:// or localhost.";
  if (typeof WebAssembly !== "object") return "This browser does not support WebAssembly.";
  if (typeof Worker === "undefined") return "This browser does not support Web Workers.";
  if (typeof caches === "undefined") return "This browser does not support the Cache Storage the model needs.";
  return null;
}

async function pickDevice(): Promise<{ device: Device; dtype: string } | null> {
  const forced = params.get("device");
  if (forced === "wasm") return { device: "wasm", dtype: CONFIG.dtypeWasm };
  const gpu = (navigator as any).gpu;
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) {
        const dtype = adapter.features?.has?.("shader-f16") ? CONFIG.dtypeWebGPU : CONFIG.dtypeWasm;
        return { device: "webgpu", dtype };
      }
    } catch {
      /* fall through */
    }
  }
  return CONFIG.allowWasmFallback ? { device: "wasm", dtype: CONFIG.dtypeWasm } : null;
}

const sizeLabel = () => (choice?.dtype === "q4f16" ? CONFIG.downloadSizeLabel : "about 1.3 GB");

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const send = (m: ToWorker) => worker.postMessage(m);
let nextId = 1;
const pending = new Map<number, (m: FromWorker) => void>();
let choice: { device: Device; dtype: string };

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const m = e.data;
  if (m.type === "progress") {
    if (loadState === "cached") return;
    const pct = m.total ? Math.min(100, (m.loaded / m.total) * 100) : 0;
    $("bar-fill").style.width = `${pct.toFixed(1)}%`;
    $("loading-text").textContent = `${(m.loaded / 1e6).toFixed(0)} MB of ${(m.total / 1e6).toFixed(0)} MB`;
  } else if (m.type === "status") {
    if (!$("loading").hidden)
      $("loading-title").textContent = m.text.startsWith("Warming") ? "Almost ready…" : $("loading-title").textContent;
  } else if (m.type === "ready") {
    localStorage.setItem(DOWNLOADED_KEY, "1");
    clearLoadAttempted();
    askReady = true;
    show("ask-form");
    show("ask-unavailable", false);
    show("no-gpu", false);
    (window as any).__chonji = { device: m.device, dtype: m.dtype, loadSeconds: m.loadSeconds };
    screen("app");
  } else if (m.type === "error" && m.id === undefined) {
    showLoadError(m.message);
  } else if ("id" in m && m.id !== undefined) {
    pending.get(m.id)?.(m);
  }
};

async function cachedModelUrls(): Promise<string[] | null> {
  try {
    const cache = await caches.open(TRANSFORMERS_CACHE);
    return (await cache.keys()).map((r) => r.url);
  } catch {
    return null;
  }
}
async function modelCacheState(): Promise<CacheState> {
  return cacheState(modelFileUrls(CONFIG.modelId, choice.dtype), await cachedModelUrls(), !!localStorage.getItem(DOWNLOADED_KEY));
}

let loadState: CacheState = "download";
function setLoadingUi(state: CacheState) {
  loadState = state;
  $("loading").classList.toggle("from-device", state === "cached");
  $("loading-title").textContent = state === "cached" ? "Getting ready…" : `Downloading (${sizeLabel()})…`;
  $("loading-text").textContent =
    state === "cached" ? "Loading the AI model from this device. No download needed." : "Starting…";
  $("bar-fill").style.width = state === "cached" ? "" : "0%";
}

function startLoad(state: CacheState = "download") {
  markLoadAttempted();
  screen("loading");
  setLoadingUi(state);
  navigator.storage?.persist?.().catch(() => {});
  send({ type: "load", device: choice.device, dtype: choice.dtype });
}

const SUGGESTIONS = [
  "What does charyot mean?",
  "How many moves are in Chon-Ji?",
  "What are the five tenets?",
  "How do I count to 10 in Korean?",
];
function renderChips() {
  const box = $("chips");
  for (const s of SUGGESTIONS) {
    const b = document.createElement("button");
    b.textContent = s;
    b.onclick = () => {
      $<HTMLTextAreaElement>("question").value = s;
      ask();
    };
    box.append(b);
  }
}

const plain = (t: string) => t.replace(/\*\*/g, "").replace(/^#+\s*/gm, "");

function renderAnswerPanel(panel: HTMLElement, text: string, how: HowAnswered, idPrefix: string) {
  const body = `<div class="answer-body">${escapeHtml(plain(text))}</div>`;
  panel.innerHTML = answerChromeHtml(body, how, idPrefix);
  wireHowToggle(panel, idPrefix);
  panel.dataset.source = how.source;
}

function stopAskWaitCue() {
  if (askWaitTimer) {
    clearInterval(askWaitTimer);
    askWaitTimer = null;
  }
}

/** Thinking… for screen readers once; elapsed seconds are visual-only (aria-hidden). */
function paintAskThinking(panel: HTMLElement, startedAt: number) {
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  panel.innerHTML = `<span class="ask-thinking-label">Thinking…</span> <span class="ask-elapsed" aria-hidden="true">${secs} s</span>`;
}

function ask() {
  if (!askReady || askBusy) return;
  const q = $<HTMLTextAreaElement>("question").value.trim();
  if (!q) return;
  const id = nextId++;
  const btn = $<HTMLButtonElement>("ask-btn");
  askBusy = true;
  btn.disabled = true;
  btn.textContent = "Thinking…";
  show("answer");
  $("answer-diagram").innerHTML = "";
  let view: AskDisplay = nextAskDisplay({ text: "", final: false }, { type: "start" });
  const panel = $("answer");
  const startedAt = Date.now();
  stopAskWaitCue();
  paintAskThinking(panel, startedAt);
  panel.setAttribute("aria-busy", "true");
  // Elapsed cue updates visually only — do not poke aria-live every second.
  askWaitTimer = setInterval(() => paintAskThinking(panel, startedAt), 1000);
  pending.set(id, (m) => {
    if (m.type === "token") {
      stopAskWaitCue();
      view = nextAskDisplay(view, { type: "token", text: m.text }, plain);
      panel.textContent = view.text;
      return;
    }
    if (m.type === "answer" || m.type === "error") {
      pending.delete(id);
      stopAskWaitCue();
      askBusy = false;
      btn.disabled = false;
      btn.textContent = "Ask";
      panel.removeAttribute("aria-busy");
      if (m.type === "error") {
        view = nextAskDisplay(view, { type: "error", text: `Oops: ${m.message}` });
        panel.textContent = view.text;
        return;
      }
      view = nextAskDisplay(view, { type: "answer", text: m.text }, plain);
      renderAnswerPanel(panel, view.text, m.how, "ask");
      panel.dataset.seconds = m.seconds.toFixed(1);
      panel.dataset.tokens = String(m.tokens);
    }
  });
  send({ type: "ask", id, question: q });
}

// ---------- Quiz (from content templates; no model required) ----------
let grading = "";
let currentQ: QuizQuestion | null = null;
let options: Option[] = [];
let round: Round | null = null;
const qById = (id: string) => quizBank.find((q) => q.id === id)!;

function renderScore(updateProgress = true) {
  const r = round;
  const right = r ? roundRight(r) : 0;
  const total = r ? roundTotal(r) : ROUND_LENGTH;
  if (updateProgress) $("progress").textContent = r ? progressText(r) : `Question 1 of ${ROUND_LENGTH}`;
  $("score").textContent = `Score: ${right} / ${r ? r.results.length : 0}`;
  $("score-belt").innerHTML = scoreBelt(right, total);
}

function newRound() {
  const pool = quizForGrading(quizBank, grading || undefined);
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const rand = seededRandom(seed);
  const ids = orderIdsByMisses(
    pool.map((q) => q.id),
    loadAttempts(),
    rand,
  ).slice(0, ROUND_LENGTH);
  round = { ids, results: [] };
  show("quiz-end", false);
  show("quiz-play");
  nextQuestion();
}

function showEnd() {
  const r = round!;
  const right = roundRight(r),
    total = roundTotal(r);
  $("end-title").textContent = `You got ${right} out of ${total}!`;
  $("end-belt").innerHTML = scoreBelt(right, total, 200);
  $("end-line").textContent = encouragement(right, total);
  const miss = missed(r);
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  $("end-missed").innerHTML = miss.length
    ? `<h3>Let's practise these:</h3><ul class="missed">${miss
        .map((m) => {
          const n = qById(m.id);
          return `<li><span class="mq">${esc(n.prompt)}</span><span class="ma">✅ ${esc(optionLabel(n.answer))}</span></li>`;
        })
        .join("")}</ul>`
    : "";
  show("quiz-play", false);
  show("quiz-end");
  $("end-title").focus({ preventScroll: false });
}

function nextQuestion() {
  if (!round) return newRound();
  const id = currentId(round);
  if (!id) return showEnd();
  currentQ = qById(id);
  renderScore();
  options = buildOptionsFromQuestion(currentQ, Math.random);
  const item = itemById(bundle, currentQ.itemId);
  const note = notes.find((n) => n.id === currentQ!.itemId);
  $("quiz-meta").innerHTML = `${note ? topicChip(note) : ""}${gradingBadge(currentQ.grading)}`;
  $("quiz-q").textContent = currentQ.prompt;
  $("quiz-diagram").innerHTML = note && isChonji(note) ? chonjiDiagram() : "";
  const box = $("options");
  box.innerHTML = "";
  options.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "big option";
    b.dataset.correct = String(o.correct);
    b.innerHTML = `<span class="opt-key" aria-hidden="true">${"ABC"[i]}</span><span>${optionLabel(o.text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</span>`;
    b.onclick = () => choose(i);
    box.append(b);
  });
  show("quiz-result", false);
  show("next-btn", false);
  (box.firstElementChild as HTMLButtonElement | null)?.focus({ preventScroll: true });
  void item;
}

function choose(i: number) {
  const q = currentQ;
  if (!q) return;
  const picked = options[i];
  const buttons = [...$("options").querySelectorAll<HTMLButtonElement>("button")];
  buttons.forEach((b, k) => {
    b.disabled = true;
    if (options[k].correct) b.classList.add("is-right");
    if (k === i && !picked.correct) b.classList.add("is-wrong");
    if (k === i) b.setAttribute("aria-pressed", "true");
  });
  round = recordAnswer(round!, picked.correct, picked.text);
  saveAttempts(recordAttempt(loadAttempts(), q.id, picked.correct));
  renderScore(false);
  $("next-btn").textContent = isRoundOver(round) ? "See my score 🏁" : "Next question ➡️";
  const box = $("quiz-result");
  box.className = `answer ${picked.correct ? "right" : "wrong"}`;
  const head = picked.correct
    ? `✅ Yes! ${optionLabel(q.answer)}.`
    : `🙂 Not quite. The answer is: ${optionLabel(q.answer)}.`;
  const official = q.revealOfficial
    ? `<p class="official"><strong>Official ITF wording (${q.revealOfficial.source}):</strong> ${escapeHtml(q.revealOfficial.text)}</p>`
    : "";
  const simple = `<p class="simple"><strong>In simple words:</strong> ${escapeHtml(q.revealSimple)}</p>`;
  const whyBtn =
    askReady && !picked.correct
      ? `<button type="button" id="learn-why" class="quiet">Learn why</button><p id="learn-why-out" class="helper" hidden></p>`
      : "";
  box.innerHTML = `<p class="verdict"></p>${picked.correct ? "" : official + simple}${whyBtn}`;
  box.querySelector(".verdict")!.textContent = head;
  show("quiz-result");
  show("next-btn");
  if (picked.correct) celebrate(box);
  const why = box.querySelector<HTMLButtonElement>("#learn-why");
  if (why) {
    why.onclick = () => learnWhy(q.itemId);
  }
  $("next-btn").focus({ preventScroll: true });
}

function learnWhy(itemId: string) {
  if (!askReady) return;
  const out = $("learn-why-out");
  const btn = $<HTMLButtonElement>("learn-why");
  btn.disabled = true;
  out.hidden = false;
  out.setAttribute("aria-busy", "true");
  out.textContent = "Thinking…";
  const id = nextId++;
  pending.set(id, (m) => {
    if (m.type === "answer" || m.type === "error") {
      pending.delete(id);
      out.removeAttribute("aria-busy");
      btn.disabled = false;
      if (m.type === "error") {
        out.textContent = `Oops: ${m.message}`;
        return;
      }
      const body = `<p class="helper-label">Helper explanation</p><div class="answer-body">${escapeHtml(plain(m.text))}</div>`;
      out.innerHTML = answerChromeHtml(body, m.how, "why");
      wireHowToggle(out, "why");
      out.dataset.source = m.how.source;
    }
  });
  send({ type: "why", id, itemId });
}

const MODES = ["learn", "ask", "quiz"] as const;
function tab(which: (typeof MODES)[number]) {
  for (const m of MODES) show(m, m === which);
  if (which === "quiz" && !round) newRound();
}

function wireAppShell() {
  renderChips();
  renderLearn($("learn"), notes);
  renderScore();
  $("download").onclick = () => startLoad("download");
  $("retry").onclick = async () => {
    if (!choice) {
      openWithoutModel(RECOVER_NO_GPU_MESSAGE, "no-gpu");
      return;
    }
    const state = await modelCacheState();
    const alreadyReady = !!localStorage.getItem(DOWNLOADED_KEY);
    startLoad(state === "cached" || alreadyReady ? "cached" : state);
  };
  const lookAround = () => {
    openWithoutModel(
      "You can browse Learn and Quiz now. Tap Try again later if you want Ask — we keep anything already saved on this device.",
      "ask-later",
    );
  };
  $("look-around").onclick = lookAround;
  $("look-around-setup").onclick = lookAround;
  $("look-around-loading").onclick = lookAround;
  $("ask-btn").onclick = ask;
  $("next-btn").onclick = nextQuestion;
  $("again-btn").onclick = newRound;
  $("reset-progress").onclick = () => {
    clearAttempts();
  };
  wireTablist(document.querySelector<HTMLElement>("nav.tabs")!, (i) => tab(MODES[i]));
  renderBelts();
  $("question").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (askBusy) return;
      ask();
    }
  });
  document.querySelectorAll<HTMLButtonElement>("#grading-seg button").forEach((b) => {
    b.onclick = () => {
      grading = b.dataset.g ?? "";
      document.querySelectorAll("#grading-seg button").forEach((x) => x.classList.toggle("active", x === b));
      newRound();
    };
  });
}

/** Browse Learn/Quiz without Ask. `no-gpu` is a missing WebGPU browser; `ask-later` is download/setup. */
function openWithoutModel(reason: string, mode: "no-gpu" | "ask-later" = "ask-later") {
  askReady = false;
  $("no-gpu-why").textContent = reason;
  $("no-gpu-title").textContent =
    mode === "no-gpu" ? "Ask needs a newer browser" : "Ask isn't ready yet";
  const hint = $("no-gpu-hint");
  if (hint) hint.hidden = mode !== "no-gpu";
  show("no-gpu");
  show("ask-form", false);
  show("ask-unavailable");
  $("ask-unavailable-label").textContent =
    mode === "no-gpu" ? "Ask isn't available on this browser" : "Ask isn't ready yet";
  $("ask-unavailable-body").textContent =
    mode === "no-gpu"
      ? "Ask needs WebGPU to run the AI model on this device. Learn and Quiz still work without it."
      : "The download didn't finish (or hasn't started). Learn and Quiz still work — tap Try again later for Ask.";
  wireAppShell();
  screen("app");
  tab("learn");
}

async function init() {
  wireInstallUi({
    button: $<HTMLButtonElement>("install-btn"),
    sheet: $("ios-install"),
    sheetClose: $("ios-install-close"),
    sheetDismiss: $("ios-install-dismiss"),
  });
  if (import.meta.env.PROD) {
    swUpdate = registerServiceWorker(`${import.meta.env.BASE_URL}sw.js`, {
      banner: $("sw-update"),
      refreshBtn: $<HTMLButtonElement>("sw-update-btn"),
    });
  }
  const why =
    params.get("simulate") === "unsupported"
      ? "Simulated: this browser is missing features Grading Buddy needs (secure context / WebAssembly)."
      : unsupportedReason();
  if (why) {
    $("unsupported-why").textContent = why;
    screen("unsupported");
    return;
  }
  const isiPhone = isiPhoneDevice();
  if (params.get("simulate") === "recover") {
    wireAppShell();
    $("error-text").textContent = recoverLoadMessage(isiPhone);
    screen("error");
    return;
  }
  const forceNoGpu = params.get("simulate") === "nogpu";
  const picked = forceNoGpu ? null : await pickDevice();
  const loadAttempted = localStorage.getItem(LOAD_ATTEMPTED_KEY) === "1";
  if (!picked) {
    openWithoutModel(
      loadAttempted
        ? RECOVER_NO_GPU_MESSAGE
        : "This phone's browser can't run the on-device AI (it needs WebGPU). You can still use Learn and Quiz offline.",
      "no-gpu",
    );
    return;
  }
  choice = picked;
  $("size-label").textContent = sizeLabel();
  if (choice.device === "wasm") {
    $("mode-note").textContent =
      "🐢 No WebGPU here, so Grading Buddy will run in slow mode on the CPU. Answers can take a while, and phones may run out of memory.";
  } else if (isiPhone) {
    $("mode-note").textContent =
      "📱 On iPhone, keep this tab open until it finishes. If the page reloads by itself, use Safari or a computer — phone browser tabs can run out of memory with this download.";
  }
  wireAppShell();
  const state = await modelCacheState();
  const boot = startupScreen(state, loadAttempted);
  if (boot === "load-cached") startLoad("cached");
  else if (boot === "recover") {
    $("error-text").textContent = recoverLoadMessage(isiPhone);
    screen("error");
  } else screen("setup");
}

init();
