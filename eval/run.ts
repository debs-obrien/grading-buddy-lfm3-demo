// npm run eval            -> grounded Ask (topic match + model + check)
// npm run eval -- --match-only   -> topic match / refusal only (no model)
// npm run eval -- --limit 5
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { env, pipeline } from "@huggingface/transformers";
import { loadBeltContent } from "../shared/belt-fs.ts";
import { topicFacts } from "../shared/content.ts";
import { planAsk, finaliseAsk, stripThinking, isDecline } from "../shared/answer.ts";
import { CONFIG, DECLINE } from "../shared/config.ts";
import { gradeInScope, gradeOutOfScope, gradeQuality } from "./grade.ts";
import type { ChatMessage } from "../shared/prompt.ts";

const args = process.argv.slice(2);
const matchOnly = args.includes("--match-only");
const qualityOnly = args.includes("--quality-only");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const dtype = (process.env.EVAL_DTYPE ?? "q4") as "q4";

env.cacheDir = process.env.MODEL_CACHE_DIR ?? path.resolve(".cache/models");

const root = path.resolve(import.meta.dirname, "..");
const bundle = loadBeltContent();
const qs = JSON.parse(fs.readFileSync(path.join(root, "eval/questions.json"), "utf8"));

const mode = matchOnly ? "match-only" : "grounded";
console.log(`Model ${CONFIG.modelId} dtype ${dtype} on CPU, mode ${mode}`);

let gen: any = null;
let loadSeconds = 0;
if (!matchOnly) {
  const t0 = Date.now();
  gen = await pipeline("text-generation", CONFIG.modelId, { dtype, device: "cpu" });
  loadSeconds = (Date.now() - t0) / 1000;
  console.log(`Loaded in ${loadSeconds}s`);
}

let totalTokens = 0;
let totalGenSeconds = 0;

async function runModel(messages: ChatMessage[], question: string) {
  const t = Date.now();
  const out: any = await gen(messages as any, {
    max_new_tokens: CONFIG.maxNewTokens,
    ...CONFIG.generation,
    tokenizer_encode_kwargs: { enable_thinking: false },
  } as any);
  const secs = (Date.now() - t) / 1000;
  const raw = String(out[0].generated_text.at(-1).content ?? "");
  const text = stripThinking(raw);
  // Raw generated tokens (before strip) — matches the provenance panel.
  const tokens = gen.tokenizer.encode(raw).length;
  totalTokens += tokens;
  totalGenSeconds += secs;
  return {
    raw,
    text,
    secs,
    tokens,
    question,
    hitTokenCap: tokens >= CONFIG.maxNewTokens,
  };
}

async function ask(q: string) {
  const plan = planAsk(bundle, q);
  if (plan.kind === "gated") {
    return {
      answer: plan.text,
      gated: true,
      gateReason: plan.gateReason,
      topic: plan.match?.topic.id ?? null,
      secs: 0,
      tokens: 0,
    };
  }
  if (matchOnly) {
    // Prove matching only: grade against the whole topic's facts (not model prose).
    const answer = topicFacts(bundle, plan.match.topic.id);
    return {
      answer,
      gated: false,
      gateReason: null,
      topic: plan.match.topic.id,
      itemId: plan.cardItem.id,
      secs: 0,
      tokens: 0,
      matchOnly: true,
    };
  }
  const r = await runModel(plan.messages, q);
  const final = finaliseAsk(r.raw, plan, {
    tokens: r.tokens,
    seconds: r.secs,
    hitTokenCap: r.hitTokenCap,
  });
  const answer = final.text;
  return {
    answer: isDecline(answer) ? DECLINE : answer,
    gated: false,
    gateReason: null,
    topic: plan.match.topic.id,
    itemId: plan.cardItem.id,
    checkFailed: final.usedCard,
    source: final.how.source,
    label: final.how.label,
    path: final.how.path,
    check: final.how.check ?? null,
    rawModel: final.how.rawModel ?? r.raw,
    secs: r.secs,
    tokens: r.tokens,
  };
}

const inScope = [];
for (const item of qualityOnly ? [] : qs.in_scope.slice(0, limit)) {
  const r = await ask(item.q);
  // Match-only checks that the topic facts contain the keywords; forbid_re is for model wording.
  const outcome = gradeInScope(r.answer, item.expect, matchOnly ? undefined : item.forbid_re, {
    order: !!item.order,
  });
  inScope.push({ ...item, ...r, outcome });
  console.log(`[in ] ${outcome.padEnd(17)} ${item.q} -> ${r.answer.replace(/\s+/g, " ").slice(0, 140)}`);
}

