// Learn tab: short study cards and the Chon-Ji section, all from data/belts/white-yellow/notes.md.
import type { Note } from "../../shared/notes.ts";
import { chonjiMoves, stepIndex, type Move, type Dir } from "../../shared/chonji.ts";
import { BELTS } from "../../shared/belts.ts";
import { wireTablist } from "./tabs.ts";
import { TOPICS } from "../../shared/topics.ts";

const INK = "#1f2a44";
const YELLOW = "#FFD23F";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Paragraphs, and "1. ..." lines as a numbered list.
function bodyHtml(body: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) out.push(`<ol>${list.join("")}</ol>`); list = []; };
  for (const raw of body.split("\n")) {
    const l = raw.trim();
    const m = l.match(/^\d+\.\s+(.*)$/);
    if (m) list.push(`<li>${esc(m[1])}</li>`);
    else {
      flush();
      const lab = l.match(/^(Official ITF wording|In simple words):\s*(.*)$/);
      if (lab && lab[2]) out.push(`<p class="${lab[1] === "In simple words" ? "simple" : "official"}"><strong>${lab[1]}:</strong> ${esc(lab[2])}</p>`);
      else if (l) out.push(`<p>${esc(l)}</p>`);
    }
  }
  flush();
  return out.join("");
}

const SECTIONS: { key: string; title: string; icon: string; ids: string[] }[] = [
  { key: "belts", title: "Belts", icon: TOPICS.belts.icon, ids: ["what-the-white-belt-means", "what-the-yellow-belt-means", "belt-order-for-the-first-gradings"] },
  { key: "tenets", title: "The five tenets", icon: TOPICS.tenets.icon, ids: ["the-five-tenets", "courtesy", "integrity", "perseverance", "self-control", "indomitable-spirit"] },
  { key: "oath", title: "The student oath", icon: TOPICS.oath.icon, ids: ["the-student-oath", "what-the-oath-promises-mean"] },
  { key: "words", title: "Dojang words", icon: TOPICS.words.icon, ids: ["dojang-and-dobok", "instructor-sabum-nim", "charyot-attention", "kyong-ye-bow", "junbi-ready", "si-jak-begin", "baro-return", "kihap-yell", "high-middle-and-low", "turning-in-place-and-step-turning"] },
  { key: "counting", title: "Counting in Korean", icon: TOPICS.counting.icon, ids: ["counting-1-to-10-in-korean"] },
  {
    key: "stances",
    title: "Stances",
    icon: TOPICS.stances.icon,
    ids: [
      "attention-stance-charyot-sogi",
      "parallel-stance-and-parallel-ready-stance",
      "walking-stance-gunnun-sogi",
      "stepping-forward-and-backward",
      "l-stance-niunja-sogi",
      "sitting-stance-annun-sogi",
    ],
  },
  {
    key: "techniques",
    title: "Techniques",
    icon: TOPICS.techniques.icon,
    ids: [
      "punch-block-and-kick-words",
      "forearm-low-block-palmok-najunde-makgi",
      "knife-hand-low-block-sonkal-najunde-makgi",
      "inner-forearm-side-block-an-palmok-yop-makgi",
      "front-punch-ap-jirugi",
      "front-snap-kick-apcha-busigi",
      "front-rising-kick-apcha-olligi",
    ],
  },
  {
    key: "saju",
    title: "Saju",
    icon: TOPICS.saju.icon,
    ids: ["saju-jirugi-four-direction-punch", "saju-makgi-four-direction-block"],
  },
  {
    key: "story",
    title: "Taekwon-Do story",
    icon: TOPICS.story.icon,
    ids: ["what-the-word-taekwon-do-means", "who-started-taekwon-do", "when-taekwon-do-got-its-name", "what-itf-means"],
  },
];

// ---- Chon-Ji floor diagram ----
// A plus sign. Each move is a short numbered arrow on the arm it goes towards; forward moves
// point out to the letter, backward steps point back in. Arrows show direction only, not
// exact foot positions.
const C = 210; // centre
const ARM = 175;
const UNIT: Record<Dir, [number, number]> = { D: [0, -1], C: [0, 1], A: [1, 0], B: [-1, 0] };

