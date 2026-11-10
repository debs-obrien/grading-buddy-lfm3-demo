// Chon-Ji moves for the Learn page, read straight from the Chon-Ji notes in data/belts/white-yellow/notes.md.
// Nothing is added: each move's text is the note's own line. The direction letter (A-D) is
// read from that line ("(B)", "towards A", "facing D"); a line with no letter keeps the last one.
import type { Note } from "./notes.ts";

export type Dir = "A" | "B" | "C" | "D";

export interface Move {
  n: number; // 1..19, or 20 for the ending
  label: string; // "1" .. "19" or "End"
  text: string; // the note's own sentence(s)
  dir: Dir; // the letter the move goes towards (or keeps facing, for backward steps)
  backward: boolean; // "Step backwards": moves away from `dir`
  check: boolean; // the note itself says sources or clubs differ here
}

// Words in a note line that mean "this differs between books or clubs".
const CHECK = /check with your instructor|some books|many clubs|some clubs/i;

export function chonjiMoves(notes: Note[]): Move[] {
  const lines = notes
    .filter((n) => /^chon-ji-moves-/.test(n.id))
    .flatMap((n) => n.body.split("\n"))
    .map((l) => l.trim());
  const moves: Move[] = [];
  let dir: Dir = "D";
  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s+(.*)$/) ?? line.match(/^(End):\s+(.*)$/);
    if (!m) continue;
    const text = m[2];
    const letter = text.match(/\(([ABCD])\)|towards ([ABCD])\b|facing ([ABCD])\b/);
    if (letter) dir = (letter[1] ?? letter[2] ?? letter[3]) as Dir;
    const isEnd = m[1] === "End";
    moves.push({
      n: isEnd ? 20 : Number(m[1]),
      label: isEnd ? "End" : m[1],
      text,
      dir,
      backward: /step backwards/i.test(text),
      check: CHECK.test(text),
    });
  }
  return moves;
}

/** Step-through index: from "none yet" (-1), Next starts at the first move and Prev at the last; otherwise it wraps. */
export function stepIndex(i: number, d: number, n: number): number {
  if (n <= 0) return -1;
  if (i < 0 || i >= n) return d > 0 ? 0 : n - 1;
  return (((i + d) % n) + n) % n;
}
