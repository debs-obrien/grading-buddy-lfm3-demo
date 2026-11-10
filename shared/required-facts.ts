// Required facts are derived from structured content for the matched topic —
// never from eval/questions.json. Missing a required fact → note fallback.
import type { ContentBundle, ContentItem } from "./content.ts";
import type { Match } from "./match.ts";

export interface RequiredFact {
  /** Stable id for traces (e.g. "chonji-moves", "glossary-coverage"). */
  id: string;
  /** Any one alternative must appear in the answer (case-insensitive). */
  alts: string[];
}

export interface RequiredFactsResult {
  ok: boolean;
  missing: RequiredFact[];
  summary: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function hasAlt(answer: string, alts: string[]): boolean {
  const a = norm(answer);
  return alts.some((alt) => a.includes(norm(alt)));
}

/**
 * Key facts an Ask answer must contain, from the matched topic's content items.
 * Kept intentional and topic-shaped — not a dump of every field.
 */
export function requiredFactsForMatch(
  bundle: ContentBundle,
  match: Match,
  question: string,
): RequiredFact[] {
  const q = norm(question);
  const topic = match.topic.id;
  const req: RequiredFact[] = [];

  if (topic === "counting") {
    const item =
      match.items.find((i) => i.numbers && i.numbers.length >= 10) ?? match.primary;
    const numbers = item?.numbers ?? [];
    // Full 1–10 list only when the question asks to count / list numbers — not "what is three".
    if (wantsFullCountingList(q)) {
      for (const n of numbers) {
        req.push({ id: `count-${n.n}`, alts: [n.korean] });
      }
    } else {
      const one = singleCountRequirement(q, numbers);
      if (one) req.push(one);
    }
    return req;
  }

  if (topic === "glossary") {
    // Full glossary is long; a model answer that only names a handful is incomplete —
    // fall back to the notes. Coverage threshold is checked in checkRequiredFacts.
    req.push({
      id: "glossary-coverage",
      alts: ["__glossary_coverage__"], // sentinel handled in checkRequiredFacts
    });
    return req;
  }

  if (topic === "tenets") {
    // "How many tenets" / "what are the tenets" must name them — "five" alone is thin.
    if (/\btenets?\b/.test(q) && (/\bhow many\b/.test(q) || /\bwhat(?:'s|s| are)\b/.test(q) || /\blist\b/.test(q))) {
      req.push({ id: "tenet-courtesy", alts: ["courtesy"] });
      req.push({ id: "tenet-integrity", alts: ["integrity"] });
    }
    return req;
  }

  if (topic === "chonji") {
    const moves = match.items.find((i) => i.id === "how-many-moves-chon-ji-has");
    // "How many moves?" only needs 19 — not the full identity bundle.
    if (/\bhow many\b/.test(q) && /\bmoves?\b/.test(q)) {
      if (moves?.english) req.push({ id: "chonji-moves", alts: [moves.english, "nineteen"] });
      return req;
    }
    // Meaning / what-is / explain: heaven + earth + pattern — do NOT demand 19
    // (that forced good meaning answers onto the whole-topic dump).
    if (isChonJiIdentityQuestion(q, match.primary)) {
      const pattern = match.items.find((i) => i.id === "what-a-pattern-tul-is");
      const meaning = match.items.find((i) => i.id === "what-chon-ji-means");
      if (pattern) {
        const alts = [pattern.english, pattern.korean, "teul"].filter(Boolean) as string[];
        req.push({ id: "chonji-pattern", alts });
      }
      if (meaning) {
        req.push({ id: "chonji-heaven", alts: ["heaven"] });
        req.push({ id: "chonji-earth", alts: ["earth"] });
      }
    }
  }

  return req;
}

function wantsFullCountingList(q: string): boolean {
  if (/\bcount(?:ing|s)?\b/.test(q) || /\bcont\b/.test(q) || /\bcout\b/.test(q)) return true;
  if (/\bone\s+to\s+ten\b/.test(q) || /\b1\s+10\b/.test(q) || /\b1\s+to\s+10\b/.test(q)) return true;
  // Partial ranges still need the full list from the notes (safer than inventing a slice).
  if (/\b([1-9]|10)\s+to\s+([1-9]|10)\b/.test(q)) return true;
  if (/\bnumbers?\b/.test(q) && (/\b10\b|\bten\b|\bkorean\b/.test(q))) return true;
  if (/\bwords?\b/.test(q) && /\bcount/.test(q)) return true;
  return false;
}

function singleCountRequirement(
  q: string,
  numbers: { n: number; korean: string }[],
): RequiredFact | null {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  for (const [w, n] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\b`).test(q)) {
      const row = numbers.find((x) => x.n === n);
      return row ? { id: `count-${n}`, alts: [row.korean, String(n)] } : null;
    }
  }
  const digit = q.match(/\b([1-9]|10)\b/);
  if (digit) {
    const n = Number(digit[1]);
    const row = numbers.find((x) => x.n === n);
    return row ? { id: `count-${n}`, alts: [row.korean, String(n)] } : null;
  }
  return null;
}

/** Meaning / what-is / explain Chon-Ji — not start stance, end foot, or move count alone. */
function isChonJiIdentityQuestion(q: string, primary: ContentItem | null): boolean {
  const id = primary?.id ?? "";
  if (id === "what-chon-ji-means" || id === "what-a-pattern-tul-is") return true;
  if (/\b(explain|what is|what does|mean|meaning)\b/.test(q) && /chon\s*ji|chonji/.test(q)) {
    return true;
  }
  return false;
}

/** About half the glossary — a short hedged list must fall back to the full note. */
const GLOSSARY_MIN = 20;

export function checkRequiredFacts(
  answer: string,
  required: RequiredFact[],
  bundle?: ContentBundle,
): RequiredFactsResult {
  if (!required.length) return { ok: true, missing: [], summary: "No extra required facts for this topic." };
  const missing: RequiredFact[] = [];
  for (const fact of required) {
    if (fact.id === "glossary-coverage") {
      if (!bundle) {
        missing.push(fact);
        continue;
      }
      const low = norm(answer);
      const hit = bundle.glossary.filter((g) => low.includes(norm(g.term))).length;
      if (hit < GLOSSARY_MIN) {
        missing.push({
          id: fact.id,
          alts: [`at least ${GLOSSARY_MIN} glossary terms (found ${hit})`],
        });
      }
      continue;
    }
    if (!hasAlt(answer, fact.alts)) missing.push(fact);
  }
  if (!missing.length) {
    return { ok: true, missing: [], summary: "Required facts from the notes were present." };
  }
  const bits = missing.map((m) => `${m.id}: need one of [${m.alts.join(" | ")}]`).join("; ");
  return {
    ok: false,
    missing,
    summary: `Failed — showed the note instead. Missing required fact(s): ${bits}.`,
  };
}
