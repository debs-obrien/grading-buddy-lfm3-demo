import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { loadBeltContent, loadBeltNotes } from "../shared/belt-fs.ts";
import { countingItem, glossaryEntries, contentNotes } from "../shared/content.ts";
import { cardText } from "../shared/answer.ts";

const bundle = loadBeltContent();

describe("content.json", () => {
  it("loads items and topics", () => {
    expect(bundle.items.length).toBeGreaterThan(40);
    expect(bundle.topics.map((t) => t.id)).toContain("counting");
    expect(bundle.topics.map((t) => t.id)).toContain("glossary");
  });

  it("has counting 1–10 as exactly one item", () => {
    const c = countingItem(bundle);
    expect(c.id).toBe("counting-1-to-10-in-korean");
    expect(c.numbers?.map((n) => n.korean)).toEqual([
      "hana", "dul", "set", "net", "dasot", "yosot", "ilgop", "yodul", "ahop", "yol",
    ]);
    expect(bundle.items.filter((i) => i.topic === "counting" && i.numbers).length).toBe(1);
  });

  it("builds a glossary from every Korean term", () => {
    const g = glossaryEntries(bundle);
    expect(g.length).toBeGreaterThan(20);
    expect(g.some((e) => e.term === "charyot")).toBe(true);
    expect(g.some((e) => e.term === "hana")).toBe(true);
    expect(g.some((e) => e.term === "makgi")).toBe(true);
  });

  it("contains no kids' names, photos or local paths", () => {
    const raw = fs.readFileSync("data/belts/white-yellow/content.json", "utf8");
    expect(raw).not.toMatch(/\/Users\/|\/home\/[a-z]|Desktop\\|Documents\\/i);
    expect(raw).not.toMatch(/\.(jpg|jpeg|png|heic)\b/i);
    // No personal kid names (common pattern) — content should be technique-only
    expect(raw.toLowerCase()).not.toMatch(/\b(emma|olivia|noah|liam|debbie'?s (son|daughter|kid))\b/);
  });

  it("exposes notes for Learn without the synthetic glossary card", () => {
    const notes = contentNotes(bundle);
    expect(notes.some((n) => n.id === "glossary-korean-words")).toBe(false);
    expect(notes.some((n) => n.id === "counting-1-to-10-in-korean")).toBe(true);
    expect(loadBeltNotes().map((n) => n.id)).toEqual(notes.map((n) => n.id));
  });

  it("has no DRAFT markings in signed-off content", () => {
    const raw = fs.readFileSync("data/belts/white-yellow/content.json", "utf8");
    expect(raw).not.toMatch(/DRAFT/);
    const sources = fs.readFileSync("data/belts/white-yellow/SOURCES.md", "utf8");
    expect(sources).not.toMatch(/\*\*Status:\s*DRAFT\*\*/i);
  });
});

// Copilot #4529813869 — Learn panels for stances/techniques/Saju/story
describe("Learn panels", () => {
  it("learn.ts includes the missing topic panels", () => {
    const src = fs.readFileSync("app/src/learn.ts", "utf8");
    for (const key of ["stances", "techniques", "saju", "story"]) {
      expect(src).toContain(`key: "${key}"`);
    }
  });
});

describe("browse-only Ask retry", () => {
  it("exposes a Download and start control in the Ask-unavailable panel", () => {
    const html = fs.readFileSync("app/index.html", "utf8");
    expect(html).toMatch(/id="ask-unavailable"/);
    expect(html).toMatch(/id="ask-retry-download"/);
    expect(html).toMatch(/Download and start/);
    const main = fs.readFileSync("app/src/main.ts", "utf8");
    expect(main).toMatch(/ask-retry-download/);
    expect(main).toMatch(/askRetry\.hidden = mode === "no-gpu"/);
  });
});

describe("eval --quality-only", () => {
  it("skips the everyday_practice loop the same way as in-scope and out-of-scope", () => {
    const src = fs.readFileSync("eval/run.ts", "utf8");
    expect(src).toMatch(
      /for \(const item of qualityOnly \? \[\] : \(qs\.everyday_practice/,
    );
  });
});

// Copilot #4529813965 — no duplicate simple/learnBody in cardText
describe("note card text", () => {
  it("does not append learnBody when it equals simple", () => {
    const item = bundle.items.find((i) => i.simple && i.learnBody === i.simple && !i.glossary)!;
    expect(item).toBeTruthy();
    const text = cardText(item);
    const parts = text.split("\n\n");
    const simpleHits = parts.filter((p) => p === item.simple);
    expect(simpleHits.length).toBe(1);
  });
});
