import { describe, it, expect } from "vitest";
import { checkAnswer } from "../shared/check.ts";
import { answerContradictsCategory } from "../shared/categories.ts";
import { loadBeltContent } from "../shared/belt-fs.ts";
import { topicFacts } from "../shared/content.ts";
import { planAsk, finaliseAsk, stripThinking } from "../shared/answer.ts";

describe("stripThinking", () => {
  it("keeps only text after the last </think> (Liquid chat_template split[-1])", () => {
    expect(stripThinking("<think>secret</think>Charyot means attention.")).toBe(
      "Charyot means attention.",
    );
    // Multiple closes — same as content.split("</think>")[-1]
    expect(stripThinking("first</think>second</think>third")).toBe("third");
  });

  it("handles an unpaired </think> without replacing it with a space", () => {
    // Real eval shape: answer</think>answer — must not glue both copies.
    expect(stripThinking("1 hana, 2 dul, 10 yol.</think>1 hana, 2 dul, 3 set")).toBe(
      "1 hana, 2 dul, 3 set",
    );
    expect(stripThinking("Junbi means ready.</think>Junbi means ready.")).toBe("Junbi means ready.");
    // No space substitution artifact
    expect(stripThinking("ready.</think>Junbi")).not.toMatch(/ready\.\s*Junbi/);
    expect(stripThinking("ready.</think>Junbi")).toBe("Junbi");
  });

  it("drops a leaked unclosed <think> (enable_thinking=False can still open one)", () => {
    expect(stripThinking("<think>Simple: 10th kup. After white comes 1 then 2")).toBe("");
    expect(
      stripThinking(
        "<think>We need to answer the question from the FACTS.\n\nLooking at the FACTS:",
      ),
    ).toBe("");
    // Answer then a fresh unclosed think block — keep the answer only
    expect(stripThinking("Chon-Ji has 19 moves.<think>wait, also check")).toBe(
      "Chon-Ji has 19 moves.",
    );
  });
});

describe("short verbatim repeats fall back to notes", () => {
  it("treats a short repeated sentence as broken (e.g. 5 dasot. 5 dasot.)", () => {
    const plan = planAsk(loadBeltContent(), "whats 5 in korean");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    const r = finaliseAsk("5 dasot. 5 dasot.", plan);
    expect(r.usedCard).toBe(true);
    expect(r.how.source).toBe("notes");
    expect(r.how.check?.ok).toBe(false);
    expect(r.how.check?.summary ?? "").toMatch(/repeated|note instead/i);
  });
});

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

  it("rejects the wrong Korean name for a kick in general (not only dollyo)", () => {
    const bundle = loadBeltContent();
    const techFacts = topicFacts(bundle, "techniques");
    for (const bad of ["yop chagi", "ap chagi", "nopunde chagi"]) {
      const r = checkAnswer(`A front snap kick is called ${bad}.`, techFacts, "technique");
      expect(r.ok, bad).toBe(false);
      expect(r.badKorean.some((k) => k.includes("chagi")), bad).toBe(true);
    }
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
