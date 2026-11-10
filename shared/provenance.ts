// Visible source labels and the collapsible "how this was answered" panel.
// Labels must match the path actually taken (tested).

export const LABEL_MODEL = "Written by LFM3 on this device";
export const LABEL_NOTES = "From the notes";

export type AnswerSource = "model" | "notes";

export type NotesPath =
  | "safety"
  | "no-match"
  | "check-failed"
  | "model-decline"
  | "thin-or-glossary-fallback";

export interface CheckTrace {
  ok: boolean;
  badKorean: string[];
  badNumbers: string[];
  badCategory?: string;
  /** Human summary for the how-answered panel. */
  summary: string;
}

export interface HowAnswered {
  source: AnswerSource;
  label: string;
  path: NotesPath | "model" | "learn-why";
  /** Topic name matched, if any. */
  topic?: string;
  /** Item titles given to the model / used for the card. */
  items?: string[];
  /** Facts string shown to the model (truncated in UI if huge). */
  facts?: string;
  /** Raw model output before check / strip. */
  rawModel?: string;
  tokens?: number;
  seconds?: number;
  tokensPerSecond?: number | null;
  check?: CheckTrace;
}

export function labelFor(source: AnswerSource): string {
  return source === "model" ? LABEL_MODEL : LABEL_NOTES;
}

export function checkSummary(c: {
  ok: boolean;
  badKorean: string[];
  badNumbers: string[];
  badCategory?: string;
}): string {
  if (c.ok) return "Passed: every Korean term and number was in the facts, and the type matched.";
  const bits: string[] = [];
  if (c.badKorean.length) bits.push(`Korean term(s) not in facts: ${c.badKorean.join(", ")}`);
  if (c.badNumbers.length) bits.push(`number(s) not in facts: ${c.badNumbers.join(", ")}`);
  if (c.badCategory) bits.push(`type mismatch: answer claimed a ${c.badCategory}`);
  return `Failed — showed the note instead. ${bits.join("; ")}.`;
}

export function tokensPerSecond(tokens: number, seconds: number): number | null {
  if (!seconds || seconds <= 0) return null;
  return Number((tokens / seconds).toFixed(2));
}

/** Pure helper: which label a gated Ask path must show. */
export function notesLabelForGate(gateReason: "safety" | "no-match"): HowAnswered {
  return {
    source: "notes",
    label: LABEL_NOTES,
    path: gateReason,
  };
}