function arrowSvg(m: Move, k: number): string {
  const [ux, uy] = UNIT[m.dir];
  const side = k % 2 === 0 ? 1 : -1; // alternate sides of the arm line
  const along = 58 + 34 * Math.floor(k / 2);
  const off = 26 * side;
  // perpendicular to the arm
  const px = -uy, py = ux;
  const cx = C + ux * along + px * off, cy = C + uy * along + py * off;
  const len = 13;
  const s = m.backward ? 1 : -1; // forward: tail nearer centre, head outward
  const x1 = cx + ux * len * s, y1 = cy + uy * len * s, x2 = cx - ux * len * s, y2 = cy - uy * len * s;
  const lx = cx + px * 20 * side, ly = cy + py * 20 * side;
  return `<g class="mv" data-n="${m.n}" role="button" tabindex="0" aria-label="Move ${m.label}: ${esc(m.text)}">
  <circle class="hit" cx="${cx}" cy="${cy}" r="22" fill="transparent"/>
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="3.5" marker-end="url(#ah)"/>
  <circle cx="${lx}" cy="${ly}" r="11" fill="#fff" stroke="${INK}" stroke-width="2"/>
  <text x="${lx}" y="${ly + 4.5}" font-size="12" font-weight="800" text-anchor="middle" fill="${INK}">${m.label}</text>
</g>`;
}

export function chonjiPathSvg(moves: Move[]): string {
  const perArm: Record<Dir, number> = { A: 0, B: 0, C: 0, D: 0 };
  const arrows = moves.filter((m) => m.label !== "End").map((m) => arrowSvg(m, perArm[m.dir]++)).join("");
  const label = (d: Dir, text: string) => {
    const [ux, uy] = UNIT[d];
    const x = C + ux * (ARM + 22), y = C + uy * (ARM + 22) + 6;
    return `<text x="${x}" y="${y}" font-size="18" font-weight="800" text-anchor="middle" fill="${INK}">${text}</text>`;
  };
  return `<svg class="cj-path" role="group" viewBox="0 0 420 420" aria-label="Simplified Chon-Ji floor diagram. A plus sign with D at the front, C behind, A to the right and B to the left. Numbered arrows show which way each of the 19 moves goes: moves 1 and 2 towards B, 3 and 4 towards A, 5 and 6 towards D, 7 and 8 towards C, 9 and 10 towards A, 11 and 12 towards B, 13 and 14 towards C, 15 to 17 towards D, and 18 and 19 step backwards while still facing D. End: bring the left foot back to parallel ready stance. Each arrow is a button that shows its move.">
  <defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${INK}"/></marker></defs>
  <rect x="1" y="1" width="418" height="418" rx="20" fill="#fffaf0"/>
  <path d="M${C} ${C - ARM} V${C + ARM} M${C - ARM} ${C} H${C + ARM}" stroke="#c9ced8" stroke-width="10" stroke-linecap="round"/>
  <circle cx="${C}" cy="${C}" r="10" fill="${YELLOW}" stroke="${INK}" stroke-width="2.5"/>
  ${label("D", "D (front)")}${label("C", "C")}${label("A", "A")}${label("B", "B")}
  ${arrows}
</svg>`;
}

const LEARN_TAB_KEY = "grading-buddy:learn-tab";
const PANELS: { key: string; label: string }[] = [
  { key: "chonji", label: "Chon-Ji" },
  { key: "belts", label: "Belts" },
  { key: "tenets", label: "Tenets" },
  { key: "oath", label: "Oath" },
  { key: "words", label: "Words" },
  { key: "counting", label: "Counting" },
  { key: "stances", label: "Stances" },
  { key: "techniques", label: "Techniques" },
  { key: "saju", label: "Saju" },
  { key: "story", label: "Story" },
];

