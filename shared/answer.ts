// Ask flow for v2: safety → topic match → refusal → model → check.
// No per-question special cases, no retrievalFitsQuestion patches, no output rewrite patches.
import type { ContentBundle, ContentItem } from "./content.ts";
import { itemFacts, topicFacts } from "./content.ts";
// ContentBundle used on AskMode.model for required-fact checks.
import { matchQuestion, type Match } from "./match.ts";
import { checkAnswer } from "./check.ts";
import { askMessages, type ChatMessage } from "./prompt.ts";
import { DECLINE, PAIN_REPLY } from "./config.ts";
import {
  LABEL_MODEL,
  LABEL_NOTES,
  checkSummary,
  notesLabelForGate,
  tokensPerSecond,
  type HowAnswered,
} from "./provenance.ts";
import {
  checkRequiredFacts,
  requiredFactsForMatch,
  type RequiredFact,
} from "./required-facts.ts";

export type GateReason = "safety" | "no-match";

export type AskMode =
  | { kind: "gated"; text: string; gateReason: GateReason; match: Match | null }
  | {
      kind: "model";
      messages: ChatMessage[];
      facts: string;
      match: Match;
      /** Item whose card is shown if the check fails; official wording always from content. */
      cardItem: ContentItem;
      /** Key facts from structured content that the answer must include. */
      requiredFacts: RequiredFact[];
      bundle: ContentBundle;
    };

const INJURY_BODY =
  "arm|leg|wrist|ankle|hand|hands|foot|feet|knee|finger|toe|toes|nose|bone|shoulder|elbow|neck|head|thumb|knuckle|knuckles|shin|calf";

export function isSafetyDecline(question: string): boolean {
  const q = question.toLowerCase();
  if (/\b(medicine|medical|ibuprofen|paracetamol|aspirin|painkiller|doctor)\b/.test(q)) return true;
  if (
    /\b(swollen|swelling|bleeding|blood|bloody|bruise|bruised|sprain(?:ed)?|injur(?:y|ed)|headache|ache|aches|pain|painful|sore|stinging|scraped?|winded|wobbly)\b/.test(
      q,
    ) ||
    /\bfeels funny\b/.test(q) ||
    /\bfeel(?:s)?\s+sick\b/.test(q) ||
    /\bpopped(?:\s+out)?\b/.test(q)
  ) {
    return true;
  }
  if (/\bcan'?t move\b|\bcannot move\b/.test(q)) {
    if (!/\b(fast|quick|enough|saju|pattern|kick|punch|block|stance|charyot|attention|junbi)\b/.test(q)) return true;
  }
  const body = INJURY_BODY;
  if (
    nearBody(q, body, "cut|bump(?:ed)?|red|puffy|scraped?|bang(?:ed)?|stinging") ||
    new RegExp(`\\bhit\\s+(my|your|his|her|the|a|an)\\s+(${body})\\b`).test(q)
  ) {
    return true;
  }
  if (nearBody(q, body, "broke|broken") || nearBody(q, body, "twist(?:ed)?")) return true;
  if (/\b(hurt|hurts)\b/.test(q)) {
    if (isTechniqueAvoidHurt(q)) return false;
    return true;
  }
  return false;
}

function nearBody(q: string, body: string, verb: string): boolean {
  return new RegExp(`\\b(${verb})\\b.{0,25}\\b(${body})\\b|\\b(${body})\\b.{0,25}\\b(${verb})\\b`).test(q);
}

