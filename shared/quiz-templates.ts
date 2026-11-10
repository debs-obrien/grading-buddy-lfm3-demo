// Quiz questions from fixed templates over content items. Graded with no model.
import type { ContentBundle, ContentItem } from "./content.ts";
import { OPTION_COUNT, sameOption, type Option } from "./quiz.ts";

export interface QuizQuestion {
  id: string;
  itemId: string;
  prompt: string;
  answer: string;
  wrong: string[];
  grading: string;
  /** Official + simple shown after a wrong answer (from content, never the model). */
  revealOfficial?: { text: string; source: string };
  revealSimple: string;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deterministic PRNG for tests and repeatable rounds. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function pickWrong(answer: string, pool: string[], rand: () => number, n = OPTION_COUNT - 1): string[] {
  const uniq: string[] = [];
  for (const d of shuffle(pool, rand)) {
    if (!sameOption(d, answer) && !uniq.some((u) => sameOption(u, d))) uniq.push(d);
    if (uniq.length >= n) break;
  }
  return uniq;
}

function termItems(bundle: ContentBundle): ContentItem[] {
  return bundle.items.filter((i) => i.korean && !i.glossary && i.topic !== "counting");
}

/** Build the quiz bank from content templates. */
export function buildQuizBank(bundle: ContentBundle): QuizQuestion[] {
  const out: QuizQuestion[] = [];

  // Template: Korean term → meaning
  for (const item of termItems(bundle)) {
    const peers = termItems(bundle).filter((p) => p.topic === item.topic && p.id !== item.id);
    const wrongPool = peers.map((p) => p.english);
    if (wrongPool.length < 2 && item.wrong?.length) {
      // fall back to authored wrongs via a synthetic question below
    }
    out.push({
      id: `term-${item.id}`,
      itemId: item.id,
      prompt: `What does ${item.korean} mean?`,
      answer: item.english.replace(/\.\s*$/, ""),
      wrong: wrongPool,
      grading: item.grading,
      revealOfficial: item.official,
      revealSimple: item.simple,
    });
  }

  // Template: meaning → Korean term
  for (const item of termItems(bundle).filter((i) => i.topic === "commands" || i.topic === "stances" || i.topic === "techniques")) {
    const peers = termItems(bundle).filter((p) => p.topic === item.topic && p.id !== item.id && p.korean);
    out.push({
      id: `meaning-${item.id}`,
      itemId: item.id,
      prompt: `What is the Korean word for ${item.english.replace(/\.\s*$/, "").toLowerCase()}?`,
      answer: item.korean!,
      wrong: peers.map((p) => p.korean!),
      grading: item.grading,
      revealOfficial: item.official,
      revealSimple: item.simple,
    });
  }

  // Counting numbers
  const counting = bundle.items.find((i) => i.numbers);
  if (counting?.numbers) {
    for (const num of counting.numbers) {
      out.push({
        id: `num-${num.n}`,
        itemId: counting.id,
        prompt: `How do you say ${num.n} in Korean?`,
        answer: num.korean,
        wrong: counting.numbers.filter((n) => n.n !== num.n).map((n) => n.korean),
        grading: counting.grading,
        revealSimple: counting.simple,
      });
    }
    out.push({
      id: "count-1-to-10",
      itemId: counting.id,
      prompt: "How do you count to ten in Korean?",
      answer: counting.numbers.map((n) => n.korean).join(", "),
      wrong: [
        [...counting.numbers].reverse().map((n) => n.korean).join(", "),
        counting.numbers.map((n) => n.korean).sort().join(", "),
      ],
      grading: counting.grading,
      revealSimple: counting.simple,
    });
  }

  // Tenets
  const tenets = bundle.items.find((i) => i.id === "the-five-tenets");
  if (tenets?.official) {
    out.push({
      id: "tenets-list",
      itemId: tenets.id,
      prompt: "Can you name the five tenets of Taekwon-Do?",
      answer: "Courtesy, Integrity, Perseverance, Self-Control and Indomitable Spirit",
      wrong: [
        "Speed, power, kicking, punching and jumping",
        "Strength, balance, stretching, speed and winning",
      ],
      grading: tenets.grading,
      revealOfficial: tenets.official,
      revealSimple: tenets.simple,
    });
  }

  // Belt meanings
  for (const id of ["what-the-white-belt-means", "what-the-yellow-belt-means"]) {
    const item = bundle.items.find((i) => i.id === id);
    if (!item?.official) continue;
    out.push({
      id: `belt-${id}`,
      itemId: item.id,
      prompt: item.quiz ?? `What does the ${id.includes("white") ? "white" : "yellow"} belt mean?`,
      answer: item.answer ?? item.official.text,
      wrong: item.wrong ?? [
        "Danger, cautioning the student to exercise control and warning the opponent to stay away.",
        "The Heaven, towards which the plant matures into a towering tree as training in Taekwon-Do progresses.",
      ],
      grading: item.grading,
      revealOfficial: item.official,
      revealSimple: item.simple,
    });
  }

  // Chon-Ji moves count
  const cj = bundle.items.find((i) => i.id === "how-many-moves-chon-ji-has");
  if (cj) {
    out.push({
      id: "cj-moves-count",
      itemId: cj.id,
      prompt: "How many moves are in Chon-Ji?",
      answer: "19",
      wrong: ["24", "12"],
      grading: cj.grading,
      revealSimple: cj.simple,
    });
  }

  // Keep authored quiz lines from content that templates didn't cover
  for (const item of bundle.items) {
    if (!item.quiz || !item.answer || item.glossary) continue;
    if (out.some((q) => q.itemId === item.id && q.prompt === item.quiz)) continue;
    const wrong =
      item.wrong?.length
        ? item.wrong
        : bundle.items
            .filter((o) => o.kind && o.kind === item.kind && o.id !== item.id && o.answer)
            .map((o) => o.answer!);
    if (wrong.length < 2) continue;
    out.push({
      id: `authored-${item.id}`,
      itemId: item.id,
      prompt: item.quiz,
      answer: item.answer,
      wrong,
      grading: item.grading,
      revealOfficial: item.official,
      revealSimple: item.why || item.simple,
    });
  }

  // Drop templates that cannot supply two distinct wrong options.
  return out.filter((q) => {
    const pool = [...q.wrong];
    if (pool.length < 2) {
      // Last resort: any other quiz answer in the bank so far
      for (const other of out) {
        if (other.id === q.id) continue;
        if (!sameOption(other.answer, q.answer) && !pool.some((p) => sameOption(p, other.answer))) {
          pool.push(other.answer);
        }
      }
      q.wrong = pool;
    }
    return pickWrong(q.answer, q.wrong, () => 0.3).length >= OPTION_COUNT - 1;
  });
}

export function quizForGrading(bank: QuizQuestion[], grading?: string): QuizQuestion[] {
  return bank.filter((q) => !grading || q.grading === grading);
}

export function buildOptionsFromQuestion(q: QuizQuestion, rand: () => number = Math.random): Option[] {
  const wrong = pickWrong(q.answer, q.wrong, rand);
  if (wrong.length < OPTION_COUNT - 1) {
    throw new Error(`Question "${q.id}" needs ${OPTION_COUNT - 1} wrong options, has ${wrong.length}`);
  }
  return shuffle(
    [{ text: q.answer, correct: true }, ...wrong.map((text) => ({ text, correct: false }))],
    rand,
  );
}

/** Seeded shuffle of question ids for a round. */
export function shuffleIds(ids: string[], rand: () => number, length: number): string[] {
  return shuffle(ids, rand).slice(0, length);
}
