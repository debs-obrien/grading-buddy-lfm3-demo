import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { loadBeltNotes } from "../shared/belt-fs.ts";
import { chonjiMoves, stepIndex } from "../shared/chonji.ts";

const notes = loadBeltNotes();
const moves = chonjiMoves(notes);

describe("Chon-Ji moves from the notes", () => {
  it("has moves 1 to 19 plus the ending, in order", () => {
    expect(moves.map((m) => m.label)).toEqual([...Array.from({ length: 19 }, (_, i) => String(i + 1)), "End"]);
  });
  it("uses each note line word for word", () => {
    const body = notes.filter((n) => n.id.startsWith("chon-ji-moves-")).map((n) => n.body).join("\n");
    for (const m of moves.filter((x) => x.label !== "End")) expect(body).toContain(`${m.label}. ${m.text}`);
  });
  it("reads the direction letters from the text", () => {
    const d = moves.map((m) => m.dir).join("");
    expect(d.slice(0, 19)).toBe("BBAADDCCAABBCCDDDDD");
    expect(moves.filter((m) => m.backward).map((m) => m.n)).toEqual([18, 19]);
  });
  it("has no 'check with your instructor' tags now the ending (left foot) and kihap are settled", () => {
    expect(moves.filter((m) => m.check).map((m) => m.label)).toEqual([]);
    expect(moves.at(-1)!.text).toBe("bring the left foot back to parallel ready stance.");
    expect(moves.map((m) => m.text).join(" ")).not.toMatch(/kihap/i);
  });
});

describe("step-through index", () => {
  it("starts at the first move on Next and at End on Prev", () => {
    expect(stepIndex(-1, 1, 20)).toBe(0);
    expect(stepIndex(-1, -1, 20)).toBe(19);
  });
  it("wraps End -> move 1 and move 1 -> End", () => {
    expect(stepIndex(19, 1, 20)).toBe(0);
    expect(stepIndex(0, -1, 20)).toBe(19);
    expect(stepIndex(4, 1, 20)).toBe(5);
  });
  it("carries on from a tapped move", () => {
    const tapped = 9; // select(9) sets the index directly
    expect(stepIndex(tapped, 1, 20)).toBe(10);
    expect(stepIndex(tapped, -1, 20)).toBe(8);
  });
});
