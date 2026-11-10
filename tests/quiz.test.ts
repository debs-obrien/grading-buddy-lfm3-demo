import { describe, it, expect } from "vitest";
import { loadBeltNotes } from "../shared/belt-fs.ts";
import {
  quizNotes,
  pickQuestion,
  buildOptions,
  distractorPool,
  sameOption,
  addResult,
  OPTION_COUNT,
  noteWhy,
  startRound,
} from "../shared/quiz.ts";
import { seededRandom } from "../shared/quiz-templates.ts";
import { matchesExpected, gradeInScope, gradeOutOfScope } from "../eval/grade.ts";
import { DECLINE } from "../shared/config.ts";

const notes = loadBeltNotes();
const quiz = quizNotes(notes);

describe("quiz helpers (notes view)", () => {
  it("filters by grading", () => {
    const g2 = quizNotes(notes, "2");
    expect(g2.length).toBeGreaterThan(5);
    expect(g2.every((n) => n.grading === "2")).toBe(true);
  });
  it("picks deterministically with a fixed random and avoids repeating", () => {
    expect(pickQuestion(quiz, () => 0).id).toBe(quiz[0].id);
    expect(pickQuestion(quiz, () => 0, quiz[0].id).id).toBe(quiz[1].id);
  });
  it("keeps score", () => {
    expect(addResult(addResult({ right: 0, asked: 0 }, true), false)).toEqual({ right: 1, asked: 2 });
  });
  it("seeded round order is stable", () => {
    const a = startRound(quiz, seededRandom(99), 10);
    const b = startRound(quiz, seededRandom(99), 10);
    expect(a.ids).toEqual(b.ids);
  });
});

describe("multiple-choice options from notes", () => {
  it("every quiz note has a Wrong list or a Kind", () => {
    const bad = quiz.filter((n) => !n.wrong?.length && !n.kind).map((n) => n.id);
    expect(bad).toEqual([]);
  });

  for (const note of quiz) {
    it(`${note.id}: exactly one correct, no duplicates`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const opts = buildOptions(note, notes, seededRandom(seed));
        expect(opts).toHaveLength(OPTION_COUNT);
        expect(opts.filter((o) => o.correct)).toHaveLength(1);
        expect(opts.find((o) => o.correct)!.text).toBe(note.answer);
        for (let i = 0; i < opts.length; i++)
          for (let j = i + 1; j < opts.length; j++) expect(sameOption(opts[i].text, opts[j].text)).toBe(false);
      }
    });
  }

  it("uses other answers of the same kind when there is no Wrong list", () => {
    const n = notes.find((x) => x.id === "charyot-attention")!;
    expect(n.wrong).toBeUndefined();
    expect(n.kind).toBe("command");
    expect(distractorPool(n, notes).length).toBeGreaterThanOrEqual(2);
  });
});

describe("noteWhy", () => {
  it("prefers hand-written Why, else official + simple", () => {
    const white = notes.find((n) => n.id === "what-the-white-belt-means")!;
    const why = noteWhy(white);
    expect(why).toMatch(/Official ITF wording|In simple words|innocence|beginner/i);
  });
});

describe("eval graders still work", () => {
  it("matches expected keywords", () => {
    expect(matchesExpected("Chon-Ji has 19 moves.", [["19", "nineteen"]])).toBe(true);
    expect(gradeInScope(DECLINE, [["19"]])).toBe("wrongly_declined");
    expect(gradeOutOfScope(DECLINE)).toBe("correctly_declined");
  });
});
