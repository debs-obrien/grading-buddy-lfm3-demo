// What a content item *is*. Used by the Ask grounding check to reject answers that
// misstate the type (e.g. calling a pattern a stance). No per-question special cases.

export type ItemCategory =
  | "pattern"
  | "stance"
  | "command"
  | "technique"
  | "belt"
  | "counting"
  | "tenet"
  | "oath"
  | "history"
  | "exercise"
  | "word"
  | "glossary";

/** Phrases that claim the subject *is* this category (not merely mentions it). */
export const CATEGORY_IDENTITY: Record<ItemCategory, RegExp[]> = {
  pattern: [
    /\bis\s+(?:a|an|the)\s+(?:pattern|tul|teul|form)\b/i,
    /\b(?:pattern|tul|teul)\s+called\b/i,
  ],
  stance: [
    /\bis\s+(?:a|an|the)\s+stance\b/i,
    /\bis\s+a\s+way\s+of\s+standing\b/i,
    /\bway\s+of\s+standing\s+and\s+moving\b/i,
  ],
  command: [/\bis\s+(?:a|an|the)\s+command\b/i],
  technique: [
    /\bis\s+(?:a|an|the)\s+(?:kick|punch|block|technique)\b/i,
  ],
  belt: [/\bis\s+(?:a|an|the)\s+belt\b/i],
  counting: [/\bis\s+(?:a|an|the)\s+(?:number|counting)\b/i],
  tenet: [/\bis\s+(?:a|an|the)\s+tenet\b/i],
  oath: [/\bis\s+(?:a|an|the)\s+oath\b/i],
  history: [/\bis\s+(?:a|an|the)\s+(?:date|year|person|founder)\b/i],
  exercise: [/\bis\s+(?:a|an|the)\s+(?:exercise|drill)\b/i],
  word: [/\bis\s+(?:a|an|the)\s+(?:word|term)\b/i],
  glossary: [],
};

/** Map content topic (+ item id overrides) → category. */
export function categoryFor(topic: string, itemId: string): ItemCategory {
  if (itemId === "what-chon-ji-means" || itemId === "how-many-moves-chon-ji-has" || /^chon-ji-moves-/.test(itemId) || itemId === "chon-ji-start-position-and-diagram" || itemId === "punches-in-chon-ji-obverse-punch") {
    return "pattern";
  }
  if (itemId === "what-a-pattern-tul-is") return "pattern";
  if (itemId.startsWith("saju-")) return "exercise";
  switch (topic) {
    case "stances":
      return "stance";
    case "commands":
      return "command";
    case "techniques":
      return "technique";
    case "belts":
      return "belt";
    case "counting":
      return "counting";
    case "tenets":
      return "tenet";
    case "oath":
      return "oath";
    case "history":
      return "history";
    case "chonji":
      return "pattern";
    case "saju":
      return "exercise";
    case "glossary":
      return "glossary";
    default:
      return "word";
  }
}

/**
 * True when the answer asserts the subject *is* some other category than `category`.
 * Mentions of other categories in a correct context (e.g. "starts in a walking stance")
 * do not match these identity patterns.
 */
export function answerContradictsCategory(answer: string, category: ItemCategory): string | null {
  for (const [other, patterns] of Object.entries(CATEGORY_IDENTITY) as [ItemCategory, RegExp[]][]) {
    if (other === category) continue;
    for (const re of patterns) {
      if (re.test(answer)) return other;
    }
  }
  return null;
}