export function renderLearn(host: HTMLElement, notes: Note[]) {
  const byId = (id: string) => notes.find((n) => n.id === id);
  const card = (n: Note) => `<article class="study"><h4>${esc(n.title)}</h4>${bodyHtml(n.body)}</article>`;
  const moves = chonjiMoves(notes);
  const meaning = byId("what-chon-ji-means"), count = byId("how-many-moves-chon-ji-has"), start = byId("chon-ji-start-position-and-diagram");
  const label = (m: Move) => (m.label === "End" ? "End" : `Move ${m.label}`);

  const cj = `<div class="learn-cj">
  <h2 id="cj-h" class="sr-only">Chon-Ji, your first pattern</h2>
  <figure class="cj-fig">${chonjiPathSvg(moves)}</figure>
  <div class="cj-step" role="group" aria-label="Step through the moves">
    <button id="cj-prev" class="step-btn" aria-label="Previous move">◀ Prev</button>
    <button id="cj-next" class="step-btn" aria-label="Next move">Next ▶</button>
  </div>
  <p id="cj-now" class="cj-now" aria-live="polite">Tap Next, a move or an arrow to go through the moves.</p>
  <ol class="cj-moves">${moves.map((m, k) => `<li data-n="${m.n}"${m.label === "End" ? ' class="end"' : ""}><button type="button" class="mv-btn" data-i="${k}" aria-label="${label(m)}: ${esc(m.text)}"><span class="mn" aria-hidden="true">${m.label}</span><span>${esc(m.text)}${m.check ? ' <span class="check">check with your instructor</span>' : ""}</span></button></li>`).join("")}</ol>
  <p class="cj-cap">Simplified diagram: arrows show which way each move goes, not exact foot positions.</p>
  <h3>What Chon-Ji means</h3>
  ${[meaning, count, start].filter(Boolean).map((n) => bodyHtml(n!.body)).join("")}
</div>`;

  const lockedBelts = `<ul class="belt-locks" aria-label="Later belts">${BELTS.filter((b) => b.status === "locked").map((b) => `<li class="belt locked" aria-disabled="true" title="${b.label} belt: coming soon"><span class="swatch" style="background:${b.colour}" aria-hidden="true"></span>${b.label} <span aria-hidden="true">🔒</span><span class="sr-only"> (coming soon)</span></li>`).join("")}</ul>`;
  const panelHtml = (key: string) => {
    if (key === "chonji") return cj;
    const s = SECTIONS.find((x) => x.key === key)!;
    const body = s.ids.map(byId).filter(Boolean).map((n) => card(n!)).join("");
    return `<h3><span aria-hidden="true">${s.icon}</span> ${esc(s.title)}</h3>${body}${key === "belts" ? lockedBelts : ""}`;
  };
  const more = `<section class="card learn-more">
  <div class="seg-tabs" role="tablist" aria-label="Learn topics">${PANELS.map((p) => `<button type="button" role="tab" id="lt-${p.key}" aria-controls="lp-${p.key}" class="seg-tab">${p.label}</button>`).join("")}</div>
  ${PANELS.map((p) => `<div role="tabpanel" id="lp-${p.key}" aria-labelledby="lt-${p.key}" tabindex="0" class="lpanel" hidden>${panelHtml(p.key)}</div>`).join("")}
</section>`;
  host.innerHTML = more;

  // Moves list, diagram arrows and Prev/Next share one state.
  let i = -1;
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const select = (k: number, scroll = false) => {
    i = k;
    const m = moves[i];
    host.querySelectorAll(".learn-cj [data-n]").forEach((el) => el.classList.toggle("on", el.getAttribute("data-n") === String(m.n)));
    host.querySelectorAll(".mv-btn").forEach((b) => b.setAttribute("aria-current", String(b.getAttribute("data-i") === String(i))));
    host.querySelector("#cj-now")!.textContent = `${label(m)}: ${m.text}`;
    if (scroll) host.querySelector(`.cj-moves li[data-n="${m.n}"]`)?.scrollIntoView({ block: "nearest", behavior: reduce() ? "instant" : "smooth" });
  };
  const step = (d: number) => select(stepIndex(i, d, moves.length));
  host.querySelector<HTMLButtonElement>("#cj-next")!.onclick = () => step(1);
  host.querySelector<HTMLButtonElement>("#cj-prev")!.onclick = () => step(-1);
  host.querySelectorAll<HTMLButtonElement>(".mv-btn").forEach((b) => (b.onclick = () => select(Number(b.dataset.i))));
  host.querySelectorAll<SVGGElement>(".cj-path .mv").forEach((g) => {
    const k = moves.findIndex((m) => String(m.n) === g.dataset.n);
    g.addEventListener("click", () => select(k, true));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(k, true); }
    });
  });

  // Learn topic tabs (Chon-Ji first); the last choice is remembered.
  const saved = Math.max(0, PANELS.findIndex((p) => p.key === localStorage.getItem(LEARN_TAB_KEY)));
  wireTablist(host.querySelector<HTMLElement>(".seg-tabs")!, (k) => {
    PANELS.forEach((p, j) => (host.querySelector<HTMLElement>(`#lp-${p.key}`)!.hidden = j !== k));
    try { localStorage.setItem(LEARN_TAB_KEY, PANELS[k].key); } catch { /* storage full or blocked */ }
  }, saved);
}
