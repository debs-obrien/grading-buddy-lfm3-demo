import { describe, it, expect } from "vitest";
import { checkAnswer } from "../shared/check.ts";
import { answerContradictsCategory } from "../shared/categories.ts";
import { loadBeltContent } from "../shared/belt-fs.ts";
import { topicFacts } from "../shared/content.ts";

describe("grounding check", () => {
  const facts = `Title: Counting 1 to 10 in Korean
Type: counting
Counting 1 to 10:
1 hana
2 dul
3 set
4 net
5 dasot
6 yosot
7 ilgop
8 yodul
9 ahop
10 yol
Simple: count in Korean.`;

  it("passes when every Korean word and number is in the facts", () => {
    expect(checkAnswer("1 hana, 2 dul, 3 set, 4 net, 5 dasot, 6 yosot, 7 ilgop, 8 yodul, 9 ahop, 10 yol.", facts).ok).toBe(
      true,
    );
  });

  it("fails on a Korean word not in the facts", () => {
    const r = checkAnswer("Chon-Ji has a turning kick called dollyo chagi.", facts);
    expect(r.ok).toBe(false);
    expect(r.badKorean.length).toBeGreaterThan(0);
  });

  // Copilot #4529813669 — validate complete romanised technique phrases
  it("rejects an unsupported technique modifier even when the head word is allowed", () => {
    const bundle = loadBeltContent();
    const techFacts = topicFacts(bundle, "techniques");
    const r = checkAnswer("A front snap kick is called dollyo chagi.", techFacts, "technique");
    expect(r.ok).toBe(false);
    expect(r.badKorean.some((k) => /dollyo/.test(k))).toBe(true);
  });

  // Copilot #4529814022 — facts allowlist includes answer extractor phrases
  it("allows known technique phrases that appear in the facts", () => {
    const bundle = loadBeltContent();
    const techFacts = topicFacts(bundle, "techniques");
    expect(checkAnswer("A front snap kick is apcha busigi. Hit with ap kumchi.", techFacts, "technique").ok).toBe(
      true,
    );
  });

  it("allows a stance sub-phrase when the full term is in the facts", () => {
    const bundle = loadBeltContent();
    const facts = topicFacts(bundle, "chonji");
    expect(checkAnswer("Chon-Ji starts in parallel ready stance (narani junbi sogi).", facts, "pattern").ok).toBe(
      true,
    );
  });

  it("fails on a number not in the facts", () => {
    const r = checkAnswer("There are 24 patterns.", facts);
    expect(r.ok).toBe(false);
    expect(r.badNumbers).toContain("24");
  });

  it("fails on Hangul", () => {
    expect(checkAnswer("셋 is three.", facts).ok).toBe(false);
  });
});

describe("category / type check (no per-question specials)", () => {
  it("rejects calling a pattern a stance (Debbie's live wrong answer shape)", () => {
    const bad =
      "In Taekwondo, Chon-Ji is a way of standing and moving. You start in a 'ready' stance, like you are ready to fight.";
    expect(answerContradictsCategory(bad, "pattern")).toBe("stance");
    const facts = "Type: pattern\nChon-Ji is a pattern.\n19 moves.";
    const r = checkAnswer(bad, facts, "pattern");
    expect(r.ok).toBe(false);
    expect(r.badCategory).toBe("stance");
  });

  it("allows mentioning a stance when the item is a pattern (starts in a stance)", () => {
    const ok = "Chon-Ji is a pattern. It starts in parallel ready stance and has 19 moves.";
    expect(answerContradictsCategory(ok, "pattern")).toBeNull();
    const facts = "Type: pattern\nTitle: What Chon-Ji means\nChon-Ji\n19\npattern\nparallel ready stance";
    expect(checkAnswer(ok, facts, "pattern").ok).toBe(true);
  });

  it("rejects calling a stance a pattern", () => {
    expect(answerContradictsCategory("Gunnun sogi is a pattern you walk in.", "stance")).toBe("pattern");
  });
});
