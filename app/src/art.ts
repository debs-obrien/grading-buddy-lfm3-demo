// Hand-made inline SVG for Grading Buddy. No images, no external files, no people.
// Every graphic has a text label (role="img" + aria-label) so screen readers get the meaning.
import { TOPICS, topicOf } from "../../shared/topics.ts";
import type { Note } from "../../shared/notes.ts";

const INK = "#1f2a44";
const YELLOW = "#FFD23F";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// A belt: band, knot and two tails. `stripe` adds a coloured tag near the end.
// `fill` (0..1) paints the band yellow from the left, used for the quiz score.
let uid = 0;
export function beltSvg(opts: { color?: string; stripe?: string; fill?: number; width?: number; label: string }): string {
  const { color = "#ffffff", stripe, fill, width = 72, label } = opts;
  const id = `belt${++uid}`;
  const h = Math.round(width * 0.38);
  const fillW = fill === undefined ? 0 : Math.max(0, Math.min(1, fill)) * 100;
  return `<svg class="belt" role="img" aria-label="${esc(label)}" viewBox="0 0 100 38" width="${width}" height="${h}">
  <defs><clipPath id="${id}"><rect x="0" y="0" width="${fillW}" height="42"/></clipPath></defs>
  <rect x="2" y="6" width="96" height="14" rx="4" fill="${color}" stroke="${INK}" stroke-width="2.5"/>
  ${fill !== undefined ? `<rect x="2" y="6" width="96" height="14" rx="4" fill="${YELLOW}" clip-path="url(#${id})"/><rect x="2" y="6" width="96" height="14" rx="4" fill="none" stroke="${INK}" stroke-width="2.5"/>` : ""}
  ${stripe ? `<rect x="78" y="6" width="9" height="14" fill="${stripe}" stroke="${INK}" stroke-width="1.5"/>` : ""}
  <path d="M46 18 L40 36 L47 36 L50 22 Z" fill="${color}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M54 18 L60 36 L53 36 L50 22 Z" fill="${color}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="43" y="4" width="14" height="18" rx="3" fill="${color}" stroke="${INK}" stroke-width="2.5"/>
</svg>`;
}

const WHITE = () => beltSvg({ label: "White belt (10th kup)", width: 48 });
const STRIPE = () => beltSvg({ stripe: YELLOW, label: "White belt with a yellow stripe (9th kup)", width: 48 });
const YELLOWB = () => beltSvg({ color: YELLOW, label: "Yellow belt (8th kup)", width: 48 });

// Grading 1: white -> white with yellow stripe. Grading 2: stripe -> yellow belt.
export function gradingBadge(grading: string): string {
  const [from, to, text] = grading === "2" ? [STRIPE(), YELLOWB(), "Grading 2"] : [WHITE(), STRIPE(), "Grading 1"];
  return `<span class="grading-badge" title="${text}">${from}<span aria-hidden="true" class="arrow">➜</span>${to}<span class="gb-text">${text}</span></span>`;
}

export function topicChip(n: Note): string {
  const t = TOPICS[topicOf(n)];
  return `<span class="topic"><span class="topic-icon" aria-hidden="true">${t.icon}</span>${esc(t.label)}</span>`;
}

// Simplified Chon-Ji floor pattern: a plus sign. You start in the middle facing D.
export function chonjiDiagram(): string {
  const dot = (x: number, y: number, l: string, dx: number, dy: number) =>
    `<circle cx="${x}" cy="${y}" r="9" fill="${YELLOW}" stroke="${INK}" stroke-width="2.5"/><text x="${x + dx}" y="${y + dy}" font-size="17" font-weight="800" fill="${INK}" text-anchor="middle">${l}</text>`;
  return `<figure class="diagram">
<svg role="img" aria-label="Simplified Chon-Ji floor diagram: a plus sign. Start in the middle facing D, the front. A is to your right, B to your left, C behind you." viewBox="0 0 220 220" width="200" height="200">
  <rect x="2" y="2" width="216" height="216" rx="18" fill="#fffaf0"/>
  <path d="M110 30 V190 M30 110 H190" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  ${dot(110, 30, "D", 0, -2 - 14)}${dot(110, 190, "C", 0, 30)}${dot(190, 110, "A", 24, 6)}${dot(30, 110, "B", -24, 6)}
  <circle cx="110" cy="110" r="12" fill="${INK}"/>
  <path d="M110 96 L103 106 H117 Z" fill="#fff"/>
</svg>
<figcaption>Simplified diagram, not to scale. ● = start, facing D (the front).</figcaption>
</figure>`;
}

export const isChonji = (n: Note) => topicOf(n) === "chonji";

// The round score as a belt that fills up yellow: all right in a round = a full yellow belt.
export function scoreBelt(right: number, total: number, width = 120): string {
  const f = total ? Math.min(right, total) / total : 0;
  return beltSvg({ fill: f, width, label: `${right} right out of ${total}. The belt is ${Math.round(f * 100)}% yellow.` });
}

// A light burst of stars on a right answer. Skipped when the user prefers reduced motion.
export function celebrate(host: HTMLElement) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.createElement("div");
  box.className = "burst";
  box.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 8; i++) {
    const s = document.createElement("span");
    s.textContent = i % 2 ? "⭐" : "✨";
    s.style.setProperty("--a", `${i * 45}deg`);
    box.appendChild(s);
  }
  host.appendChild(box);
  setTimeout(() => box.remove(), 1000);
}
