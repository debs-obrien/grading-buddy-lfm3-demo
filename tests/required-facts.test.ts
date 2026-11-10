import { describe, it, expect } from "vitest";
import { loadBeltContent } from "../shared/belt-fs.ts";
import { planAsk, finaliseAsk, stripThinking, LABEL_NOTES, LABEL_MODEL } from "../shared/answer.ts";
import { checkAnswer, unsupportedBodyParts } from "../shared/check.ts";
import { topicFacts } from "../shared/content.ts";
import { requiredFactsForMatch, checkRequiredFacts } from "../shared/required-facts.ts";
import { matchQuestion } from "../shared/match.ts";

const bundle = loadBeltContent();

describe("required facts from content (not eval)", () => {
  it("Chon-Ji meaning/what-is requires pattern, heaven, earth, and 19 from content", () => {
    for (const q of ["what does chon-ji mean", "what is chon-ji", "explain chon ji like im 5"]) {
      const m = matchQuestion(bundle, q)!;
      const req = requiredFactsForMatch(bundle, m, q);
      expect(req.some((r) => r.id === "chonji-moves"), q).toBe(true);
      expect(req.some((r) => r.id === "chonji-heaven"), q).toBe(true);
      expect(req.find((r) => r.id === "chonji-moves")!.alts).toContain("19");
    }
  });

  it("falls back to From the notes when Chon-Ji meaning omits 19", () => {
    const plan = planAsk(bundle, "what does chon-ji mean");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    const r = finaliseAsk(
      "Chon-Ji means the Heaven the Earth; it is the first pattern with two parts for Heaven and Earth.",
      plan,
    );
    expect(r.usedCard).toBe(true);
    expect(r.how.source).toBe("notes");
    expect(r.how.label).toBe(LABEL_NOTES);
    expect(r.how.path).toBe("missing-required-fact");
    expect(r.how.check?.missingRequired?.some((m) => /chonji-moves/.test(m))).toBe(true);
  });

  it("keeps Written by LFM3 when Chon-Ji identity facts are all present", () => {
    const plan = planAsk(bundle, "what does chon-ji mean");
    if (plan.kind !== "model") throw new Error("expected model");
    const r = finaliseAsk(
      "Chon-Ji means the Heaven the Earth. It is the first pattern and has 19 moves.",
      plan,
    );
    expect(r.usedCard).toBe(false);
    expect(r.how.source).toBe("model");
    expect(r.how.label).toBe(LABEL_MODEL);
  });

  it("glossary coverage falls back to the full notes when too thin", () => {
    const plan = planAsk(bundle, "what korean words do i need to know");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    const r = finaliseAsk("Charyot means attention. Junbi means ready.", plan);
    expect(r.usedCard).toBe(true);
    expect(r.how.label).toBe(LABEL_NOTES);
    expect(r.how.path).toBe("missing-required-fact");
  });

  it("single-number counting questions do not require the whole 1–10 list", () => {
    const plan = planAsk(bundle, "How do you say three in Korean?");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    expect(plan.requiredFacts.length).toBe(1);
    expect(plan.requiredFacts[0].alts).toContain("set");
    const r = finaliseAsk("Three in Korean is set, from the counting list.", plan);
    expect(r.how.source).toBe("model");
    expect(r.how.label).toBe(LABEL_MODEL);
  });
});

describe("unsupported body-part claims", () => {
  const kick = bundle.items.find((i) => i.id === "front-snap-kick-apcha-busigi")!;
  const facts = topicFacts(bundle, "techniques");

  it("content supports knee for the front snap kick (frozen forbid_re conflicts)", () => {
    expect(kick.simple.toLowerCase()).toContain("knee");
    expect(unsupportedBodyParts(kick.simple, facts)).toEqual([]);
  });

  it("rejects a body-part claim that never appears in the facts", () => {
    const ans = "Pull your toes back and twist your elbow as you kick.";
    const bad = unsupportedBodyParts(ans, facts);
    expect(bad.some((p) => /elbow/.test(p))).toBe(true);
    expect(checkAnswer(ans, facts, "technique").ok).toBe(false);
  });

  it("allows knee when the notes describe lifting the knee", () => {
    const ans =
      "Pulling your toes back helps you hit with the ball of your foot. Lift your knee, snap your foot out.";
    expect(checkAnswer(ans, facts, "technique").ok).toBe(true);
  });
});

describe("unclosed think strip", () => {
  it("stops leaked numbers from an unclosed think block failing the belt check", () => {
    const plan = planAsk(bundle, "What belt comes after white?");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    const raw =
      '<think>We need to answer. Simple: 10th kup. After white comes 1 then 2 more thoughts';
    expect(stripThinking(raw)).toBe("");
    // Realistic leak: think then a short answer
    const raw2 =
      "<think>numbers 1 and 2 here</think>After white belt comes a white belt with a yellow stripe (9th kup).";
    const r = finaliseAsk(raw2, plan);
    expect(r.how.source).toBe("model");
    expect(r.how.label).toBe(LABEL_MODEL);
    expect(r.usedCard).toBe(false);
  });
});
