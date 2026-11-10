// One source of truth for Learn, Quiz and Ask: data/belts/white-yellow/content.json
import type { Note } from "./notes.ts";
import { categoryFor, type ItemCategory } from "./categories.ts";

export type { ItemCategory };

export interface OfficialQuote {
  text: string;
  source: string;
}

export interface NumberWord {
  n: number;
  korean: string;
}

export interface AlsoKorean {
  korean: string;
  english: string;
}

export interface ContentItem {
  id: string;
  topic: string;
  /** What this item *is* (pattern, stance, …). Used by the Ask grounding check. */
  category: ItemCategory;
  title: string;
  english: string;
  korean?: string;
  alsoKorean?: AlsoKorean[];
  official?: OfficialQuote;
  simple: string;
  grading: string;
  aliases: string[];
  learnBody: string;
  quiz?: string;
  answer?: string;
  kind?: string;
  wrong?: string[];
  why?: string;
  numbers?: NumberWord[];
  moves?: { n: number; text: string }[];
  end?: string;
  glossary?: boolean;
}

export interface TopicDef {
  id: string;
  name: string;
  aliases: string[];
}

export interface GlossaryEntry {
  term: string;
  meaning: string;
  itemId: string;
}

export interface ContentBundle {
  about: string;
  gradingScope: string;
  topics: TopicDef[];
  items: ContentItem[];
  glossary: GlossaryEntry[];
}

export function parseContent(json: unknown): ContentBundle {
  const data = json as ContentBundle;
  if (!data?.items?.length) throw new Error("content.json has no items");
  for (const item of data.items) {
    if (!item.category) item.category = categoryFor(item.topic, item.id);
  }
  return data;
}

export function itemsByTopic(bundle: ContentBundle, topicId: string): ContentItem[] {
  return bundle.items.filter((i) => i.topic === topicId && !i.glossary);
}

export function itemById(bundle: ContentBundle, id: string): ContentItem | undefined {
  return bundle.items.find((i) => i.id === id);
}

/** Every item that has a Korean term (plus alsoKorean), for the glossary view. */
export function glossaryEntries(bundle: ContentBundle): GlossaryEntry[] {
  return bundle.glossary;
}

/** Facts text the model may use for one item (never invents official wording). */
export function itemFacts(item: ContentItem, bundle: ContentBundle): string {
  if (item.glossary) {
    return glossaryEntries(bundle)
      .map((g) => `${g.term} = ${g.meaning}`)
      .join("\n");
  }
  const lines: string[] = [
    `Title: ${item.title}`,
    `Type: ${item.category}`,
    `English: ${item.english}`,
  ];
  if (item.korean) lines.push(`Korean: ${item.korean}`);
  for (const a of item.alsoKorean ?? []) lines.push(`Korean: ${a.korean} = ${a.english}`);
  if (item.numbers) {
    lines.push("Counting 1 to 10:");
    for (const n of item.numbers) lines.push(`${n.n} ${n.korean}`);
  }
  if (item.moves) {
    for (const m of item.moves) lines.push(`${m.n}. ${m.text}`);
    if (item.end) lines.push(`End: ${item.end}`);
  }
  if (item.official) {
    lines.push(`Official ITF wording (source ${item.official.source}): ${item.official.text}`);
  }
  lines.push(`Simple: ${item.simple}`);
  if (item.learnBody && !item.moves && !item.numbers) {
    lines.push(item.learnBody);
  }
  return lines.join("\n");
}

/** Facts for a whole topic (all its items). */
export function topicFacts(bundle: ContentBundle, topicId: string): string {
  if (topicId === "glossary") {
    const g = bundle.items.find((i) => i.glossary);
    return g ? itemFacts(g, bundle) : glossaryEntries(bundle).map((e) => `${e.term} = ${e.meaning}`).join("\n");
  }
  return itemsByTopic(bundle, topicId)
    .map((i) => itemFacts(i, bundle))
    .join("\n\n");
}

/**
 * Adapt a content item to the Note shape Learn / Quiz / Chon-Ji still use.
 * Official wording is restored into the body so Learn can render it from the content file.
 */
export function itemToNote(item: ContentItem): Note {
  const bodyParts: string[] = [];
  if (item.official) {
    const quoted = item.official.text.includes("\n")
      ? item.official.text
          .split("\n")
          .map((l, i) => `${i + 1}. ${l}`)
          .join("\n")
      : `"${item.official.text}"`;
    if (item.official.text.includes("\n")) {
      bodyParts.push(`Official ITF wording:\n${quoted}`);
    } else {
      bodyParts.push(`Official ITF wording: ${quoted}`);
    }
  }
  if (item.simple && item.official) bodyParts.push(`In simple words: ${item.simple}`);
  if (item.learnBody) bodyParts.push(item.learnBody);
  else if (!item.official) bodyParts.push(item.simple);

  return {
    id: item.id,
    title: item.title,
    grading: item.grading,
    tags: item.aliases,
    quiz: item.quiz,
    answer: item.answer,
    kind: item.kind,
    wrong: item.wrong,
    why: item.why,
    body: bodyParts.join("\n\n").trim(),
  };
}

/** Notes for Learn/Quiz: skip the synthetic glossary card. */
export function contentNotes(bundle: ContentBundle): Note[] {
  return bundle.items.filter((i) => !i.glossary).map(itemToNote);
}

/** Counting must be exactly one item. */
export function countingItem(bundle: ContentBundle): ContentItem {
  const items = bundle.items.filter((i) => i.topic === "counting" && i.numbers);
  if (items.length !== 1) throw new Error(`Expected one counting item, found ${items.length}`);
  return items[0];
}
