import { describe, it, expect } from "vitest";
import { loadBeltContent } from "../shared/belt-fs.ts";
import {
  buildQuizBank,
  buildOptionsFromQuestion,
  quizForGrading,
  seededRandom,
  shuffleIds,
} from "../shared/quiz-templates.ts";
import { OPTION_COUNT, sameOption } from "../shared/quiz.ts";

const bundle = loadBeltContent();
const bank = buildQuizBank(bundle);

describe("quiz from content templates", () => {
  it("builds a non-empty bank covering counting, tenets, belts, Chon-Ji", () => {
    expect(bank.length).toBeGreaterThan(20);
    expect(bank.some((q) => q.id.startsWith("num-"))).toBe(true);
    expect(bank.some((q) => q.id === "tenets-list")).toBe(true);
    expect(bank.some((q) => q.id === "cj-moves-count")).toBe(true);
  });

  it("same seed → same round order", () => {
    const ids = bank.map((q) => q.id);
    expect(shuffleIds(ids, seededRandom(42), 10)).toEqual(shuffleIds(ids, seededRandom(42), 10));
    expect(shuffleIds(ids, seededRandom(1), 10)).not.toEqual(shuffleIds(ids, seededRandom(2), 10));
  });

  it("same seed → same options", () => {
    const q = bank[0];
    expect(buildOptionsFromQuestion(q, seededRandom(7))).toEqual(buildOptionsFromQuestion(q, seededRandom(7)));
  });

  it("every question has one correct option and enough wrongs", () => {
    for (const q of bank) {
      const opts = buildOptionsFromQuestion(q, seededRandom(3));
      expect(opts).toHaveLength(OPTION_COUNT);
      expect(opts.filter((o) => o.correct)).toHaveLength(1);
      expect(opts.find((o) => o.correct)!.text).toBe(q.answer);
      for (let i = 0; i < opts.length; i++)
        for (let j = i + 1; j < opts.length; j++) expect(sameOption(opts[i].text, opts[j].text)).toBe(false);
    }
  });

  it("filters by grading", () => {
    const g2 = quizForGrading(bank, "2");
    expect(g2.length).toBeGreaterThan(5);
    expect(g2.every((q) => q.grading === "2")).toBe(true);
  });

  it("wrong-answer reveal includes official wording when the item has it", () => {
    const belt = bank.find((q) => q.id.includes("white-belt"));
    expect(belt?.revealOfficial?.text).toMatch(/innocence/);
    expect(belt?.revealSimple.length).toBeGreaterThan(10);
  });
});
