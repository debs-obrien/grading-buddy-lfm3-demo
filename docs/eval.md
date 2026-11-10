# Eval, model choice, browser notes, deploy notes

Longer write-up that used to live in the README. The short story is in [README.md](../README.md). Numbers below must match the latest frozen-set runs in `eval/results/`.

## Frozen eval set

Frozen set: v1’s questions plus `what korean words do i need to know`, `what are the korean words for counting`, ordered count-to-10, and Chon-Ji moves. **Never edit `eval/questions.json` to make a run pass.**

Commands:

```bash
npm run eval:match   # topic match / refusal only (no model)
npm run eval         # full grounded Ask with the real model (Node CPU, q4)
```

This repo does **not** ship `--no-retrieval` or `--open` baselines. Only grounded Ask and match-only exist. Do not invent no-notes columns.

The grounded eval runs the app’s topic match, prompt, grounding check and required-facts check on Node, on the CPU (q4 instead of browser q4f16), so you do not need a GPU. First run downloads the model into `.cache/models`.

## Latest grounded numbers

Filled from the latest `npm run eval` on the machine named in `eval/results/grounded.json` → `summary.machine`. Browser WebGPU tokens/s are not claimed unless a real GPU browser run was done and filed here.

| Set | Result |
|---|---|
| In-scope | **42/43** correct (Node CPU q4; `eval/results/grounded.json`) |
| Of those answers | **Written by LFM3:** 36 · **From the notes:** 7 |
| Out-of-scope | **13/13** correctly declined |
| Quality | **2/4** (sentence / meta-reasoning - no further prompt tuning) |
| Match-only | **43/43** in-scope + **13/13** correctly declined (`npm run eval:match`) |
| Tokens / sec | **4.5** on Node CPU for that run (`summary.tokens_per_second` in `eval/results/grounded.json`; machine `Intel(R) Xeon(R) Processor x4, 17 GB RAM, Node v22.23.4`; desktop/server CPU, not Mac browser, not phone) |

Trust rule: the answer falls back to the note card (**From the notes**) when it uses Korean terms, numbers, type or body parts that are not in the facts, or when it misses a required fact (required facts come from content, not the eval file). Messy or cut-off answers can still pass those checks and keep the LFM3 label. Chosen approach when falling back: **full note card only** (simpler than splicing model prose + a notes appendix - one label, one source of truth).

### From the notes (7) - check / required-fact fallbacks

Including: Chon-Ji meaning / move-count when **19** (or other identity facts) are missing; thin glossary coverage; counting answers that omit the required Korean number word; belt/oath after an unclosed `<think>` strip left too little prose (think leak no longer injects rogue numbers into the check).

### In-scope wrong with LFM3 label (1) - frozen forbid_re vs notes

| Question | Notes |
|---|---|
| `Why do I pull my toes back?` | Model answer matches the notes (“Lift your knee… ball of your foot”). Content `front-snap-kick-apcha-busigi.simple` **includes knee**. Frozen `forbid_re` has `\\bknee\\b`, so the eval marks it wrong even though the grounding check correctly allows knee (body-part claims must appear in the facts - and knee does). **Do not edit the frozen eval.** Falling back to the note would still contain “knee” and still fail `forbid_re`. |

The toes case above is the forbid_re conflict, not a content-check fallback.

## Model-family and runtime detail

The short **Why this model, approach and runtime** table (Why / What it cost) stays in [README.md](../README.md). This section is the longer technical detail only.

