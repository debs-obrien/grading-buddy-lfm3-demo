import { describe, it, expect } from "vitest";
import {
  optionLabel,
  recordAnswer,
  progressText,
  encouragement,
  roundRight,
  roundTotal,
  isRoundOver,
  currentId,
  missed,
  ROUND_LENGTH,
  type Round,
} from "../shared/quiz.ts";
import { matchesExpected, matchesExpectedInOrder, gradeInScope, gradeOutOfScope } from "../eval/grade.ts";
import { DECLINE } from "../shared/config.ts";

describe("quiz round helpers (used by the app)", () => {
  it("tracks progress, answers, and end-of-round copy", () => {
    let round: Round = { ids: ["a", "b", "c"], results: [] };
    expect(progressText(round)).toBe("Question 1 of 3");
    expect(currentId(round)).toBe("a");
    round = recordAnswer(round, true, "yes");
    round = recordAnswer(round, false, "no");
    expect(roundRight(round)).toBe(1);
    expect(roundTotal(round)).toBe(3);
    expect(missed(round)).toHaveLength(1);
    expect(optionLabel("Attention.")).toBe("Attention");
    expect(encouragement(3, 3)).toMatch(/Perfect/);
    round = recordAnswer(round, true, "ok");
    expect(isRoundOver(round)).toBe(true);
    expect(ROUND_LENGTH).toBe(10);
  });
});

describe("eval graders", () => {
  it("matches expected keywords and ordered groups", () => {
    expect(matchesExpected("Chon-Ji has 19 moves.", [["19", "nineteen"]])).toBe(true);
    expect(matchesExpectedInOrder("1 hana 2 dul 3 set", [["1"], ["2"], ["3"]])).toBe(true);
    expect(matchesExpectedInOrder("3 set 1 hana", [["1"], ["2"], ["3"]])).toBe(false);
    expect(gradeInScope(DECLINE, [["19"]])).toBe("wrongly_declined");
    expect(gradeOutOfScope(DECLINE)).toBe("correctly_declined");
  });
});