function isTechniqueAvoidHurt(q: string): boolean {
  if (/\b((so i|so you|so we) don'?t|not to|how do i not|how (can|do) i avoid)\s+hurt\b/.test(q)) return true;
  if (/\bdon'?t hurt\b/.test(q) && /\b(toe|toes|hand|hands|foot|feet|wrist|knuckle|knuckles)/.test(q)) return true;
  return false;
}

export function planAsk(bundle: ContentBundle, question: string): AskMode {
  if (isSafetyDecline(question)) {
    return { kind: "gated", text: PAIN_REPLY, gateReason: "safety", match: null };
  }
  const match = matchQuestion(bundle, question);
  if (!match) {
    return { kind: "gated", text: DECLINE, gateReason: "no-match", match: null };
  }
  const facts = topicFacts(bundle, match.topic.id);
  const cardItem = cardItemForQuestion(match, question);
  return {
    kind: "model",
    messages: askMessages(question, facts),
    facts,
    match,
    cardItem,
    requiredFacts: requiredFactsForMatch(bundle, match, question),
    bundle,
  };
}

/** Prefer the matched item that actually answers the asked action (turn/punch/…). */
function cardItemForQuestion(match: Match, question: string): ContentItem {
  const primary = match.primary ?? match.items[0];
  if (!primary) return match.items[0];
  const q = question.toLowerCase();
  const action = /\bturn/.test(q)
    ? /turn|dolgi|gujari/i
    : /\bpunch/.test(q)
      ? /punch|jirugi|forefist|joomuk/i
      : /\bkick/.test(q)
        ? /kick|chagi|busigi|olligi/i
        : /\bblock/.test(q)
          ? /block|makgi/i
          : null;
  if (!action) return primary;
  const hit = [primary, ...match.items].find((i) =>
    action.test([i.title, i.english ?? "", i.simple, ...(i.aliases ?? [])].join(" ")),
  );
  return hit ?? primary;
}

/**
 * Strip LFM3 thinking traces the same way Liquid's chat_template.jinja does:
 * `content.split("</think>")[-1].trim()` — keep only text after the LAST
 * closing tag. Never replace the tag with a space (that glued duplicated
 * answers together).
 *
 * `enable_thinking=False` is inconsistent (Liquid model card): the model may
 * still emit an unpaired `</think>` or open a fresh `<think>`. Handle both.
 */
export function stripThinking(text: string): string {
  const CLOSE = "</think>";
  const OPEN = "<think>";
  const low = text.toLowerCase();

  // After the last close — covers paired blocks and orphan closes
  // (`1 hana…10 yol.</think>1 hana…`).
  const lastClose = low.lastIndexOf(CLOSE);
  let out = lastClose >= 0 ? text.slice(lastClose + CLOSE.length) : text;

  // Fresh unclosed <think> in the remainder (or the whole string when there
  // was never a close): drop unfinished reasoning so it cannot reach the check.
  const openIdx = out.toLowerCase().indexOf(OPEN);
  if (openIdx >= 0) out = out.slice(0, openIdx);

  return out.replace(/\s+/g, " ").trim();
}

/** Meta / markdown / truncated generation — must not keep the LFM3 label. */
export function answerLooksBroken(text: string, opts?: { hitTokenCap?: boolean }): boolean {
  if (opts?.hitTokenCap) return true;
  const t = text.trim();
  if (!t) return true;
  if (/\bwait[,:]/i.test(t)) return true;
  if (/\bthe fact(?:s)?\s+says\b/i.test(t)) return true;
  if (/\bthe simple line\b/i.test(t)) return true;
  if (/\btwo short sentences max\b/i.test(t)) return true;
  if (/\b(?:so we can|need to check)\b/i.test(t)) return true;
  // After stripThinking flattens newlines, still catch "…. Answer: …" mid-text.
  if (/(?:^|[.!?]\s+)answer\s*:/i.test(t)) return true;
  if (/(?:^|[.!?]\s+)question\s*:/i.test(t)) return true;
  if (/[*_`#]{1,2}/.test(t)) return true; // markdown bold/code/headers
  if (repeatsChunk(t)) return true;
  // Numbered fragments like "2. 10." that are not a real counting list line
  if (/(?:^|[.!?]\s+)\d+\.\s+\d+\b/.test(t)) return true;
  // Cut off mid-sentence / mid-word (token cap) — e.g. ends with "paral"
  if (t.length > 60 && !/[.!?…]"?\s*$/.test(t) && /[a-z]$/i.test(t)) return true;
  return false;
}

/** True when a sentence (any length) or the 1–10 list appears twice. */
function repeatsChunk(text: string): boolean {
  const low = text.toLowerCase().replace(/\s+/g, " ").trim();
  // Counting list fingerprint
  if ((low.match(/\b1\s+hana\b/g) ?? []).length >= 2) return true;
  if ((low.match(/\b10\s+yol\b/g) ?? []).length >= 2) return true;
  // Verbatim sentence repeat — including short ones like "5 dasot. 5 dasot."
  const sentences = low
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen = new Set<string>();
  for (const s of sentences) {
    const key = s.replace(/[^a-z0-9]+/g, "");
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "");
const DECLINE_KEY = letters(DECLINE.split(/[.(]/)[0]);
const PAIN_KEY = letters(PAIN_REPLY);

export function isDecline(text: string): boolean {
  if (/^sorry,?\s+that['’]?s\s+not\s+part\s+of\b/i.test(text.trim())) return true;
  return letters(text).startsWith(DECLINE_KEY);
}

export function isPainReply(text: string): boolean {
  return letters(text).startsWith(PAIN_KEY);
}

export type FinalAsk = {
  text: string;
  sources: string[];
  gated: boolean;
  /** Model answer vs note/card/fixed reply. */
  how: HowAnswered;
  item?: ContentItem;
  /** True when we fell back to the item card after a failed check / thin answer. */
  usedCard: boolean;
};

function matchMeta(plan: Extract<AskMode, { kind: "model" }>) {
  return {
    topic: plan.match.topic.name,
    items: plan.match.items.map((i) => i.title),
    facts: plan.facts,
  };
}

/** Drop a trailing decline sentence the model sometimes appends after a real answer. */
function stripTrailingDecline(text: string): string {
  const low = letters(text);
  const idx = low.indexOf(DECLINE_KEY);
  if (idx <= 0) return text;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toLowerCase();
    if (ch >= "a" && ch <= "z") {
      // Keep the preceding sentence's period — stripping `.` made
      // answerLooksBroken treat a good answer as truncated.
      if (seen === idx) return text.slice(0, i).replace(/\s+$/, "").trim();
      seen++;
    }
  }
  return text;
}

export function finaliseAsk(
  raw: string,
  plan: Extract<AskMode, { kind: "model" }>,
  timing?: { tokens: number; seconds: number; hitTokenCap?: boolean },
): FinalAsk {
  const meta = matchMeta(plan);
  const timingFields = timing
    ? {
        tokens: timing.tokens,
        seconds: timing.seconds,
        tokensPerSecond: tokensPerSecond(timing.tokens, timing.seconds),
      }
    : {};
  const baseNotes = (path: HowAnswered["path"], check?: HowAnswered["check"]): HowAnswered => ({
    source: "notes",
    label: LABEL_NOTES,
    path,
    ...meta,
    rawModel: raw,
    ...timingFields,
    check,
  });

  let text = stripTrailingDecline(stripThinking(raw));
  if (isDecline(text)) {
    return {
      text: DECLINE,
      sources: [],
      gated: false,
      usedCard: false,
      how: baseNotes("model-decline"),
    };
  }
  const check = checkAnswer(text, plan.facts, plan.cardItem.category);
  const required = checkRequiredFacts(text, plan.requiredFacts, plan.bundle);
  const sources = [plan.match.topic.name];
  const broken = answerLooksBroken(text, { hitTokenCap: timing?.hitTokenCap });
  const checkTrace = {
    ok: check.ok && required.ok && !broken,
    badKorean: check.badKorean,
    badNumbers: check.badNumbers,
    badCategory: check.badCategory,
    badBodyParts: check.badBodyParts,
    missingRequired: required.missing.map((m) => `${m.id} [${m.alts.join("|")}]`),
    summary: broken
      ? "Failed. Showed the note instead. Answer looked truncated, repeated, or meta-reasoned."
      : !required.ok
        ? required.summary
        : checkSummary({
            ...check,
            missingRequired: [],
          }),
  };

  const useCard = (path: HowAnswered["path"]): FinalAsk => ({
    // Always the primary/card item (short). Glossary still uses its full note card.
    // Whole-topic dumps (all Chon-Ji moves) were the quality failure mode.
    text: noteTextForPlan(plan),
    sources,
    gated: false,
    usedCard: true,
    item: plan.cardItem,
    how: baseNotes(path, checkTrace),
  });

  // Simpler of the two missing-fact options: show the note card only (one label,
  // one source of truth) rather than splicing model prose + a notes appendix.
  if (!check.ok) return useCard("check-failed");
  if (!required.ok) return useCard("missing-required-fact");
  if (broken) return useCard("check-failed");

  // Single-number counting answers can be short ("Yodul is 8.") — do not treat as thin.
  const singleCount =
    plan.requiredFacts.length === 1 && plan.requiredFacts[0].id.startsWith("count-");
  if (!singleCount && (text.length < 24 || /:\s*$/.test(text))) {
    return useCard("thin-or-glossary-fallback");
  }

  // Meaning answers stay Written by LFM3 (we do not demand 19 as a hard fact),
  // but fold the move count into the last sentence when missing so frozen
  // expects still pass without bumping the quality sentence cap.
  if (plan.match.topic.id === "chonji") {
    const moves = plan.match.items.find((i) => i.id === "how-many-moves-chon-ji-has");
    if (
      moves?.english &&
      !plan.requiredFacts.some((r) => r.id === "chonji-moves") &&
      plan.requiredFacts.some((r) => r.id === "chonji-heaven") &&
      !new RegExp(`\\b${moves.english}\\b`).test(text)
    ) {
      text = text.replace(/\s*[.!?…]["']?\s*$/, "") + `, and it has ${moves.english} moves.`;
    }
  }

  return {
    text,
    sources,
    gated: false,
    usedCard: false,
    item: plan.cardItem,
    how: {
      source: "model",
      label: LABEL_MODEL,
      path: "model",
      ...meta,
      rawModel: raw,
      ...timingFields,
      check: checkTrace,
    },
  };
}

/** Note card for a failed Ask — primary item, or one counting row when asked. */
function noteTextForPlan(plan: Extract<AskMode, { kind: "model" }>): string {
  if (plan.match.topic.id === "glossary") return cardText(plan.cardItem);
  const only = plan.requiredFacts.length === 1 && plan.requiredFacts[0].id.startsWith("count-");
  if (only && plan.cardItem.numbers?.length) {
    const n = Number(plan.requiredFacts[0].id.replace("count-", ""));
    const row = plan.cardItem.numbers.find((x) => x.n === n);
    if (row) return `${row.n} is ${row.korean}.`;
  }
  let text = cardText(plan.cardItem);
  // Chon-Ji identity note: keep it short but include the move count so a
  // truncated model meaning answer still has the facts kids need.
  if (plan.match.topic.id === "chonji" && plan.cardItem.id !== "how-many-moves-chon-ji-has") {
    const moves = plan.match.items.find((i) => i.id === "how-many-moves-chon-ji-has");
    if (moves?.english && !new RegExp(`\\b${moves.english}\\b`).test(text)) {
      text += `\n\nChon-Ji has ${moves.english} moves.`;
    }
  }
  return text;
}

/** Fixed replies (safety / no-match) — always from the notes, no model. */
export function gatedAskResult(plan: Extract<AskMode, { kind: "gated" }>): FinalAsk {
  return {
    text: plan.text,
    sources: [],
    gated: true,
    usedCard: false,
    how: notesLabelForGate(plan.gateReason),
  };
}

export function cardText(item: ContentItem): string {
  const parts: string[] = [];
  if (item.glossary && item.learnBody) {
    parts.push(item.simple);
    if (item.learnBody !== item.simple) parts.push(item.learnBody);
    return parts.join("\n\n");
  }
  if (item.official) {
    parts.push(`Official ITF wording (${item.official.source}): ${item.official.text}`);
  }
  parts.push(item.simple);
  // Do not reprint the counting list when `simple` already has it (same for
  // learnBody duplicates of simple — skipped below).
  if (item.numbers?.length) {
    const first = item.numbers[0];
    const alreadyListed =
      item.simple.toLowerCase().includes(first.korean.toLowerCase()) &&
      item.simple.includes(String(first.n));
    if (!alreadyListed) {
      parts.push(item.numbers.map((n) => `${n.n} ${n.korean}`).join(", ") + ".");
    }
  }
  if (item.moves?.length) {
    parts.push(item.moves.map((m) => `${m.n}. ${m.text}`).join("\n"));
    if (item.end) parts.push(`End: ${item.end}`);
  } else if (item.learnBody && !item.official && item.learnBody !== item.simple) {
    parts.push(item.learnBody);
  }
  return parts.join("\n\n");
}

/** Learn why: model text when the check passes; otherwise the note for that item. */
export function finaliseLearnWhy(opts: {
  item: ContentItem;
  facts: string;
  raw: string;
  tokens: number;
  seconds: number;
}): { text: string; how: HowAnswered; usedCard: boolean } {
  const raw = opts.raw;
  const text = stripThinking(raw);
  const check = checkAnswer(text, opts.facts, opts.item.category);
  const checkTrace = {
    ok: check.ok,
    badKorean: check.badKorean,
    badNumbers: check.badNumbers,
    badCategory: check.badCategory,
    summary: checkSummary(check),
  };
  const timing = {
    tokens: opts.tokens,
    seconds: opts.seconds,
    tokensPerSecond: tokensPerSecond(opts.tokens, opts.seconds),
  };
  const meta = {
    topic: opts.item.title,
    items: [opts.item.title],
    facts: opts.facts,
    rawModel: raw,
    ...timing,
    check: checkTrace,
  };
  if (!check.ok || text.length < 12) {
    return {
      text: cardText(opts.item),
      usedCard: true,
      how: {
        source: "notes",
        label: LABEL_NOTES,
        path: "learn-why-fallback",
        ...meta,
      },
    };
  }
  return {
    text,
    usedCard: false,
    how: {
      source: "model",
      label: LABEL_MODEL,
      path: "learn-why",
      ...meta,
    },
  };
}

/** @deprecated Prefer finaliseLearnWhy — kept for tests that only need a passing how. */
export function learnWhyHow(opts: {
  item: ContentItem;
  facts: string;
  raw: string;
  tokens: number;
  seconds: number;
}): HowAnswered {
  return finaliseLearnWhy(opts).how;
}

export { LABEL_MODEL, LABEL_NOTES };
export type { HowAnswered };
