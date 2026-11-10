import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { BELTS, DEFAULT_BELT, selectBelt, beltNotes, beltContent } from "../shared/belts.ts";
import { loadBeltNotes, loadBeltContent } from "../shared/belt-fs.ts";

describe("belt registry", () => {
  it("lists belts in ITF order with white to yellow ready and the rest locked", () => {
    expect(BELTS.map((b) => b.id)).toEqual(["white-yellow", "green", "blue", "red", "black"]);
    expect(BELTS.filter((b) => b.status === "ready").map((b) => b.id)).toEqual(["white-yellow"]);
    expect(DEFAULT_BELT).toBe("white-yellow");
  });
  it("exposes short tab labels and full aria names", () => {
    expect(BELTS.map((b) => b.tab)).toEqual(["Yellow", "Green", "Blue", "Red", "Black"]);
    expect(BELTS.map((b) => b.label)).toEqual(["White to yellow", "Green", "Blue", "Red", "Black"]);
  });
  it("locked belts can't be selected and have no content file", () => {
    for (const b of BELTS.filter((x) => x.status === "locked")) {
      expect(selectBelt(b.id)).toBeNull();
      expect(b.contentPath).toBeUndefined();
      expect(fs.existsSync(`data/belts/${b.id}`)).toBe(false);
    }
    expect(selectBelt("no-such-belt")).toBeNull();
  });
  it("locked belts contribute no notes", () => {
    const read = () => JSON.stringify({ about: "", gradingScope: "", topics: [], items: [], glossary: [] });
    for (const b of BELTS.filter((x) => x.status === "locked")) expect(beltNotes(b.id, read)).toEqual([]);
    expect(loadBeltNotes("green")).toEqual([]);
  });
  it("the active belt loads only its own content module", () => {
    const paths: string[] = [];
    beltContent(DEFAULT_BELT, (p) => (paths.push(p), fs.readFileSync(p, "utf8")));
    expect(paths).toEqual(["data/belts/white-yellow/content.json"]);
    expect(loadBeltContent().items.length).toBeGreaterThan(40);
    expect(loadBeltNotes().length).toBeGreaterThan(40);
  });
});
