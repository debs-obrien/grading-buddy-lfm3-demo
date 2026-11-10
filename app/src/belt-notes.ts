// The app's view of the belt modules: Vite bundles every data/belts/*/content.json.
import { beltContent, beltNotes, DEFAULT_BELT } from "../../shared/belts.ts";
import type { ContentBundle } from "../../shared/content.ts";

const files = import.meta.glob("../../data/belts/*/content.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const read = (contentPath: string) => files[`../../${contentPath}`];

export const ACTIVE_BELT = DEFAULT_BELT;
export const activeContent = (): ContentBundle => beltContent(ACTIVE_BELT, read);
export const activeNotes = () => beltNotes(ACTIVE_BELT, read);
