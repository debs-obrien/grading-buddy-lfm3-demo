# Grading Buddy

LFM3-1.7B running offline, on your device, in the browser.

Can a small Liquid model do a real job with no signal? I built a study buddy for my kids' first Taekwon-Do gradings to find out. It runs [LFM3-1.7B](https://huggingface.co/LiquidAI/LFM3-1.7B) with Transformers.js on WebGPU. No server, no account, no API key. Once the model is downloaded, it works offline.

![Grading Buddy in a desktop browser: asked "What does charyot mean?", LFM3 answers on the device that charyot means attention.](docs/grading-buddy-desktop.png)

- **Live demo:** https://grading-buddy-lfm3-demo.pages.dev
- **Video walkthrough:** TODO(Debbie): YouTube link

## The problem

Between classes my kids forget the Korean words, the tenets and the moves of their first pattern, Chon-Ji. A chatbot will happily make things up, needs signal, and sends their questions off the phone. I wanted something that only answers from notes I've checked, and says so when it doesn't know.

## Quick start

You need Node 22.18 or newer (I used 24). Desktop only (a desktop browser with WebGPU).

```bash
git clone https://github.com/debs-obrien/grading-buddy-lfm3-demo.git
cd grading-buddy-lfm3-demo
npm ci
npm run dev
```

Open http://localhost:5173, press **Download and start** (about 1.09 GB, once) and ask "What does charyot mean?". `npm test` runs the tests. `npm run build` then `npm run preview` lets you try it offline.

## How it works

- LFM3-1.7B (q4f16) runs in a Web Worker on WebGPU with Transformers.js.
- A service worker caches the app and the browser keeps the model, so it works offline.
- Topic match picks the grading topic that best fits your question and gives the model that topic's facts.
- If nothing matches, the app says it's not part of the white to yellow belt grading and skips the model.
- The model answers in a sentence or two from those facts. A grounding check (Korean terms, numbers, type) and a required-facts check must pass; if either fails, the UI shows the note card labelled **From the notes** instead.
- Quiz questions and grading are plain code, straight from the notes (no model). Optional **Learn why** after a wrong answer is written by LFM3, with the same kind of check and a note fallback.

## Why this model, approach and runtime

| Choice | Why | What it cost |
|---|---|---|
| **LFM3-1.7B** ([ONNX export](https://huggingface.co/onnx-community/LFM3-1.7B-ONNX), q4f16) | The text model in the LFM3 family: small enough for on-device Ask, strong at following “answer only from these facts” instructions, and the ONNX export is Liquid’s documented web path. | A **1.09 GB** first download (q4f16). Without the notes and checks it can invent Korean words and advice. |
| **Transformers.js + WebGPU** | One static link, no server and no API key: the model runs in a Web Worker in the browser and works offline after the first download. | **Desktop only** (needs WebGPU). My CPU fallback failed twice, so there isn’t one. Slower than a native llama.cpp build. |
| **Topic match + LFM3 answers + grounding / required-facts checks, no fine-tune** | Fast to build and easy to check: match a whole topic, let LFM3 write one or two sentences from that topic’s facts, then either keep the answer or fall back to the note card. You can edit the notes without retraining. | When the grounding or required-facts check fails, the UI shows **From the notes** instead of the model’s wording. One frozen-eval miss remains (see [docs/eval.md](docs/eval.md)). |
| **Greedy decoding** | The same question gives the same answer, so the eval is repeatable. | Ignores the model card’s suggested sampling settings, so some sentences are flatter than a sampled run. |

## Does it work?

The eval runs the app's topic match, prompt, grounding check and required-facts check on Node, on the CPU (q4 instead of q4f16), so you don't need a GPU.

```bash
npm run eval:match   # topic match / refusal only
npm run eval         # with notes, like the app (grounded Ask)
```

This repo has no `--no-retrieval` or `--open` baselines, so there is no no-notes column here. Every number below is from the same frozen question set (`eval/questions.json`).

| | With notes (topic match + checks) |
|---|---|
| Grading questions right | **42 / 43** |
| Off-topic questions declined | **13 / 13** |

With notes, a real answer was: "Charyot means attention. When you hear charyot, you stand up straight in attention stance, quiet and still, ready to listen." The one graded wrong was "Why do I pull my toes back?" (model said to hit with the ball of the foot and mentioned the knee; the frozen `forbid_re` still fails that wording even though the notes include knee). Of the 43 in-scope answers, 36 kept **Written by LFM3 on this device** and 7 fell back to **From the notes**. Tokens/s on that Node CPU run: **4.5** (`eval/results/grounded.json`, an Intel Xeon x4 server CPU, not a Mac browser). It's small and keyword-graded, so it's a sanity check, not a benchmark. More in [docs/eval.md](docs/eval.md).

## Where it falls short

- The first download is big, and you need WebGPU.
- I tested on iPhone and the part that loads the LFM model failed, so it's desktop only for now.
- Speed numbers I have so far are Node CPU eval figures, not Mac browser timings yet. TODO(Debbie): Mac desktop browser times.
- Quiz "Learn why" is written by LFM3, but if its check fails you get the note instead.
- The notes are still a draft, so always follow your instructor.

## With more time

- Fine-tune with Liquid's [DPO notebook](https://colab.research.google.com/github/Liquid4All/cookbook/blob/main/finetuning/notebooks/lfm3_dpo_with_trl.ipynb) to answer from the notes or decline, and re-run the eval.
- Try [llama.cpp with LFM3-1.7B-GGUF](https://docs.liquid.ai/deployment/on-device/llama-cpp) natively and compare it with the desktop browser.
- Measure real speed and memory on a Mac desktop browser.
- Add a CPU fallback for browsers without WebGPU, and more belts.

## How I used AI

TODO(Debbie): put this in your own words.

- **Tools:** TODO
- **What's mine:** the problem, the scope, the model and runtime choices, what to cut, and checking the notes. TODO
- **What I changed or rejected:** TODO(Debbie): what I changed or rejected

## Licences and sources

**Model:** LFM3-1.7B by Liquid AI under the [LFM Open License v1.0](https://docs.liquid.ai/lfm/help/model-license) (downloaded at runtime, not in this repo; commercial use limited for companies with $10M+ annual revenue). **Code:** MIT. **Notes:** CC BY-SA 4.0. Sources: `data/belts/white-yellow/SOURCES.md` and `NOTICE`.
