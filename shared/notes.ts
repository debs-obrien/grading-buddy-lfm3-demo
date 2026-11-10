// Note shape used by Learn, Quiz and Chon-Ji. Built from content.json via itemToNote.

export interface Note {
  id: string;
  title: string;
  grading: string;
  tags: string[];
  quiz?: string;
  answer?: string;
  /** Quiz: answers of other notes with the same kind can be used as wrong options. */
  kind?: string;
  /** Quiz: hand-written wrong options. */
  wrong?: string[];
  /** Quiz: hand-written "Why?" line. */
  why?: string;
  body: string;
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
