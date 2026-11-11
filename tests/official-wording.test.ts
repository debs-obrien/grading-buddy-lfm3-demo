import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { loadBeltContent } from "../shared/belt-fs.ts";

/**
 * Every official quote in content.json must match the source text character for character.
 * Expected strings are the signed-off official ITF wording (see SOURCES.md).
 */
const EXPECTED: Record<string, { source: string; text: string }> = {
  "what-the-white-belt-means": {
    source: "NZ-HB",
    text: "White signifies innocence, as that of a beginning student who has no previous knowledge of Taekwon-Do.",
  },
  "what-the-yellow-belt-means": {
    source: "NZ-HB",
    text: "Yellow signifies the earth from which a plant sprouts and takes root as the Taekwon-Do foundation is being laid.",
  },
  "what-chon-ji-means": {
    source: "NZ-HB",
    text: "Chon-Ji means literally “the Heaven the Earth”. It is, in the Orient, interpreted as the creation of the world or the beginning of human history, therefore, it is the initial pattern played by the beginner. This pattern consists of two similar parts; one to represent the Heaven and the other the Earth.",
  },
  "the-five-tenets": {
    source: "ITF-P",
    text: "1. Courtesy. 2. Integrity. 3. Perseverance. 4. Self-Control. 5. Indomitable Spirit.",
  },
  "the-student-oath": {
    source: "ITF-P",
    text: [
      "I shall observe the Tenets of Taekwon-Do",
      "I shall respect the Instructor and Seniors.",
      "I shall never misuse Taekwon-Do.",
      "I shall be a champion of freedom and justice.",
      "I shall build a more peaceful world.",
    ].join("\n"),
  },
};

/** Quotes that SOURCES.md records character for character (tenets/oath are paraphrased there). */
const QUOTED_IN_SOURCES = new Set([
  "what-the-white-belt-means",
  "what-the-yellow-belt-means",
  "what-chon-ji-means",
]);

describe("official ITF wording", () => {
  const bundle = loadBeltContent();
  const sources = fs.readFileSync("data/belts/white-yellow/SOURCES.md", "utf8");

  it("has an official quote for each signed-off formula", () => {
    for (const id of Object.keys(EXPECTED)) {
      const item = bundle.items.find((i) => i.id === id);
      expect(item?.official, id).toBeTruthy();
      expect(item!.official!.source).toBe(EXPECTED[id].source);
    }
  });

  for (const [id, exp] of Object.entries(EXPECTED)) {
    it(`${id}: character-for-character match`, () => {
      const item = bundle.items.find((i) => i.id === id)!;
      expect(item.official!.text).toBe(exp.text);
      if (QUOTED_IN_SOURCES.has(id)) {
        expect(sources).toContain(exp.text);
      }
    });
  }
});