const outScope = [];
for (const item of qualityOnly ? [] : qs.out_of_scope.slice(0, limit)) {
  const r = await ask(item.q);
  const outcome = gradeOutOfScope(r.answer);
  outScope.push({ ...item, ...r, outcome });
  console.log(`[out] ${outcome.padEnd(18)} ${item.q} -> ${r.answer.replace(/\s+/g, " ").slice(0, 140)}`);
}

const quality = [];
if (!matchOnly) {
  const headings = bundle.items.map((n) => n.title);
  for (const item of (qs.quality ?? []).slice(0, limit)) {
    const r = await ask(item.q);
    const g = gradeQuality(r.answer, item.expect, headings, item.maxSentences ?? 2);
    quality.push({ ...item, ...r, outcome: g.pass ? "pass" : "fail", problems: g.problems });
    console.log(`[qa ] ${(g.pass ? "pass" : "fail " + g.problems.join("; ")).padEnd(17)} ${item.q} -> ${r.answer.replace(/\s+/g, " ").slice(0, 140)}`);
  }
}

// Practice set of everyday phrasings (not frozen) — match-only or grounded.
const everyday = [];
for (const item of (qs.everyday_practice ?? []).slice(0, limit)) {
  const r = await ask(item.q);
  const outcome = gradeInScope(r.answer, item.expect, matchOnly ? undefined : item.forbid_re, {
    order: !!item.order,
  });
  everyday.push({ ...item, ...r, outcome });
  console.log(`[day] ${outcome.padEnd(17)} ${item.q} -> ${String(r.answer).replace(/\s+/g, " ").slice(0, 140)}`);
}

const count = (arr: any[], k: string) => arr.filter((x) => x.outcome === k).length;
const modelAnswers = inScope.filter((x) => x.source === "model").length;
const notesAnswers = inScope.filter((x) => x.source === "notes" || x.checkFailed).length;
const fallbacks = inScope
  .filter((x) => x.source === "notes" || x.checkFailed)
  .map((x) => ({
    id: x.id,
    q: x.q,
    path: x.path,
    check: x.check,
    rawModel: typeof x.rawModel === "string" ? x.rawModel.slice(0, 280) : null,
  }));
const summary = {
  model: CONFIG.modelId,
  dtype,
  device: matchOnly ? "none" : "cpu (onnxruntime-node)",
  mode,
  machine: `${os.cpus()[0]?.model} x${os.cpus().length}, ${Math.round(os.totalmem() / 1e9)} GB RAM, Node ${process.version}`,
  loadSeconds,
  in_scope: {
    total: inScope.length,
    correct: count(inScope, "correct"),
    wrong: count(inScope, "wrong"),
    wrongly_declined: count(inScope, "wrongly_declined"),
    written_by_lfm3: modelAnswers,
    from_the_notes: notesAnswers,
  },
  out_of_scope: {
    total: outScope.length,
    correctly_declined: count(outScope, "correctly_declined"),
    wrongly_answered: count(outScope, "wrongly_answered"),
  },
  quality: quality.length ? { total: quality.length, pass: count(quality, "pass") } : null,
  everyday_practice: everyday.length
    ? {
        total: everyday.length,
        correct: count(everyday, "correct"),
        wrong: count(everyday, "wrong"),
        wrongly_declined: count(everyday, "wrongly_declined"),
      }
    : null,
  tokens_per_second: totalGenSeconds ? Number((totalTokens / totalGenSeconds).toFixed(2)) : null,
  fallbacks,
};
console.log(JSON.stringify(summary, null, 2));
if (fallbacks.length) {
  console.log("\nFallbacks (From the notes):");
  for (const f of fallbacks) {
    const why = f.check
      ? f.check.summary
      : f.path === "model-decline"
        ? "model declined"
        : f.path ?? "notes path";
    console.log(`- ${f.id}: ${why}`);
  }
}

const outDir = path.join(root, "eval/results");
fs.mkdirSync(outDir, { recursive: true });
const name = `${mode}${qualityOnly ? "-quality" : ""}${Number.isFinite(limit) ? `-limit${limit}` : ""}.json`;
fs.writeFileSync(
  path.join(outDir, name),
  JSON.stringify({ ranAt: new Date().toISOString(), summary, inScope, outScope, quality, everyday }, null, 2),
);
console.log(`Saved eval/results/${name}`);
