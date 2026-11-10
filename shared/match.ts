// Topic / item matching for Ask. No model. No per-question special cases.
// A match needs evidence from an item's title, Korean term, English meaning or aliases —
// not from a lone shared stopword or a broad topic tag like "taekwon-do".
import type { ContentBundle, ContentItem, TopicDef } from "./content.ts";
import { itemsByTopic } from "./content.ts";

export interface Match {
  topic: TopicDef;
  items: ContentItem[];
  primary: ContentItem | null;
  score: number;
}

const STOP = new Set(
  "a an and are as at be by can do does for from how i in is it its me my of on or our so that the this to was we what when where which who why with you your tell about please mean means meaning say says said need know the instructor".split(
    " ",
  ),
);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function tokens(s: string): string[] {
  return norm(s)
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t) && (t.length > 1 || /^\d+$/.test(t)));
}

function itemPhrases(item: ContentItem): string[] {
  const raw = [
    item.title,
    item.english,
    item.korean,
    item.quiz,
    item.answer,
    ...(item.aliases ?? []),
    ...(item.alsoKorean ?? []).flatMap((a) => [a.korean, a.english]),
  ].filter(Boolean) as string[];
  return [...new Set(raw.map(norm).filter((p) => p.length >= 2))];
}

/** Score one item against the question. Higher = better. */
function scoreItem(qNorm: string, qTokens: string[], item: ContentItem): number {
  let score = 0;
  const phrases = itemPhrases(item);

  // Exact Korean term in the question (strongest signal). Token boundaries only —
  // "baro" must not score inside "barometer".
  if (item.korean) {
    const k = norm(item.korean);
    if (k.length >= 2 && (hasPhrase(qNorm, k) || qTokens.includes(k.replace(/\s/g, "")))) score += 8;
  }
  for (const a of item.alsoKorean ?? []) {
    const k = norm(a.korean);
    if (k.length >= 2 && hasPhrase(qNorm, k)) score += 8;
  }

  // Alias / title / english phrase contained in the question (or vice versa for short answers).
  for (const phrase of phrases) {
    if (phrase.length < 3) continue;
    if (STOP.has(phrase)) continue;
    if (qNorm.includes(phrase)) score += phrase.split(" ").length >= 2 ? 6 : 3;
    // Question is mostly the phrase ("charyot?", "what is dobok")
    if (phrase.includes(qNorm) && qNorm.length >= 4) score += 4;
  }

  // Token overlap with the item's distinctive tokens only (not the whole learn body).
  const itemToks = new Set(phrases.flatMap((p) => tokens(p)));
  let overlap = 0;
  for (const t of qTokens) {
    if (itemToks.has(t)) overlap += 1;
  }
  // Weak overlap alone is not enough; cap it.
  score += Math.min(overlap, 3) * 1.5;

  // Numbers in counting item
  if (item.numbers) {
    for (const n of item.numbers) {
      if (hasPhrase(qNorm, norm(n.korean)) || qTokens.includes(String(n.n))) score += 2;
    }
    if (wantsCounting(qNorm) || /\bnumbers?\b/.test(qNorm)) score += 5;
  }

  return score;
}

/** Whole-phrase / token-boundary match on a normalised string (spaces for non-alnum). */
function hasPhrase(qNorm: string, phrase: string): boolean {
  if (!phrase) return false;
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(qNorm);
}

/** True when the question is asking for Korean counting 1–10 (including typos / ranges). */
export function wantsCounting(qNorm: string): boolean {
  const countWord = /\b(?:count|counts|counting|cont|cout)\b/.test(qNorm);
  const numbersWord = /\bnumbers?\b/.test(qNorm);
  const range =
    /\b1\s*(?:to|-|–)\s*10\b/.test(qNorm) ||
    /\bone\s+to\s+ten\b/.test(qNorm) ||
    /\b1\s*10\b/.test(qNorm); // normalised "1-10" → "1 10"
  if (countWord) return true;
  if (/\bkorean\b/.test(qNorm) && (numbersWord || range)) return true;
  if (numbersWord && (/\bone\s+to\s+ten\b/.test(qNorm) || range)) return true;
  // "how do you say 1-10" / "say 1 to 10"
  if (range && /\b(say|says|saying|tell|list|recite)\b/.test(qNorm)) return true;
  if (range && /\bkorean\b/.test(qNorm)) return true;
  return false;
}

