// Grounding check: Korean terms, numbers, and item category/type.
// Official ITF wording is never taken from the model — callers render it from the content file.
import type { ItemCategory } from "./categories.ts";
import { answerContradictsCategory } from "./categories.ts";

const HANGUL = /[\uAC00-\uD7A3]/;

/** Romanised Korean tokens we care about (lowercase). Built from the facts string. */
export function koreanTermsInFacts(facts: string): Set<string> {
  const out = new Set<string>();
  const words = facts.toLowerCase().match(/[a-z]+(?:\s+[a-z]+)?/g) ?? [];
  for (const line of facts.split("\n")) {
    const kr = line.match(/Korean:\s*([^=\n]+?)(?:\s*=|$)/i);
    if (kr) out.add(kr[1].trim().toLowerCase());
    const eq = line.match(/^([a-z][a-z\s]+?)\s*=\s*/i);
    if (eq) out.add(eq[1].trim().toLowerCase());
    const num = line.match(/^\s*(\d+)\s+([a-z]+)\s*$/i);
    if (num) out.add(num[2].toLowerCase());
  }
  for (const w of words) {
    if (/^(hana|dul|dool|set|net|dasot|yosot|ilgop|yodul|ahop|yol|charyot|junbi|kihap|makgi|jirugi|chagi|sogi|tul|teul|dobok|dojang|narani|gunnun|niunja|annun|palmok|sonkal|nopunde|kaunde|najunde|nagagi|duruogi|gujari|dolgi|sabum|boosabum|chonji)$/.test(w)) {
      out.add(w);
    }
  }
  // Hyphenated names in facts (Chon-Ji, si-jak, …)
  for (const m of facts.toLowerCase().matchAll(/\b[a-z]+(?:-[a-z]+)+\b/g)) {
    out.add(m[0]);
    out.add(m[0].replace(/-/g, ""));
  }
  return out;
}

export function numbersInFacts(facts: string): Set<string> {
  const out = new Set<string>();
  for (const m of facts.matchAll(/(?<![a-z0-9])(\d+)(?![a-z0-9])/gi)) out.add(m[1]);
  return out;
}

/** Korean-looking romanisations and Hangul found in the answer. */
export function koreanTermsInAnswer(answer: string): string[] {
  const found: string[] = [];
  if (HANGUL.test(answer)) {
    for (const m of answer.matchAll(/[\uAC00-\uD7A3]+/g)) found.push(m[0]);
  }
  const low = answer.toLowerCase();
  for (const term of [
    "kyong ye",
    "si jak",
    "sabum nim",
    "boosabum nim",
    "charyot sogi",
    "narani sogi",
    "narani junbi sogi",
    "gunnun sogi",
    "niunja sogi",
    "annun sogi",
    "palmok najunde makgi",
    "sonkal najunde makgi",
    "an palmok yop makgi",
    "ap jirugi",
    "apcha busigi",
    "apcha olligi",
    "saju jirugi",
    "saju makgi",
    "gujari dolgi",
    "ap kumchi",
    "ap joomuk",
  ]) {
    if (low.includes(term)) found.push(term);
  }
  for (const m of low.matchAll(
    /\b(charyot|junbi|baro|kihap|makgi|jirugi|chagi|dojang|dobok|hana|dul|dool|set|net|dasot|yosot|ilgop|yodul|ahop|yol|nopunde|kaunde|najunde|nagagi|duruogi|tul|teul|sogi|palmok|sonkal|chon-?ji)\b/g,
  )) {
    found.push(m[1]);
  }
  return [...new Set(found)];
}

export function numbersInAnswer(answer: string): string[] {
  return [...new Set((answer.match(/(?<![a-z0-9])\d+(?![a-z0-9])/g) ?? []))];
}

export interface CheckResult {
  ok: boolean;
  badKorean: string[];
  badNumbers: string[];
  /** Set when the answer claims the item is a different category/type. */
  badCategory?: string;
}

/**
 * Pass when every Korean term and number in the answer appears in the facts, and the
 * answer does not contradict the item's category (e.g. calling a pattern a stance).
 * Hangul is never in our facts → always fails.
 */
export function checkAnswer(
  answer: string,
  facts: string,
  category?: ItemCategory,
): CheckResult {
  const allowedK = koreanTermsInFacts(facts);
  const allowedN = numbersInFacts(facts);
  const badKorean: string[] = [];
  for (const k of koreanTermsInAnswer(answer)) {
    const low = k.toLowerCase();
    const compact = low.replace(/-/g, "");
    if (HANGUL.test(k) || !(allowedK.has(low) || allowedK.has(compact))) badKorean.push(k);
  }
  const badNumbers: string[] = [];
  for (const n of numbersInAnswer(answer)) {
    if (!allowedN.has(n)) badNumbers.push(n);
  }
  let badCategory: string | undefined;
  if (category) {
    const contradicted = answerContradictsCategory(answer, category);
    if (contradicted) badCategory = contradicted;
  }
  return {
    ok: badKorean.length === 0 && badNumbers.length === 0 && !badCategory,
    badKorean,
    badNumbers,
    badCategory,
  };
}
