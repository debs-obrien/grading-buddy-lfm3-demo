# Grading Buddy (LFM3 demo)

An offline PWA that helps kids study ITF Taekwon-Do for white to yellow belt grading. It has **Learn**, **Quiz** and **Ask**. Ask runs **LFM3-1.7B** in the browser (Liquid’s documented web path: Transformers.js + ONNX + WebGPU). There is no server and no account. After the first download it works with no signal at the dojang.

Scope: ITF only. Grading 1 is 10th to 9th kup. Grading 2 is 9th to 8th kup (including Chon-Ji’s 19 moves and counting 1 to 10).

This repo is **private**.

## Why LFM3-1.7B

We need a small instruction-following model that can answer from a short set of facts on-device. LFM3-1.7B is Liquid’s text model aimed at local agents. The [onnx-community ONNX export](https://huggingface.co/onnx-community/LFM3-1.7B-ONNX) is the path Liquid documents for the web with Transformers.js and WebGPU. We stay on **1.7B** — not the VL / Audio / Omni variants — because this demo is text questions about grading notes, not photos or speech.

## Runtime

| Piece | Choice |
|---|---|
| Model | `onnx-community/LFM3-1.7B-ONNX` (q4f16 on WebGPU, ~1.1 GB) |
| Library | `@huggingface/transformers` 4.3.2 |
| Decode | Greedy (`do_sample: false`, `repetition_penalty: 1.05`) |
| Thinking | `enable_thinking: false`; any `<think>` tags are stripped |
| Answers | No token streaming — UI shows “Thinking…” then the final answer (`aria-live="polite"`, `aria-busy`) |
| ORT wasm | Small `.mjs` shipped in `dist/ort/`; large asyncify `.wasm` fetched from jsDelivr, magic-checked, cached (Cloudflare Pages 25 MiB limit; never pre-gzip) |

## Hardware

- **Works for Ask:** desktop Chrome or Edge with WebGPU; Android Chrome with WebGPU.
- **Learn + Quiz:** any modern browser, with or without WebGPU.
- **iPhone Safari:** each tab has about 2 GB of memory. The model plus runtime come close to that, so the tab can crash. Installing the PWA does not add memory. The next step is a native app with **llama.cpp** (Liquid’s recommended phone route). A PocketPal test with the LFM3-1.7B GGUF is how we check that path.

## How Ask works

1. Pain / injury / medicine → fixed reply, no model.
2. Match the question to a whole topic from `data/belts/white-yellow/content.json`.
3. No match → `Sorry, that's not part of the white to yellow belt grading.`
4. LFM3 writes one or two sentences from the whole topic’s facts.
5. Check: every Korean term and number in the answer must appear in those facts, or we show the item card instead. Official ITF wording is always rendered from the content file, never retyped by the model.

Counting 1–10 is **one** item. A glossary is built from every item that has a Korean term.

## Seeing what the model did

Every Ask answer and every Quiz **Learn why** explanation shows a source label:

- **Written by LFM3 on this device** — the model’s checked answer (or Learn why).
- **From the notes** — fixed replies, item cards, check fallbacks, safety decline, or off-topic refusal.

Under that, **Show how this was answered** is a collapsible panel (`aria-expanded`, labelled region) with the matched topic and items given to the model, the raw model output, token count, generation time, tokens/sec, and the check result (passed, or which term / number / type failed and fell back to the note). That is how developers can see the model doing real work on-device, not a canned string.

## How Quiz works

Questions come from templates over the content (term↔meaning, numbers, tenets, belts, Chon-Ji). Seeded shuffle so the same seed gives the same round. Graded with no model. After a wrong answer, the correct option and the item (official wording + source, plus the simple line) show straight away. Optional **Learn why** (only when the model is loaded) asks LFM3 for a helper explanation grounded in that one item.

## How to run

```bash
npm ci
npm test          # unit + provenance label tests
npm run typecheck
npm run build
npm run dev       # https://localhost:5173
```

Eval (downloads the model into `.cache/models` on first run; CPU, several minutes):

```bash
npm run eval:match   # topic match / refusal only
npm run eval         # full grounded Ask with the real model
```

Deploy script (does **not** run deploy — only checks and prints the wrangler command):

```bash
./deploy.sh
# then, when you mean to publish:
# npx wrangler pages deploy dist --project-name grading-buddy-lfm3-demo
```

## Eval (frozen)

Frozen set: v1’s questions plus `what korean words do i need to know`, `what are the korean words for counting`, ordered count-to-10, and Chon-Ji moves. **Never edit `eval/questions.json` to make a run pass.**

Numbers below are filled from the latest `npm run eval` on this machine (Node CPU). Browser WebGPU numbers are not claimed here unless a real GPU browser run was done.

| Set | Result |
|---|---|
| In-scope | 43/43 correct (Node CPU q4; `eval/results/grounded.json`) |
| Out-of-scope | 13/13 correctly declined |
| Quality | 2/4 (two answers over the short-sentence budget) |
| Match-only | 43/43 in-scope + 13/13 correctly declined (`eval/results/match-only.json`) |
| Tokens / sec | ~6.4 on this CPU box (browser WebGPU not claimed) |

When the model calls Chon-Ji a stance, the type check fails and the UI shows **From the notes** with the matched Chon-Ji items (pattern / heaven / earth / 19), not the bad model sentence.

## Trade-offs

- Web-only for this interview demo; phones are memory-tight for a ~1 GB ONNX brain.
- Greedy decoding is repeatable but not always the prettiest sentence.
- The grounding check can fall back to the item card when the model invents a Korean word or number — better a card than a wrong fact.
- Official quotes are frozen character-for-character; kid “simple” lines are ours.

## What we’d do with more time

- Native shell with llama.cpp / GGUF after PocketPal proves the phone path.
- Practice eval set for prompt tuning (keep the frozen set untouched).
- More belts as separate content modules (green is stubbed as “coming soon”).
- Real device timings on Debbie’s Mac Chrome and an iPhone Safari attempt, reported honestly.

## Licences

- Code: MIT (see `LICENSE`).
- Content: CC BY-SA 4.0; Chon-Ji move list adapted from Wikipedia “Chon-Ji (teul)”. Official ITF wording quoted from the sources in `data/belts/white-yellow/SOURCES.md` (see `NOTICE`).
- Model weights: LFM Open License v1.0 (downloaded at runtime, not in this repo).