We need a small instruction-following model that can answer from a short set of facts on-device. LFM3-1.7B is Liquid’s text model aimed at local agents. The [onnx-community ONNX export](https://huggingface.co/onnx-community/LFM3-1.7B-ONNX) is the path Liquid documents for the web with Transformers.js and WebGPU. We stay on **1.7B**, not the VL / Audio / Omni variants, because this demo is text questions about grading notes, not photos or speech.

| Piece | Choice |
|---|---|
| Model | `onnx-community/LFM3-1.7B-ONNX` (q4f16 on WebGPU, 1.09 GB) |
| Library | `@huggingface/transformers` 4.3.2 |
| Decode | Greedy (`do_sample: false`, `repetition_penalty: 1.05`) |
| Thinking | `enable_thinking: false`; any `<think>` tags are stripped |
| Answers | No token streaming. UI shows “Thinking…” then the final answer (`aria-live="polite"`, `aria-busy`) |
| ORT wasm | Small `.mjs` shipped in `dist/ort/`; large asyncify `.wasm` fetched from jsDelivr, magic-checked, cached (Cloudflare Pages 25 MiB limit; never pre-gzip) |

## How Ask works (detail)

1. Pain / injury / medicine → fixed reply, no model.
2. Match the question to a whole topic from `data/belts/white-yellow/content.json`.
3. No match → `Sorry, that's not part of the white to yellow belt grading.`
4. LFM3 writes one or two sentences from the whole topic’s facts.
5. Check: every Korean term and number in the answer must appear in those facts, or we show the item card instead (**From the notes**). Required facts derived from content can also force that fallback. Official ITF wording is always rendered from the content file, never retyped by the model.

Counting 1-10 is **one** item. A glossary is built from every item that has a Korean term.

Every Ask answer and every Quiz **Learn why** explanation shows a source label:

- **Written by LFM3 on this device** - the model’s checked answer (or Learn why).
- **From the notes** - fixed replies, item cards, check fallbacks, safety decline, or off-topic refusal.

Under that, **Show how this was answered** is a collapsible panel with the matched topic and items, the raw model output, token count, generation time, tokens/sec, and the check result.

## How Quiz works (detail)

Questions come from templates over the content (term↔meaning, numbers, tenets, belts, Chon-Ji). Seeded shuffle so the same seed gives the same round. Graded with no model. After a wrong answer, the correct option and the item show straight away. Optional **Learn why** (only when the model is loaded) asks LFM3 for a helper explanation grounded in that one item; if the grounding check fails (or the text is too thin), `finaliseLearnWhy` shows the note instead (**From the notes**).

## Browser and device notes

- **Ask needs WebGPU** in a desktop browser. Learn + Quiz work without the model.
- Speed numbers in this doc are from **Node CPU** eval runs unless labelled otherwise. Mac or other desktop browser timings belong here only when someone measured them on that machine.
- Phone browsers are memory-tight for a ~1 GB ONNX brain. This demo’s Ask path is desktop WebGPU only.

### iOS memory mitigation (attempt that did not work)

An iPhone Safari tab has about 2 GB of memory. The model plus runtime come close to that, so the tab can crash. Installing the PWA does not add memory.

The codebase includes an ONNX Runtime session option aimed at iOS Safari memory (`optimization.disable_specified_optimizers: ConstantFolding`, see onnxruntime issue #33793, wired in `shared/config.ts`). That was an attempt to keep the load alive on phone WebKit. **It did not make Ask reliable on iPhone.** Treat it as a failed mitigation, not a working phone path. The honest next step is a native shell with **llama.cpp** / GGUF (Liquid’s recommended phone route), checked for example via PocketPal with the LFM3-1.7B GGUF.

## Trade-offs

- Web demo for the interview path; phones are memory-tight for this ONNX size.
- Greedy decoding is repeatable but not always the prettiest sentence.
- The grounding / required-facts checks can fall back to the item card when the model invents a Korean word or number, or omits a required fact. Better a card than a wrong fact.
- Official quotes are frozen character-for-character; kid “simple” lines are ours.

## What we’d do with more time

- Native shell with llama.cpp / GGUF after PocketPal proves the phone path.
- Practice eval set for prompt tuning (keep the frozen set untouched).
- More belts as separate content modules (green is stubbed as “coming soon”).
- Real device timings on a Mac Chrome run, reported honestly and labelled.
- Optional no-notes baselines (`--no-retrieval` / `--open`) if we want the old v1 comparison columns again, on the same frozen question set.

## Deploy notes (from the old README)

Deploy script (does **not** run deploy; only checks and prints the wrangler command):

```bash
./deploy.sh
# then, when you mean to publish:
# npx wrangler pages deploy dist --project-name grading-buddy-lfm3-demo
```

Live demo (when published): https://grading-buddy-lfm3-demo.pages.dev

Full Cloudflare Pages / ORT wasm detail lives in `DEPLOY.md` (not duplicated here). Do not pre-gzip the asyncify `.wasm`. Pages rejects files over 25 MiB; the worker fetches that wasm from jsDelivr, magic-checks it, and caches it.
