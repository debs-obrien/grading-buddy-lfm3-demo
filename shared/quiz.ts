// Quiz helpers: pick a question, build three tap-able options, keep score.
// Options come only from the notes (the right answer + two wrong ones), never from the model,
// and a tap is checked against the known answer. The "Why?" line is the note's own text.
import type { Note } from "./notes.ts";
import { orderIdsByMisses, type Attempt } from "./progress.ts";

export const OPTION_COUNT = 3;

export function quizNotes(notes: Note[], grading?: string): Note[] {
  return notes.filter((n) => n.quiz && n.answer && (!grading || n.grading === grading));
}

export function pickQuestion(notes: Note[], rand: () => number = Math.random, avoidId?: string): Note {
  const pool = notes.length > 1 && avoidId ? notes.filter((n) => n.id !== avoidId) : notes;
  if (!pool.length) throw new Error("No quiz questions");
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

// "Attention." and "attention" are the same option.
export function sameOption(a: string, b: string): boolean {
  const k = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return k(a) === k(b);
}

// Where a note's wrong options come from: its own `Wrong:` list, or else the answers of
// every other quiz note with the same `Kind:`. Duplicates of the answer are removed.
export function distractorPool(note: Note, all: Note[]): string[] {
  const raw = note.wrong?.length
    ? note.wrong
    : note.kind
      ? all.filter((n) => n.id !== note.id && n.kind === note.kind && n.answer).map((n) => n.answer!)
      : [];
  const out: string[] = [];
  for (const d of raw) if (!sameOption(d, note.answer!) && !out.some((o) => sameOption(o, d))) out.push(d);
  return out;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Option {
  text: string;
  correct: boolean;
}

// Exactly one correct option plus two wrong ones, in shuffled order.
// Same `rand` sequence -> same options, so it is testable.
export function buildOptions(note: Note, all: Note[], rand: () => number = Math.random): Option[] {
  if (!note.answer) throw new Error(`Note "${note.id}" has no answer`);
  const pool = distractorPool(note, all);
  if (pool.length < OPTION_COUNT - 1) throw new Error(`Note "${note.id}" needs ${OPTION_COUNT - 1} wrong options, has ${pool.length}`);
  const wrong = shuffle(pool, rand).slice(0, OPTION_COUNT - 1);
  return shuffle([{ text: note.answer, correct: true }, ...wrong.map((text) => ({ text, correct: false }))], rand);
}

// The "Why?" line after a tap: the note's hand-written `Why:` line, else its first sentence or two. Never the model.
// Heading lines like "Moves 1 to 4:" and list numbers are dropped so it reads as plain sentences.
// Official ITF wording lines are kept whole (periods inside the quoted list must not chop the Why).
export function noteWhy(note: Note, maxChars = 220): string {
  if (note.why) return note.why;
  const official = note.body.match(/^Official ITF wording:\s*(.+)$/m)?.[1]?.trim();
  const simple = note.body.match(/^In simple words:\s*(.+)$/m)?.[1]?.trim();
  if (official || simple) {
    const parts: string[] = [];
    if (official) parts.push(`Official ITF wording: ${official}`);
    if (simple) parts.push(`In simple words: ${simple}`);
    let out = parts[0] ?? "";
    if (parts[1] && (out + " " + parts[1]).length <= maxChars) out += " " + parts[1];
    return out;
  }
  const text = note.body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/:$/.test(l))
    .map((l) => l.replace(/^\d+\.\s+/, ""))
    .join(" ");
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];
  let out = sentences[0] ?? "";
  if (sentences[1] && (out + " " + sentences[1]).length <= maxChars) out += " " + sentences[1];
  return out;
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

// Most-missed first when attempts are given; otherwise a plain shuffle.
// No repeats; shorter than ROUND_LENGTH only if the pool is smaller.
export function startRound(
  pool: Note[],
  rand: () => number = Math.random,
  length = ROUND_LENGTH,
  attempts: Attempt[] = [],
): Round {
  if (!pool.length) throw new Error("No quiz questions");
  return { ids: orderIdsByMisses(pool.map((n) => n.id), attempts, rand).slice(0, length), results: [] };
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

export interface Score {
  right: number;
  asked: number;
}

export function addResult(s: Score, correct: boolean): Score {
  return { right: s.right + (correct ? 1 : 0), asked: s.asked + 1 };
}
