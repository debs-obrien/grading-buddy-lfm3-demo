// Transparent, keyword-based grading for the eval. See README "How the eval is graded".
import { isDecline, isPainReply } from "../shared/answer.ts";

export function norm(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "");
}

// Every group must have at least one keyword present (substring match, spaces/punctuation ignored).
// forbidRe: if any regex matches, the answer fails.
export function matchesExpected(answer: string, expect: string[][], forbidRe?: string[]): boolean {
  const a = norm(answer);
  if (!expect.every((group) => group.some((k) => a.includes(norm(k))))) return false;
  if (forbidRe?.length) {
    for (const re of forbidRe) {
      if (new RegExp(re, "i").test(answer)) return false;
    }
  }
  return true;
}

/** When order:true, the normalised answer must contain the groups in order. */
export function matchesExpectedInOrder(answer: string, expect: string[][]): boolean {
  let a = norm(answer);
  for (const group of expect) {
    let best = -1;
    let bestLen = 0;
    for (const k of group) {
      const n = norm(k);
      const i = a.indexOf(n);
      if (i >= 0 && (best < 0 || i < best)) {
        best = i;
        bestLen = n.length;
      }
    }
    if (best < 0) return false;
    a = a.slice(best + bestLen);
  }
  return true;
}

export type InScopeOutcome = "correct" | "wrong" | "wrongly_declined";
export type OutOfScopeOutcome = "correctly_declined" | "wrongly_answered";

export function gradeInScope(
  answer: string,
  expect: string[][],
  forbidRe?: string[],
  opts?: { order?: boolean },
): InScopeOutcome {
  if (isDecline(answer)) return "wrongly_declined";
  if (opts?.order) {
    if (forbidRe?.length) {
      for (const re of forbidRe) if (new RegExp(re, "i").test(answer)) return "wrong";
    }
    return matchesExpectedInOrder(answer, expect) ? "correct" : "wrong";
  }
  return matchesExpected(answer, expect, forbidRe) ? "correct" : "wrong";
}

export function gradeOutOfScope(answer: string): OutOfScopeOutcome {
  return isDecline(answer) || isPainReply(answer) ? "correctly_declined" : "wrongly_answered";
}

export interface QualityResult {
  pass: boolean;
  problems: string[];
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 || /\d/.test(w));
const STOP = new Set([
  "the", "and", "you", "your", "are", "with", "for", "that", "this", "there", "has", "its", "it's", "was", "into", "from",
]);

export function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
    if (ch === "." && isListMarkerAt(text, i)) continue;
    ends.push(i);
  }
  return ends;
}

function isListMarkerAt(text: string, dotIndex: number): boolean {
  if (!/\d/.test(text[dotIndex - 1] ?? "")) return false;
  const m = text.slice(0, dotIndex).match(/(?:^|\s)(\d+)$/);
  if (!m || m[1].length > 2 || !/^\s+[A-Za-z]/.test(text.slice(dotIndex + 1))) return false;
  if (m[1].length === 1) return true;
  const before = text.slice(0, dotIndex - m[1].length).trimEnd();
  if (/[:;]$/.test(before)) return true;
  return /(?:^|[:;]\s*)\d{1,2}\.\s+\S+/.test(text.slice(0, dotIndex));
}

export function sentencesOf(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  const ends = sentenceEnds(t);
  if (!ends.length) return /[a-z0-9]/i.test(t) ? [t] : [];
  const out: string[] = [];
  let start = 0;
  for (const e of ends) {
    const s = t.slice(start, e + 1).trim();
    if (/[a-z0-9]/i.test(s)) out.push(s);
    start = e + 1;
  }
  const tail = t.slice(start).trim();
  if (/[a-z0-9]/i.test(tail)) out.push(tail);
  return out;
}

export function gradeQuality(answer: string, expect: string[][], headings: string[], maxSentences = 2): QualityResult {
  const problems: string[] = [];
  const low = answer.toLowerCase();
  if (isDecline(answer)) problems.push("declined");
  if (!matchesExpected(answer, expect)) problems.push("missing expected fact");
  if (/\bnotes?\b/.test(low)) problems.push('mentions "notes"');
  const leaked = headings.filter((h) => h.split(/\s+/).length >= 4 && low.includes(h.toLowerCase()));
  if (/moves? \d+ to \d+/.test(low) || leaked.length) {
    problems.push(`heading fragment: ${leaked[0] ?? low.match(/moves? \d+ to \d+/)![0]}`);
  }
  const ss = sentencesOf(answer);
  // Official wording appendix can add sentences — count only before "Official ITF wording"
  const main = answer.split(/Official ITF wording/i)[0];
  const mainSs = sentencesOf(main);
  if (mainSs.length > maxSentences) problems.push(`${mainSs.length} sentences`);
  const content = ss.map((s) => new Set(words(s).filter((w) => !STOP.has(w))));
  for (let a = 0; a < content.length; a++)
    for (let b = a + 1; b < content.length; b++) {
      const A = content[a],
        B = content[b];
      const inter = [...A].filter((w) => B.has(w)).length;
      const sameNumber = [...A].some((w) => /^\d+$/.test(w) && B.has(w));
      if (sameNumber || (inter >= 2 && inter / Math.min(A.size, B.size) >= 0.6)) {
        problems.push("repeats a fact");
        a = content.length;
        break;
      }
    }
  return { pass: problems.length === 0, problems };
}
