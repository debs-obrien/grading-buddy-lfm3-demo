// Belt registry. Ready belts load data/belts/<id>/content.json.
import { parseContent, contentNotes, type ContentBundle } from "./content.ts";
import type { Note } from "./notes.ts";

export type BeltStatus = "ready" | "locked";
export interface Belt {
  id: string;
  label: string;
  tab: string;
  colour: string;
  status: BeltStatus;
  contentPath?: string;
}

export const BELTS: readonly Belt[] = [
  {
    id: "white-yellow",
    label: "White to yellow",
    tab: "Yellow",
    colour: "linear-gradient(90deg, #fff 50%, #FFD23F 50%)",
    status: "ready",
    contentPath: "data/belts/white-yellow/content.json",
  },
  { id: "green", label: "Green", tab: "Green", colour: "#2e9e5b", status: "locked" },
  { id: "blue", label: "Blue", tab: "Blue", colour: "#2f6fd6", status: "locked" },
  { id: "red", label: "Red", tab: "Red", colour: "#d9534f", status: "locked" },
  { id: "black", label: "Black", tab: "Black", colour: "#1f2a44", status: "locked" },
];

export const DEFAULT_BELT = "white-yellow";

export const beltById = (id: string) => BELTS.find((b) => b.id === id);

export function selectBelt(id: string): Belt | null {
  const b = beltById(id);
  return b && b.status === "ready" && b.contentPath ? b : null;
}

export function beltContent(id: string, read: (contentPath: string) => string | undefined): ContentBundle {
  const b = selectBelt(id);
  if (!b) throw new Error(`No ready belt "${id}"`);
  const raw = read(b.contentPath!);
  if (raw === undefined) throw new Error(`Missing content for belt "${id}" at ${b.contentPath}`);
  return parseContent(JSON.parse(raw));
}

/** Notes view of a belt's content (Learn / Quiz / Chon-Ji). */
export function beltNotes(id: string, read: (contentPath: string) => string | undefined): Note[] {
  const b = selectBelt(id);
  if (!b) return [];
  return contentNotes(beltContent(id, read));
}
