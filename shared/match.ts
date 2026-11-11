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
  "a an and are as at be by can do does for from how i in is it its me my of on or our so that the this to was we what when where which who why with you your tell about please mean means meaning say says said need know the".split(
    " ",
  ),
);

/** Multi-word aliases that are question frames, not distinctive content. */
const GENERIC_PHRASES = new Set([
  "how many",
  "who",
  "started",
  "who started",
  "word",
  "meaning",
  "list",
  "after",
  "comes after",
]);

/** Other martial arts / sports — never answer even if a shared technique word matches. */
const OTHER_ART =
  /\b(karate|kung\s*fu|kungfu|wushu|judo|jiu\s*jitsu|jiujitsu|aikido|hapkido|muay\s*thai|boxing|mma|krav\s*maga)\b/;

/** Non-grading domains that share a word with our content (pattern, kup, middle, korean…). */
const OFF_TOPIC =
  /\b(maths?|mathematics|algebra|geometry|dress|skirt|fabric|clothing|tea|coffee|cup|won|currency|money|parting|haircut|hairstyle|chess|football|soccer)\b/;

const COUNT_KO = new Set([
  "hana",
  "dul",
  "dool",
  "set",
  "net",
  "dasot",
  "yosot",
  "ilgop",
  "yodul",
  "ahop",
  "yol",
]);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/taekwon\s*-?\s*do/g, "taekwondo")
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
  // Use token-boundary hasPhrase — bare includes() matched "ten" inside "tenets".
  for (const phrase of phrases) {
    if (phrase.length < 3) continue;
    if (STOP.has(phrase)) continue;
    if (hasPhrase(qNorm, phrase)) {
      if (GENERIC_PHRASES.has(phrase)) score += 1;
      else score += phrase.split(" ").length >= 2 ? 6 : 3;
    }
    // Question is mostly the phrase ("charyot?", "what is dobok")
    if (hasPhrase(phrase, qNorm) && qNorm.length >= 4) score += 4;
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

  // Prefer the action the kid asked how to do (punch/kick/block/turn) over a
  // height or topic-name near-miss ("middle punch" → front punch, not kaunde).
  const joined = phrases.join(" ");
  if (/\bpunch(?:es|ing)?\b/.test(qNorm) && /\b(?:punch|jirugi)\b/.test(joined)) score += 4;
  if (/\bkick(?:s|ing)?\b/.test(qNorm) && /\b(?:kick|chagi|busigi|olligi)\b/.test(joined)) score += 4;
  if (/\bblock(?:s|ing)?\b/.test(qNorm) && /\b(?:block|makgi)\b/.test(joined)) score += 4;
  if (
    /\bturn(?:s|ing|ed)?\b/.test(qNorm) &&
    !/\bkick\b/.test(qNorm) &&
    /\b(?:turn|turning|dolgi|gujari)\b/.test(joined)
  ) {
    score += 5;
  }
  // Prefer the technique card whose Korean term matches the action asked
  // (ap jirugi for punch), not a vocab list whose primary korean is something else.
  const k = norm(
    [item.korean, ...(item.alsoKorean ?? []).map((a) => a.korean)].filter(Boolean).join(" "),
  );
  if (/\bpunch(?:es|ing)?\b/.test(qNorm) && /\bjirugi\b/.test(k)) score += 3;
  if (/\bkick(?:s|ing)?\b/.test(qNorm) && /\b(?:chagi|busigi|olligi)\b/.test(k)) score += 3;
  if (/\bblock(?:s|ing)?\b/.test(qNorm) && /\bmakgi\b/.test(k)) score += 3;
  // Height + punch → the front-punch note (high/middle/low) over saju / vocab.
  if (
    /\b(?:high|middle|low)\b/.test(qNorm) &&
    /\bpunch(?:es|ing)?\b/.test(qNorm) &&
    /\bjirugi\b/.test(k) &&
    /\b(?:high|middle|low|nopunde|kaunde|najunde)\b/.test(norm(item.simple ?? ""))
  ) {
    score += 4;
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
  // Currency / money senses of "won" are not counting questions.
  if (OFF_TOPIC.test(qNorm)) return false;
  const countWord = /\b(?:count|counts|counting|cont|cout)\b/.test(qNorm);
  const numbersWord = /\bnumbers?\b/.test(qNorm);
  const range =
    /\b1\s*(?:to|-|–)\s*10\b/.test(qNorm) ||
    /\bone\s+to\s+ten\b/.test(qNorm) ||
    /\b1\s*10\b/.test(qNorm); // normalised "1-10" → "1 10"
  // Partial ranges kids ask: "1 to 5", "6 to 10"
  const partialRange = /\b([1-9]|10)\s+to\s+([1-9]|10)\b/.test(qNorm);
  if (countWord) return true;
  if (/\bkorean\b/.test(qNorm) && (numbersWord || range || partialRange)) return true;
  if (numbersWord && (/\bone\s+to\s+ten\b/.test(qNorm) || range || partialRange)) return true;
  // "how do you say 1-10" / "say 1 to 10"
  if (range && /\b(say|says|saying|tell|list|recite)\b/.test(qNorm)) return true;
  if (range && /\bkorean\b/.test(qNorm)) return true;
  if (partialRange && /\bkorean\b/.test(qNorm)) return true;
  // Digit / word number in Korean: "what is 3 in korean", "whats 5 in korean"
  // Require a clear number ask — not "tenets" / "attention" false friends.
  if (
    /\bkorean\b/.test(qNorm) &&
    (/\b([1-9]|10)\b/.test(qNorm) ||
      /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(qNorm)) &&
    /\b(say|says|what|whats|number|numbers|count|counts|counting)\b/.test(qNorm)
  ) {
    return true;
  }
  // "what number is yodul" — Korean counting word looking for its digit.
  if (numbersWord && qNorm.split(/\s+/).some((t) => COUNT_KO.has(t))) return true;
  return false;
}

/**
 * Match a question to a whole topic (and its items).
 * Returns null when nothing in the white-to-yellow content matches.
 */
export function matchQuestion(bundle: ContentBundle, question: string): Match | null {
  const qNorm = norm(question);
  const qTokens = tokens(question);
  if (!qTokens.length) return null;

  // Off-topic domains that only share a grading word (pattern, kup, middle, korean…).
  if (OTHER_ART.test(qNorm) || OFF_TOPIC.test(qNorm)) return null;

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
  // On a score tie, prefer the item that covers more of the question's content words.
  let bestItem: ContentItem | null = null;
  let bestScore = 0;
  let bestCover = -1;
  for (const item of bundle.items) {
    if (item.glossary) continue;
    const s = scoreItem(qNorm, qTokens, item);
    const phrases = itemPhrases(item);
    const coverToks = new Set([
      ...phrases.flatMap((p) => tokens(p)),
      ...tokens(item.simple ?? ""),
      ...tokens(item.learnBody ?? ""),
    ]);
    const contentQ = qTokens.filter((t) => t.length >= 4 || /^\d+$/.test(t));
    const cover = contentQ.length
      ? contentQ.filter((t) => coverToks.has(t)).length / contentQ.length
      : 0;
    if (s > bestScore || (s === bestScore && cover > bestCover)) {
      bestScore = s;
      bestItem = item;
      bestCover = cover;
    }
  }

  // Need solid item-level evidence (a Korean term, a multi-word alias, or several tokens).
  // A single distinctive alias (pattern, courtesy, oath, bow, itf, kup) scores ~4.5.
  if (!bestItem || bestScore < 4) return null;

  // Most of the question's content words must also appear on the item.
  // Drop question scaffolding before the 0.75 gate so everyday phrasings
  // ("how many tenets are there") still match, while off-topic near-misses
  // ("black belt", "turning kick") stay declined.
  const SCAFFOLD = new Set([
    "many",
    "whats",
    "korean",
    "grade",
    "call",
    "made",
    "invented",
    "founded",
    "there",
    "does",
    "doing",
    "name",
  ]);
  const phrases = itemPhrases(bestItem);
  // Include simple/learnBody tokens so "middle" on the front-punch note counts
  // toward coverage without admitting unknown modifiers (turning kick, twist…).
  const coverToks = new Set([
    ...phrases.flatMap((p) => tokens(p)),
    ...tokens(bestItem.simple ?? ""),
    ...tokens(bestItem.learnBody ?? ""),
  ]);
  const contentQ = qTokens.filter(
    (t) => (t.length >= 4 || /^\d+$/.test(t)) && !SCAFFOLD.has(t),
  );
  // Strong evidence: Korean term, counting row, or a multi-word alias/title/english.
  // Generic frames ("comes after") must not count as strong evidence.
  const koreanHit =
    (bestItem.korean && hasPhrase(qNorm, norm(bestItem.korean))) ||
    (bestItem.alsoKorean ?? []).some((a) => hasPhrase(qNorm, norm(a.korean))) ||
    (bestItem.numbers ?? []).some((n) => hasPhrase(qNorm, norm(n.korean)));
  const strongPhraseHit = phrases.some(
    (p) => p.split(" ").length >= 2 && hasPhrase(qNorm, p) && !GENERIC_PHRASES.has(p),
  );
  // Lone english labels like "pattern" are too weak when other content words miss.
  const englishHit = !!(
    bestItem.english &&
    hasPhrase(qNorm, norm(bestItem.english)) &&
    norm(bestItem.english).split(" ").length >= 2
  );
  if (contentQ.length && !koreanHit && !strongPhraseHit) {
    const hit = contentQ.filter((t) => coverToks.has(t)).length;
    const ratio = hit / contentQ.length;
    // Full coverage, or multi-word english meaning with at least half the content words.
    // Do not let a high score alone bypass coverage — that admitted twist/punch
    // how-tos that never mention twist on the card.
    const ok = ratio >= 0.75 || (englishHit && ratio >= 0.5 && bestScore >= 4);
    if (!ok) return null;
  }

  const topic = bundle.topics.find((t) => t.id === bestItem!.topic);
  if (!topic) return null;
  const items = itemsByTopic(bundle, topic.id);
  return { topic, items, primary: bestItem, score: bestScore };
}
