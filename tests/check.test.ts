import { describe, it, expect } from "vitest";
import { checkAnswer } from "../shared/check.ts";
import { answerContradictsCategory } from "../shared/categories.ts";
import { loadBeltContent } from "../shared/belt-fs.ts";
import { topicFacts } from "../shared/content.ts";
import { planAsk, finaliseAsk } from "../shared/answer.ts";

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

  it("finaliseAsk shows the item card when the model misstates the type", () => {
    const bundle = loadBeltContent();
    const plan = planAsk(bundle, "explain chon ji like im 5");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    expect(plan.cardItem.category).toBe("pattern");
    const final = finaliseAsk(
      "In Taekwondo, Chon-Ji is a way of standing and moving. You start in a 'ready' stance, like you are ready to fight.",
      plan,
    );
    expect(final.usedCard).toBe(true);
    expect(final.how.source).toBe("notes");
    expect(final.how.label).toBe("From the notes");
    expect(final.text.toLowerCase()).toMatch(/pattern|heaven|earth|19/);
  });

  it("topic facts for Chon-Ji include type, official meaning and 19", () => {
    const bundle = loadBeltContent();
    const facts = topicFacts(bundle, "chonji");
    expect(facts).toMatch(/Type: pattern/);
    expect(facts).toContain("the Heaven the Earth");
    expect(facts).toMatch(/\b19\b/);
  });
});
