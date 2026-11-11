// Quiz round helpers used by the app (option labels, scoring, encouragement).
// Question banks come from shared/quiz-templates.ts.
import type { Note } from "./notes.ts";
import { orderIdsByMisses, type Attempt } from "./progress.ts";

export const OPTION_COUNT = 3;

// "Attention." and "attention" are the same option.
export function sameOption(a: string, b: string): boolean {
  const k = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return k(a) === k(b);
}

export interface Option {
  text: string;
  correct: boolean;
}

// Shown on the buttons: no trailing full stop.
export function optionLabel(text: string): string {
  return text.replace(/\.\s*$/, "");
}

// ---------- rounds ----------
// A quiz round is a fixed list of questions, no repeats, then an end screen.
export const ROUND_LENGTH = 10;

export interface RoundResult {
  id: string;
  correct: boolean;
  picked: string;
}

export interface Round {
  ids: string[]; // question order for this round
  results: RoundResult[]; // one per answered question, in order
}

export const roundTotal = (r: Round) => r.ids.length;
export const roundRight = (r: Round) => r.results.filter((x) => x.correct).length;
export const isRoundOver = (r: Round) => r.results.length >= r.ids.length;
// Id of the question to show now, or null when the round is over.
export const currentId = (r: Round): string | null => (isRoundOver(r) ? null : r.ids[r.results.length]);
// "Question 3 of 10" (1-based, for the question on screen).
export const progressText = (r: Round) => `Question ${Math.min(r.results.length + 1, r.ids.length)} of ${r.ids.length}`;

export function recordAnswer(r: Round, correct: boolean, picked: string): Round {
  const id = currentId(r);
  if (!id) throw new Error("Round is already over");
  return { ...r, results: [...r.results, { id, correct, picked }] };
}

export const missed = (r: Round) => r.results.filter((x) => !x.correct);

// Fixed, kind end-of-round line (not from the model).
export function encouragement(right: number, total: number): string {
  if (total && right === total) return "Perfect round! You really know your stuff.";
  if (right / total >= 0.7) return "Great work! Just a few to practise.";
  if (right / total >= 0.4) return "Good effort! Practise the ones below and try again.";
  return "Every black belt started here. Let's practise and play again!";
}

/** Build a round id list (most-missed first when attempts are given). */
export function roundIds(
  poolIds: string[],
  rand: () => number = Math.random,
  length = ROUND_LENGTH,
  attempts: Attempt[] = [],
): string[] {
  if (!poolIds.length) throw new Error("No quiz questions");
  return orderIdsByMisses(poolIds, attempts, rand).slice(0, length);
}

/** @deprecated Notes-shaped filter kept for progress tests that seed adaptive order. */
export function quizNotes(notes: Note[], grading?: string): Note[] {
  return notes.filter((n) => n.quiz && n.answer && (!grading || n.grading === grading));
}