/**
 * Match a question to a whole topic (and its items).
 * Returns null when nothing in the white-to-yellow content fits.
 */
export function matchQuestion(bundle: ContentBundle, question: string): Match | null {
  const qNorm = norm(question);
  const qTokens = tokens(question);
  if (!qTokens.length) return null;

  // Broad "all Korean words" → glossary (whole topic facts).
  // Singular "Korean word for X" is a single-term question, not the glossary.
  const wantsAllKorean =
    /\bkorean\b/.test(qNorm) &&
    (/\b(vocabulary|glossary)\b/.test(qNorm) ||
      /\bwords\b/.test(qNorm) ||
      /\bwords? (do i|i) need\b/.test(qNorm) ||
      /\bneed to know\b/.test(qNorm)) &&
    !/\bkorean word for\b/.test(qNorm) &&
    !wantsCounting(qNorm) &&
    !qTokens.some((t) =>
      ["hana", "dul", "set", "net", "dasot", "yosot", "ilgop", "yodul", "ahop", "yol"].includes(t),
    );

  if (wantsAllKorean) {
    const topic = bundle.topics.find((t) => t.id === "glossary")!;
    const items = bundle.items.filter((i) => i.glossary);
    return { topic, items, primary: items[0] ?? null, score: 100 };
  }

  // Counting words / count to 10 → counting topic.
  // Whole words only — "country" / "counter" must not match "count".
  // Includes common misspellings (cont, cout) and "1-10" / "one to ten" ranges from QA live checks.
  if (wantsCounting(qNorm)) {
    const topic = bundle.topics.find((t) => t.id === "counting")!;
    const items = itemsByTopic(bundle, "counting");
    return { topic, items, primary: items[0] ?? null, score: 90 };
  }

  // Score every non-glossary item; pick the best. Topic = that item's topic.
  let bestItem: ContentItem | null = null;
  let bestScore = 0;
  for (const item of bundle.items) {
    if (item.glossary) continue;
    const s = scoreItem(qNorm, qTokens, item);
    if (s > bestScore) {
      bestScore = s;
      bestItem = item;
    }
  }

  // Need solid item-level evidence (a Korean term, a multi-word alias, or several tokens).
  // A single generic token like "belt" / "kick" / "punch" must not win.
  if (!bestItem || bestScore < 5) return null;

  // Most of the question's content words must also appear on the item.
  // Stops "turning kick" → spot-turning, "Olympic taekwondo" → name-of-art note,
  // "4th degree patterns" → "what a pattern is".
  const itemToks = new Set(itemPhrases(bestItem).flatMap((p) => tokens(p)));
  const contentQ = qTokens.filter((t) => t.length >= 4 || /^\d+$/.test(t));
  // A clear Korean-term hit in the question is enough on its own (token boundaries).
  const koreanHit =
    (bestItem.korean && hasPhrase(qNorm, norm(bestItem.korean))) ||
    (bestItem.alsoKorean ?? []).some((a) => hasPhrase(qNorm, norm(a.korean)));
  if (contentQ.length && !koreanHit) {
    const hit = contentQ.filter((t) => itemToks.has(t)).length;
    if (hit / contentQ.length < 0.75 && bestScore < 14) return null;
  }

  const topic = bundle.topics.find((t) => t.id === bestItem!.topic);
  if (!topic) return null;
  const items = itemsByTopic(bundle, topic.id);
  return { topic, items, primary: bestItem, score: bestScore };
}
