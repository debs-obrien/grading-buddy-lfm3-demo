import { describe, it, expect } from "vitest";
import {
  ATTEMPTS_KEY,
  parseAttempts,
  serializeAttempts,
  recordAttempt,
  missInfo,
  orderIdsByMisses,
  type Attempt,
} from "../shared/progress.ts";
import { startRound, ROUND_LENGTH } from "../shared/quiz.ts";
import { loadBeltNotes } from "../shared/belt-fs.ts";
import { quizNotes } from "../shared/quiz.ts";
import fs from "node:fs";

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const notes = loadBeltNotes();
const pool = quizNotes(notes);

describe("parseAttempts", () => {
  it("returns [] for missing or empty", () => {
    expect(parseAttempts(null)).toEqual([]);
    expect(parseAttempts(undefined)).toEqual([]);
    expect(parseAttempts("")).toEqual([]);
  });
  it("returns [] for corrupt JSON", () => {
    expect(parseAttempts("{not json")).toEqual([]);
    expect(parseAttempts("null")).toEqual([]);
    expect(parseAttempts("{}")).toEqual([]);
    expect(parseAttempts('"hi"')).toEqual([]);
  });
  it("keeps only well-formed records", () => {
    const raw = JSON.stringify([
      { id: "a", at: "2026-01-01T00:00:00.000Z", correct: false },
      { id: 1, at: "x", correct: true },
      { id: "b", at: "2026-01-02T00:00:00.000Z", correct: true },
      null,
      "nope",
    ]);
    expect(parseAttempts(raw)).toEqual([
      { id: "a", at: "2026-01-01T00:00:00.000Z", correct: false },
      { id: "b", at: "2026-01-02T00:00:00.000Z", correct: true },
    ]);
  });
  it("round-trips through serializeAttempts", () => {
    const a: Attempt[] = [{ id: "x", at: "2026-03-01T12:00:00.000Z", correct: false }];
    expect(parseAttempts(serializeAttempts(a))).toEqual(a);
  });
});

describe("recordAttempt / reset", () => {
  it("appends a record without mutating the input", () => {
    const before: Attempt[] = [];
    const after = recordAttempt(before, "charyot-attention", false, "2026-01-01T00:00:00.000Z");
    expect(before).toEqual([]);
    expect(after).toEqual([{ id: "charyot-attention", at: "2026-01-01T00:00:00.000Z", correct: false }]);
  });
  it("reset is clearing the attempts key only (not the model flag)", () => {
    // Pure side: empty list after clear. Key name stays separate from the model flag.
    expect(ATTEMPTS_KEY).toBe("chonji-attempts");
    expect(ATTEMPTS_KEY).not.toMatch(/model/);
    const store: Record<string, string> = {
      [ATTEMPTS_KEY]: serializeAttempts([{ id: "a", at: "2026-01-01T00:00:00.000Z", correct: false }]),
      "chonji-buddy:model-ready": "1",
    };
    delete store[ATTEMPTS_KEY];
    expect(parseAttempts(store[ATTEMPTS_KEY])).toEqual([]);
    expect(store["chonji-buddy:model-ready"]).toBe("1");
  });
});

describe("orderIdsByMisses / startRound adaptive order", () => {
  const ids = ["a", "b", "c", "d"];

  it("empty history matches a plain shuffle (unchanged behaviour)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rand = seeded(seed);
      const ordered = orderIdsByMisses(ids, [], rand);
      const plain = (() => {
        const r = seeded(seed);
        const a = [...ids];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(r() * (i + 1)) % (i + 1);
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      })();
      expect(ordered).toEqual(plain);
    }
    // startRound with no attempts equals today's shuffle-then-slice
    for (let seed = 1; seed <= 10; seed++) {
      expect(startRound(pool, seeded(seed)).ids).toEqual(startRound(pool, seeded(seed), ROUND_LENGTH, []).ids);
    }
  });

  it("puts most-missed ids first", () => {
    const attempts: Attempt[] = [
      { id: "c", at: "2026-01-01T00:00:00.000Z", correct: false },
      { id: "c", at: "2026-01-02T00:00:00.000Z", correct: false },
      { id: "c", at: "2026-01-03T00:00:00.000Z", correct: false },
      { id: "a", at: "2026-01-04T00:00:00.000Z", correct: false },
      { id: "a", at: "2026-01-05T00:00:00.000Z", correct: false },
      { id: "b", at: "2026-01-06T00:00:00.000Z", correct: false },
      { id: "d", at: "2026-01-07T00:00:00.000Z", correct: true }, // correct → not a miss
    ];
    const ordered = orderIdsByMisses(ids, attempts, seeded(1));
    expect(ordered[0]).toBe("c");
    expect(ordered[1]).toBe("a");
    expect(ordered[2]).toBe("b");
    expect(ordered[3]).toBe("d");
    expect(missInfo(attempts).get("c")).toEqual({ count: 3, lastAt: "2026-01-03T00:00:00.000Z" });
  });

  it("breaks miss-count ties by most recent miss", () => {
    const attempts: Attempt[] = [
      { id: "a", at: "2026-01-01T00:00:00.000Z", correct: false },
      { id: "b", at: "2026-01-10T00:00:00.000Z", correct: false },
    ];
    // Same miss count (1); b was missed more recently → b first
    expect(orderIdsByMisses(["a", "b", "c"], attempts, seeded(3))[0]).toBe("b");
    expect(orderIdsByMisses(["a", "b", "c"], attempts, seeded(3))[1]).toBe("a");
  });

  it("startRound still takes ROUND_LENGTH with no repeats under adaptive order", () => {
    const attempts: Attempt[] = pool.slice(0, 5).flatMap((n, i) =>
      Array.from({ length: 5 - i }, (_, k) => ({
        id: n.id,
        at: `2026-01-${String(k + 1).padStart(2, "0")}T00:00:00.000Z`,
        correct: false as const,
      })),
    );
    const r = startRound(pool, seeded(9), ROUND_LENGTH, attempts);
    expect(r.ids).toHaveLength(ROUND_LENGTH);
    expect(new Set(r.ids).size).toBe(ROUND_LENGTH);
    // The five most-missed pool notes should lead the round
    expect(r.ids.slice(0, 5)).toEqual(pool.slice(0, 5).map((n) => n.id));
  });
});
