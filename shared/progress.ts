// Quiz progress: remember which questions were missed so the next round can
// put the hardest ones first. Pure data helpers — the app wires localStorage.

export const ATTEMPTS_KEY = "chonji-attempts";

export interface Attempt {
  id: string;
  at: string; // ISO timestamp
  correct: boolean;
}

export function parseAttempts(raw: string | null | undefined): Attempt[] {
  if (raw == null || raw === "") return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is Attempt =>
        !!x &&
        typeof x === "object" &&
        typeof (x as Attempt).id === "string" &&
        typeof (x as Attempt).at === "string" &&
        typeof (x as Attempt).correct === "boolean",
    );
  } catch {
    return [];
  }
}

export function serializeAttempts(attempts: Attempt[]): string {
  return JSON.stringify(attempts);
}

export function recordAttempt(
  attempts: Attempt[],
  id: string,
  correct: boolean,
  at: string = new Date().toISOString(),
): Attempt[] {
  return [...attempts, { id, at, correct }];
}

/** Miss count and most-recent miss time per id (correct answers ignored). */
export function missInfo(attempts: Attempt[]): Map<string, { count: number; lastAt: string }> {
  const m = new Map<string, { count: number; lastAt: string }>();
  for (const a of attempts) {
    if (a.correct) continue;
    const cur = m.get(a.id);
    if (!cur) m.set(a.id, { count: 1, lastAt: a.at });
    else m.set(a.id, { count: cur.count + 1, lastAt: a.at > cur.lastAt ? a.at : cur.lastAt });
  }
  return m;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Most-missed first (count desc); same count → most recent miss first;
 * remaining ties keep a random shuffle. Empty history → plain shuffle.
 */
export function orderIdsByMisses(ids: string[], attempts: Attempt[], rand: () => number): string[] {
  const info = missInfo(attempts);
  const shuffled = shuffle(ids, rand);
  return shuffled.sort((a, b) => {
    const ia = info.get(a) ?? { count: 0, lastAt: "" };
    const ib = info.get(b) ?? { count: 0, lastAt: "" };
    if (ib.count !== ia.count) return ib.count - ia.count;
    if (ia.lastAt === ib.lastAt) return 0;
    return ib.lastAt < ia.lastAt ? -1 : 1;
  });
}
