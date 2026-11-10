// All model work happens here so the page stays responsive.
import { env, pipeline, type TextGenerationPipeline } from "@huggingface/transformers";
import { activeContent } from "./belt-notes.ts";
import { planAsk, finaliseAsk, gatedAskResult, stripThinking, finaliseLearnWhy } from "../../shared/answer.ts";
import { itemFacts } from "../../shared/content.ts";
import { whyMessages, type ChatMessage } from "../../shared/prompt.ts";
import { CONFIG } from "../../shared/config.ts";
import { ORT_ENGINE_CACHE, isWasmMagic, ortCdnWasmUrl, ortLocalUrls } from "../../shared/ort.ts";
import { stagedLoadError, type LoadStage } from "../../shared/load-recovery.ts";
import type { ToWorker, FromWorker, Device } from "./messages.ts";

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useWasmCache = false;
const onnx = env.backends.onnx as any;
const localBase = new URL(import.meta.env.BASE_URL, self.location.origin).href;
const localOrt = ortLocalUrls(localBase);
const cdnWasm = ortCdnWasmUrl();

const bundle = activeContent();
let generator: TextGenerationPipeline | null = null;
let device: Device = "webgpu";
let stage: LoadStage = "model-download";

function fail(stageNow: LoadStage, err: unknown, host?: string): never {
  const raw = err instanceof Error ? err.message : String(err ?? "unknown error");
  throw new Error(stagedLoadError(stageNow, raw, host));
}

async function ensureOrtEngine() {
  stage = "engine-download";
  post({ type: "status", text: "Getting the AI engine…" });
  onnx.wasm.wasmPaths = { mjs: localOrt.mjs, wasm: cdnWasm };

  let bytes: ArrayBuffer | null = null;
  try {
    const cache = await caches.open(ORT_ENGINE_CACHE);
    const hit = await cache.match(cdnWasm);
    if (hit) bytes = await hit.arrayBuffer();
  } catch {
    /* cache read optional */
  }

  if (!bytes) {
    try {
      const res = await fetch(cdnWasm);
      if (!res.ok) fail("engine-download", `HTTP ${res.status}`, "cdn.jsdelivr.net");
      bytes = await res.arrayBuffer();
    } catch (err) {
      fail("engine-download", err, "cdn.jsdelivr.net");
    }
    if (!isWasmMagic(bytes!)) {
      fail("engine-download", "expected magic word 00 61 73 6d (damaged file)", "cdn.jsdelivr.net");
    }
    try {
      const cache = await caches.open(ORT_ENGINE_CACHE);
      await cache.put(
        cdnWasm,
        new Response(bytes!.slice(0), { headers: { "Content-Type": "application/wasm" } }),
      );
    } catch {
      /* quota */
    }
  } else if (!isWasmMagic(bytes)) {
    fail("engine-start", "expected magic word 00 61 73 6d (damaged file)");
  }

  onnx.wasm.wasmBinary = bytes;
}

async function load(dev: Device, dtype: string) {
  device = dev;
  const t0 = performance.now();
  await ensureOrtEngine();

  stage = "model-download";
  let sawNetwork = false;
  let sawComplete = false;
  try {
    generator = (await pipeline("text-generation", CONFIG.modelId, {
      device: dev,
      dtype: dtype as any,
      session_options: CONFIG.sessionOptions as any,
      progress_callback: (p: any) => {
        if (p.status === "download") {
          sawNetwork = true;
          stage = "model-download";
        }
        if (p.status === "progress_total") {
          post({ type: "progress", loaded: p.loaded, total: p.total, fromCache: !sawNetwork });
          if (p.total && p.loaded >= p.total) {
            sawComplete = true;
            stage = sawNetwork ? "model-save" : "engine-start";
          }
        }
        if (p.status === "done" || p.status === "ready") stage = "engine-start";
        if (p.status === "initiate" && p.file) post({ type: "status", text: `Loading ${p.file}` });
      },
    })) as TextGenerationPipeline;
  } catch (err) {
    const failStage: LoadStage =
      sawComplete && stage === "model-download"
        ? "model-save"
        : stage === "model-download" || stage === "model-save" || stage === "engine-start"
          ? stage
          : "engine-start";
    fail(failStage, err, failStage === "model-download" ? "huggingface.co" : undefined);
  }

  stage = "engine-start";
  post({ type: "status", text: "Warming up…" });
  post({ type: "ready", device: dev, dtype, loadSeconds: (performance.now() - t0) / 1000 });
}

async function generate(messages: ChatMessage[], maxNewTokens: number) {
  if (!generator) throw new Error("Model not loaded");
  const g = generator;
  const t0 = performance.now();
  const out: any = await g(messages as any, {
    max_new_tokens: maxNewTokens,
    ...CONFIG.generation,
    tokenizer_encode_kwargs: { enable_thinking: false },
  } as any);
  const raw = String(out[0].generated_text.at(-1).content ?? "");
  const text = stripThinking(raw);
  return {
    text,
    raw,
    seconds: (performance.now() - t0) / 1000,
    tokens: g.tokenizer.encode(text).length,
  };
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load(msg.device, msg.dtype);
    } else if (msg.type === "ask") {
      const plan = planAsk(bundle, msg.question);
      if (plan.kind === "gated") {
        const final = gatedAskResult(plan);
        post({
          type: "answer",
          id: msg.id,
          text: final.text,
          sources: final.sources,
          gated: true,
          tokens: 0,
          seconds: 0,
          how: final.how,
          usedCard: false,
        });
        return;
      }
      // No streaming: show Thinking… in the UI, then the final answer.
      const r = await generate(plan.messages, CONFIG.maxNewTokens);
      const final = finaliseAsk(r.raw, plan, { tokens: r.tokens, seconds: r.seconds });
      post({
        type: "answer",
        id: msg.id,
        text: final.text,
        sources: final.sources,
        gated: final.gated,
        tokens: r.tokens,
        seconds: r.seconds,
        how: final.how,
        usedCard: final.usedCard,
      });
    } else if (msg.type === "why") {
      const item = bundle.items.find((i) => i.id === msg.itemId);
      if (!item || !generator) {
        post({ type: "error", id: msg.id, message: "Learn why needs the model and a quiz item." });
        return;
      }
      const facts = itemFacts(item, bundle);
      const r = await generate(whyMessages(facts), 80);
      const final = finaliseLearnWhy({
        item,
        facts,
        raw: r.raw,
        tokens: r.tokens,
        seconds: r.seconds,
      });
      post({
        type: "answer",
        id: msg.id,
        text: final.text,
        sources: [item.title],
        gated: false,
        tokens: r.tokens,
        seconds: r.seconds,
        how: final.how,
        usedCard: final.usedCard,
        helper: true,
      });
    }
  } catch (err: any) {
    const message = `${err?.message ?? err}${device === "wasm" ? " (slow mode)" : ""}`;
    post({ type: "error", id: (msg as any).id, message });
  }
};
