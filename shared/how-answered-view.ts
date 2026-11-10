// Pure helpers for the source label + collapsible "Show how this was answered" panel.
import type { HowAnswered } from "./provenance.ts";
import { LABEL_MODEL, LABEL_NOTES } from "./provenance.ts";

export function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Source chip HTML. `id` prefixes aria ids for the expandable region. */
export function sourceLabelHtml(how: HowAnswered, idPrefix: string): string {
  const cls = how.source === "model" ? "src-model" : "src-notes";
  return `<p class="source-label ${cls}" data-source="${how.source}" id="${idPrefix}-label">${escapeHtml(how.label)}</p>`;
}

export function howAnsweredPanelHtml(how: HowAnswered, idPrefix: string): string {
  const regionId = `${idPrefix}-how`;
  const btnId = `${idPrefix}-how-btn`;
  const rows: string[] = [];
  rows.push(`<dt>Path</dt><dd>${escapeHtml(String(how.path))}</dd>`);
  if (how.topic) rows.push(`<dt>Matched topic</dt><dd>${escapeHtml(how.topic)}</dd>`);
  if (how.items?.length) rows.push(`<dt>Items</dt><dd>${escapeHtml(how.items.join("; "))}</dd>`);
  if (how.facts) {
    const shown = how.facts.length > 1200 ? `${how.facts.slice(0, 1200)}…` : how.facts;
    rows.push(`<dt>Facts given to the model</dt><dd><pre class="how-pre">${escapeHtml(shown)}</pre></dd>`);
  }
  if (how.rawModel !== undefined) {
    rows.push(`<dt>Model raw output</dt><dd><pre class="how-pre">${escapeHtml(how.rawModel || "(none)")}</pre></dd>`);
  }
  if (how.tokens !== undefined) rows.push(`<dt>Tokens</dt><dd>${how.tokens}</dd>`);
  if (how.seconds !== undefined) rows.push(`<dt>Generation time</dt><dd>${how.seconds.toFixed(2)} s</dd>`);
  if (how.tokensPerSecond != null) rows.push(`<dt>Tokens / sec</dt><dd>${how.tokensPerSecond}</dd>`);
  if (how.check) rows.push(`<dt>Check</dt><dd data-check-ok="${how.check.ok}">${escapeHtml(how.check.summary)}</dd>`);

  return `<div class="how-wrap">
  <button type="button" class="how-toggle quiet" id="${btnId}" aria-expanded="false" aria-controls="${regionId}">Show how this was answered</button>
  <div id="${regionId}" class="how-panel" role="region" aria-labelledby="${btnId}" hidden>
    <dl class="how-dl">${rows.join("")}</dl>
  </div>
</div>`;
}

/** Full answer block: body + source label + how panel. */
export function answerChromeHtml(bodyHtml: string, how: HowAnswered, idPrefix: string): string {
  return `${bodyHtml}${sourceLabelHtml(how, idPrefix)}${howAnsweredPanelHtml(how, idPrefix)}`;
}

/** Wire the expand/collapse button (call after inserting HTML). */
export function wireHowToggle(root: ParentNode, idPrefix: string): void {
  const btn = root.querySelector<HTMLButtonElement>(`#${idPrefix}-how-btn`);
  const panel = root.querySelector<HTMLElement>(`#${idPrefix}-how`);
  if (!btn || !panel) return;
  btn.onclick = () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    panel.hidden = open;
    btn.textContent = open ? "Show how this was answered" : "Hide how this was answered";
  };
}

/** Test helper: label string must match source. */
export function labelMatchesSource(how: HowAnswered): boolean {
  if (how.source === "model") return how.label === LABEL_MODEL;
  if (how.source === "notes") return how.label === LABEL_NOTES;
  return false;
}
