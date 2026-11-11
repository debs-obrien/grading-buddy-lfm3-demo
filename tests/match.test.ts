import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { loadBeltContent } from "../shared/belt-fs.ts";
import { matchQuestion } from "../shared/match.ts";
import { planAsk, finaliseAsk, isSafetyDecline } from "../shared/answer.ts";
import { topicFacts } from "../shared/content.ts";
import { DECLINE, PAIN_REPLY } from "../shared/config.ts";
import { matchesExpected, gradeOutOfScope } from "../eval/grade.ts";

const bundle = loadBeltContent();
const qs = JSON.parse(fs.readFileSync("eval/questions.json", "utf8"));

describe("topic matching", () => {
  it("maps korean words questions to the glossary", () => {
    const m = matchQuestion(bundle, "what korean words do i need to know");
    expect(m?.topic.id).toBe("glossary");
  });

  it("maps counting questions to the counting topic (one item)", () => {
    for (const q of [
      "what are the korean words for counting",
      "how do I count to 10 in Korean",
      "How do I count to 10 in Korean?",
      "numbers one to ten in Korean",
      "how do you say 1-10",
      "what are the Korean numbers 1-10",
      "how do i cont to 10 in korean",
      "how do i cout to 10 in korean",
    ]) {
      const m = matchQuestion(bundle, q);
      expect(m?.topic.id, q).toBe("counting");
      expect(m?.items.some((i) => i.numbers?.length === 10)).toBe(true);
    }
  });

  it("maps Chon-Ji move count to chonji", () => {
    const m = matchQuestion(bundle, "How many moves are in Chon-Ji?");
    expect(m?.topic.id).toBe("chonji");
    expect(m?.items.some((i) => i.id === "how-many-moves-chon-ji-has")).toBe(true);
  });

  it("maps 'explain chon ji like im 5' to the Chon-Ji pattern topic", () => {
    const m = matchQuestion(bundle, "explain chon ji like im 5");
    expect(m?.topic.id).toBe("chonji");
    expect(m?.primary?.category ?? bundle.items.find((i) => i.id === m?.primary?.id)?.category).toBe("pattern");
  });

  it("refuses off-topic with the fixed decline (no model)", () => {
    const plan = planAsk(bundle, "What is the capital of France?");
    expect(plan.kind).toBe("gated");
    if (plan.kind === "gated") {
      expect(plan.text).toBe(DECLINE);
      expect(plan.gateReason).toBe("no-match");
    }
  });

  // Copilot #4529814054 — counting shortcut is whole words only
  it("does not treat country as a counting question", () => {
    expect(matchQuestion(bundle, "What country is Paris in?")).toBeNull();
    const plan = planAsk(bundle, "What country is Paris in?");
    expect(plan.kind).toBe("gated");
  });

  // Copilot #4529813732 — Korean terms at token boundaries (baro ≠ barometer)
  it("does not match barometer to baro", () => {
    expect(matchQuestion(bundle, "How does a barometer work?")).toBeNull();
    expect(matchQuestion(bundle, "What does baro mean?")?.primary?.id).toBe("baro-return");
  });

  it("safety-gates pain without calling the model", () => {
    expect(isSafetyDecline("My knee hurts when I kick, what should I do?")).toBe(true);
    const plan = planAsk(bundle, "My knee hurts after training. What medicine should I take?");
    expect(plan.kind).toBe("gated");
    if (plan.kind === "gated") expect(plan.text).toBe(PAIN_REPLY);
  });

  it("matches everyday in-scope phrasings that kids actually ask", () => {
    for (const q of [
      "how many tenets",
      "what is 3 in korean",
      "what's 1 to 5 in Korean",
      "who invented taekwondo",
      "what is a pattern",
      "what do i call my instructor",
      "when was the ITF founded",
    ]) {
      const plan = planAsk(bundle, q);
      expect(plan.kind, q).toBe("model");
    }
  });

  it("routes middle punch to the front-punch technique (not height alone)", () => {
    const plan = planAsk(bundle, "how do i do a middle punch");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    expect(plan.match.topic.id).toBe("techniques");
    expect(plan.cardItem.id).toBe("front-punch-ap-jirugi");
    expect(plan.cardItem.simple.toLowerCase()).toMatch(/punch|jirugi/);
  });

  it("routes turn-in-chon-ji to a Chon-Ji move card with direction (not generic dolgi)", () => {
    const plan = planAsk(bundle, "which way do i turn in chon ji");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    expect(plan.match.topic.id).toBe("chonji");
    expect(plan.cardItem.topic).toBe("chonji");
    const body = `${plan.cardItem.simple} ${plan.cardItem.learnBody ?? ""}`.toLowerCase();
    expect(body).toMatch(/turn/);
    expect(body).toMatch(/clockwise|right|left/);
  });

  it("refuses other-art and generic comes-after questions", () => {
    for (const q of ["How do I do a low block in karate?", "What comes after Christmas?"]) {
      const plan = planAsk(bundle, q);
      expect(plan.kind, q).toBe("gated");
      if (plan.kind === "gated") expect(plan.text).toBe(DECLINE);
    }
  });

  it("refuses shared-word off-topic questions (maths, dress, tea, parting, won, film set)", () => {
    for (const q of [
      "what is a pattern in maths",
      "what is a pattern on a dress",
      "what is a kup of tea",
      "how do i do a middle parting",
      "what is 5 in korean won",
      "what is a film set",
    ]) {
      const plan = planAsk(bundle, q);
      expect(plan.kind, q).toBe("gated");
      if (plan.kind === "gated") expect(plan.text).toBe(DECLINE);
    }
  });

  it("still answers in-scope dobok questions that mention clothing", () => {
    const plan = planAsk(bundle, "what is a dobok and what clothing is it?");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    expect(`${plan.cardItem.simple} ${plan.cardItem.english}`.toLowerCase()).toMatch(
      /dobok|uniform/,
    );
  });

  it("matches what number is yodul to counting and requires the digit", () => {
    const plan = planAsk(bundle, "what number is yodul");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    expect(plan.match.topic.id).toBe("counting");
    expect(plan.requiredFacts.some((r) => r.id === "count-8")).toBe(true);
    expect(plan.requiredFacts[0].alts).toEqual(expect.arrayContaining(["8", "eight"]));
    expect(plan.requiredFacts[0].alts).not.toContain("yodul");
    const bad = finaliseAsk("Yodul.", plan);
    expect(bad.usedCard).toBe(true);
    const ok = finaliseAsk("Yodul is 8.", plan);
    expect(ok.usedCard).toBe(false);
  });

  it("maps dool to dul for reverse number asks", () => {
    const plan = planAsk(bundle, "what number is dool");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    expect(plan.requiredFacts.some((r) => r.id === "count-2")).toBe(true);
  });

  it("routes last-move, courtesy, and five-tenets-including to the answering note cards", () => {
    const last = planAsk(bundle, "what is the last move of chon ji");
    expect(last.kind).toBe("model");
    if (last.kind === "model") {
      expect(last.cardItem.id).toBe("chon-ji-moves-17-to-19-and-the-end");
      expect(`${last.cardItem.simple} ${last.cardItem.learnBody}`.toLowerCase()).toMatch(
        /left.*punch|punch.*right|19/,
      );
    }
    const courtesy = planAsk(bundle, "what is courtesy");
    expect(courtesy.kind).toBe("model");
    if (courtesy.kind === "model") {
      expect(courtesy.cardItem.id).toBe("courtesy");
      expect(courtesy.cardItem.simple.toLowerCase()).toMatch(/polite|please|kind/);
    }
    const five = planAsk(bundle, "what are the five tenets including courtesy");
    expect(five.kind).toBe("model");
    if (five.kind === "model") {
      expect(five.cardItem.id).toBe("the-five-tenets");
    }
  });
});

describe("frozen eval: match or refuse every question", () => {
  for (const item of qs.in_scope) {
    it(`in-scope: ${item.id}`, () => {
      const plan = planAsk(bundle, item.q);
      expect(plan.kind, item.q).toBe("model");
      if (plan.kind !== "model") return;
      // Topic facts must contain the expected keywords (forbid_re is for model wording, not matching).
      const facts = topicFacts(bundle, plan.match.topic.id);
      expect(matchesExpected(facts, item.expect), `${item.q} → ${plan.match.topic.id}`).toBe(true);
    });
  }

  for (const item of qs.out_of_scope) {
    it(`out-of-scope: ${item.id}`, () => {
      const plan = planAsk(bundle, item.q);
      if (plan.kind === "gated") {
        expect(gradeOutOfScope(plan.text)).toBe("correctly_declined");
      } else {
        expect.fail(`Expected refusal for "${item.q}", matched topic ${plan.match.topic.id} (${plan.cardItem.id}, score ${plan.match.score})`);
      }
    });
  }
});
