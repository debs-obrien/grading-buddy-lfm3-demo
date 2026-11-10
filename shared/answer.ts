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
  const cardItem = match.primary ?? match.items[0];
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

/** Strip thinking tags only — no patch-style cleanup. */
export function stripThinking(text: string): string {
  // Drop a closed or still-open thinking block so leaked chain-of-thought cannot
  // inject Korean terms / numbers into the grounding check.
  return text
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "")
    .replace(/<\/?think>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      if (seen === idx) return text.slice(0, i).replace(/[\s.]+$/, "").trim();
      seen++;
    }
  }
  return text;
}

export function finaliseAsk(
  raw: string,
  plan: Extract<AskMode, { kind: "model" }>,
  timing?: { tokens: number; seconds: number },
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
  const checkTrace = {
    ok: check.ok && required.ok,
    badKorean: check.badKorean,
    badNumbers: check.badNumbers,
    badCategory: check.badCategory,
    badBodyParts: check.badBodyParts,
    missingRequired: required.missing.map((m) => `${m.id} [${m.alts.join("|")}]`),
    summary: !required.ok
      ? required.summary
      : checkSummary({
          ...check,
          missingRequired: [],
        }),
  };

  const useCard = (path: HowAnswered["path"]): FinalAsk => ({
    // Whole-topic Ask: when several items were given to the model, the note
    // fallback shows those items together (not only the primary card).
    // Glossary: always the full glossary note when coverage fails.
    text:
      plan.match.topic.id === "glossary"
        ? cardText(plan.cardItem)
        : plan.match.items.length > 1
          ? plan.match.items.map((i) => cardText(i)).join("\n\n")
          : cardText(plan.cardItem),
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

  if (text.length < 24 || /:\s*$/.test(text)) return useCard("thin-or-glossary-fallback");

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
  if (item.numbers) {
    parts.push(item.numbers.map((n) => `${n.n} ${n.korean}`).join(", ") + ".");
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

export function factsFor(bundle: ContentBundle, item: ContentItem): string {
  return item.glossary || item.topic === "glossary" ? topicFacts(bundle, "glossary") : itemFacts(item, bundle);
}

export { LABEL_MODEL, LABEL_NOTES };
export type { HowAnswered };
