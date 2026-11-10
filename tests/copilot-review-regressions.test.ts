/**
 * One regression test per Copilot review thread on PR #1.
 * Thread id → what broke → what we assert now.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { loadBeltContent } from "../shared/belt-fs.ts";
import { matchQuestion } from "../shared/match.ts";
import { planAsk, finaliseAsk, finaliseLearnWhy, cardText } from "../shared/answer.ts";
import { checkAnswer, koreanTermsInFacts, koreanTermsInAnswer } from "../shared/check.ts";
import { topicFacts, itemFacts } from "../shared/content.ts";
import { LABEL_NOTES, LABEL_MODEL } from "../shared/provenance.ts";

const bundle = loadBeltContent();

describe("Copilot #4529813608 — do not cache failed navigation responses", () => {
  it("sw-template only puts ok navigation responses in the shell cache", () => {
    const src = fs.readFileSync("app/sw-template.js", "utf8");
    expect(src).toMatch(/if\s*\(\s*!res\.ok\s*\)/);
    expect(src).toMatch(/Never cache HTTP error pages/);
    // Error path must prefer the cached shell, not put(error).
    expect(src).toMatch(/return shell\(\)/);
  });
});

describe("Copilot #4529813669 — validate complete romanised technique phrases", () => {
  it("rejects dollyo chagi when only chagi is in the techniques facts", () => {
    const facts = topicFacts(bundle, "techniques");
    const r = checkAnswer("A front snap kick is called dollyo chagi.", facts, "technique");
    expect(r.ok).toBe(false);
    expect(r.badKorean.some((k) => /dollyo/.test(k))).toBe(true);
  });
});

describe("Copilot #4529813732 — Korean terms at token boundaries (baro ≠ barometer)", () => {
  it("does not match barometer to baro", () => {
    expect(matchQuestion(bundle, "How does a barometer work?")).toBeNull();
    expect(matchQuestion(bundle, "What does baro mean?")?.primary?.id).toBe("baro-return");
  });
});

describe("Copilot #4529813811 — install sheet focus containment", () => {
  it("install-ui traps Tab and restores focus on close", () => {
    const src = fs.readFileSync("app/src/install-ui.ts", "utf8");
    expect(src).toMatch(/trapHandler/);
    expect(src).toMatch(/Escape/);
    expect(src).toMatch(/opener\?\.focus/);
    expect(src).toMatch(/shiftKey/);
  });
});

describe("Copilot #4529813869 — Learn panels for stances/techniques/Saju/story", () => {
  it("learn.ts includes the missing topic panels", () => {
    const src = fs.readFileSync("app/src/learn.ts", "utf8");
    for (const key of ["stances", "techniques", "saju", "story"]) {
      expect(src).toContain(`key: "${key}"`);
    }
  });
});

describe("Copilot #4529813922 — Learn why uses the grounding check", () => {
  it("Learn why falls back to From the notes when the check fails", () => {
    const item = bundle.items.find((i) => i.id === "what-a-pattern-tul-is")!;
    const facts = itemFacts(item, bundle);
    const r = finaliseLearnWhy({
      item,
      facts,
      raw: "Chon-Ji is a way of standing in a ready stance.",
      tokens: 20,
      seconds: 1,
    });
    expect(r.usedCard).toBe(true);
    expect(r.how.source).toBe("notes");
    expect(r.how.label).toBe(LABEL_NOTES);
    expect(r.how.check?.ok).toBe(false);
  });
});

describe("Copilot #4529813965 — no duplicate simple/learnBody in cardText", () => {
  it("does not append learnBody when it equals simple", () => {
    const item = bundle.items.find((i) => i.simple && i.learnBody === i.simple && !i.glossary)!;
    expect(item).toBeTruthy();
    const text = cardText(item);
    const parts = text.split("\n\n");
    const simpleHits = parts.filter((p) => p === item.simple);
    expect(simpleHits.length).toBe(1);
  });
});

describe("Copilot #4529814022 — facts allowlist includes answer extractor phrases", () => {
  it("allows ap kumchi when it appears in the techniques facts", () => {
    const facts = topicFacts(bundle, "techniques");
    expect(koreanTermsInFacts(facts).has("ap kumchi")).toBe(true);
    expect(koreanTermsInAnswer("Hit with ap kumchi.").includes("ap kumchi")).toBe(true);
    expect(checkAnswer("A front snap kick is apcha busigi. Hit with ap kumchi.", facts, "technique").ok).toBe(
      true,
    );
  });
});

describe("Copilot #4529814054 — counting shortcut is whole words only", () => {
  it("does not treat country as counting", () => {
    expect(matchQuestion(bundle, "What country is Paris in?")).toBeNull();
    const plan = planAsk(bundle, "What country is Paris in?");
    expect(plan.kind).toBe("gated");
  });
});
