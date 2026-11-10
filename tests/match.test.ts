import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { loadBeltContent } from "../shared/belt-fs.ts";
import { matchQuestion } from "../shared/match.ts";
import { planAsk, isSafetyDecline } from "../shared/answer.ts";
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

  it("does not treat country as a counting question", () => {
    expect(matchQuestion(bundle, "What country is Paris in?")).toBeNull();
    const plan = planAsk(bundle, "What country is Paris in?");
    expect(plan.kind).toBe("gated");
  });

  it("does not match barometer to baro", () => {
    expect(matchQuestion(bundle, "How does a barometer work?")).toBeNull();
  });

  it("safety-gates pain without calling the model", () => {
    expect(isSafetyDecline("My knee hurts when I kick, what should I do?")).toBe(true);
    const plan = planAsk(bundle, "My knee hurts after training. What medicine should I take?");
    expect(plan.kind).toBe("gated");
    if (plan.kind === "gated") expect(plan.text).toBe(PAIN_REPLY);
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
