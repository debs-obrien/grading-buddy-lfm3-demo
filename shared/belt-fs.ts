// Node helper (tests, eval, scripts): load one belt module's content from disk.
import fs from "node:fs";
import path from "node:path";
import { beltContent, beltNotes, DEFAULT_BELT } from "./belts.ts";
import type { ContentBundle } from "./content.ts";

export function loadBeltContent(id = DEFAULT_BELT, root = process.cwd()): ContentBundle {
  return beltContent(id, (p) => {
    const f = path.join(root, p);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : undefined;
  });
}

export function loadBeltNotes(id = DEFAULT_BELT, root = process.cwd()) {
  return beltNotes(id, (p) => {
    const f = path.join(root, p);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : undefined;
  });
}
