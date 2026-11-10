import { describe, it, expect } from "vitest";
import { loadBeltContent } from "../shared/belt-fs.ts";
import {
  planAsk,
  finaliseAsk,
  gatedAskResult,
  learnWhyHow,
  finaliseLearnWhy,
  LABEL_MODEL,
  LABEL_NOTES,
} from "../shared/answer.ts";
import {
  labelMatchesSource,
  howAnsweredPanelHtml,
  sourceLabelHtml,
  wireHowToggle,
} from "../shared/how-answered-view.ts";
import { itemFacts } from "../shared/content.ts";
import { PAIN_REPLY, DECLINE } from "../shared/config.ts";

const bundle = loadBeltContent();

describe("source labels match the path taken", () => {
  it("safety decline is From the notes", () => {
    const plan = planAsk(bundle, "My knee hurts when I kick, what should I do?");
    expect(plan.kind).toBe("gated");
    if (plan.kind !== "gated") return;
    const r = gatedAskResult(plan);
    expect(r.text).toBe(PAIN_REPLY);
    expect(r.how.source).toBe("notes");
    expect(r.how.label).toBe(LABEL_NOTES);
    expect(r.how.path).toBe("safety");
    expect(labelMatchesSource(r.how)).toBe(true);
  });

  it("off-topic refusal is From the notes", () => {
    const plan = planAsk(bundle, "What is the capital of France?");
    expect(plan.kind).toBe("gated");
    if (plan.kind !== "gated") return;
    const r = gatedAskResult(plan);
    expect(r.text).toBe(DECLINE);
    expect(r.how.source).toBe("notes");
    expect(r.how.path).toBe("no-match");
    expect(labelMatchesSource(r.how)).toBe(true);
  });

  it("passing model answer is Written by LFM3 on this device", () => {
    const plan = planAsk(bundle, "What does charyot mean?");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    const r = finaliseAsk("Charyot means attention.", plan, { tokens: 12, seconds: 1.5 });
    expect(r.usedCard).toBe(false);
    expect(r.how.source).toBe("model");
    expect(r.how.label).toBe(LABEL_MODEL);
    expect(r.how.path).toBe("model");
    expect(r.how.tokensPerSecond).toBe(8);
    expect(r.how.check?.ok).toBe(true);
    expect(labelMatchesSource(r.how)).toBe(true);
  });

  it("failed check fallback is From the notes", () => {
    const plan = planAsk(bundle, "explain chon ji like im 5");
    expect(plan.kind).toBe("model");
    if (plan.kind !== "model") return;
    const r = finaliseAsk(
      "In Taekwondo, Chon-Ji is a way of standing and moving. You start in a ready stance.",
      plan,
      { tokens: 40, seconds: 2 },
    );
    expect(r.usedCard).toBe(true);
    expect(r.how.source).toBe("notes");
    expect(r.how.label).toBe(LABEL_NOTES);
    expect(r.how.path).toBe("check-failed");
    expect(r.how.check?.ok).toBe(false);
    expect(r.how.check?.badCategory).toBe("stance");
    expect(labelMatchesSource(r.how)).toBe(true);
    // Multi-item topic match → note shows the matched items, not only primary.
    expect(r.text.toLowerCase()).toMatch(/heaven/);
    expect(r.text.toLowerCase()).toMatch(/earth/);
    expect(r.text).toMatch(/19/);
  });

  it("model decline after generation is From the notes", () => {
    const plan = planAsk(bundle, "What does charyot mean?");
    if (plan.kind !== "model") throw new Error("expected model");
    const r = finaliseAsk(DECLINE, plan, { tokens: 8, seconds: 1 });
    expect(r.usedCard).toBe(false);
    expect(r.how.source).toBe("notes");
    expect(r.how.label).toBe(LABEL_NOTES);
    expect(r.how.path).toBe("model-decline");
    expect(labelMatchesSource(r.how)).toBe(true);
  });

  it("thin answer falls back to the note with From the notes", () => {
    const plan = planAsk(bundle, "What does charyot mean?");
    if (plan.kind !== "model") throw new Error("expected model");
    const r = finaliseAsk("OK.", plan, { tokens: 2, seconds: 0.5 });
    expect(r.usedCard).toBe(true);
    expect(r.how.source).toBe("notes");
    expect(r.how.label).toBe(LABEL_NOTES);
    expect(r.how.path).toBe("thin-or-glossary-fallback");
    expect(labelMatchesSource(r.how)).toBe(true);
  });

  it("Learn why is labelled as Written by LFM3 on this device", () => {
    const item = bundle.items.find((i) => i.id === "charyot-attention")!;
    const how = learnWhyHow({
      item,
      facts: "Korean: charyot\nEnglish: attention\nType: command\nCharyot means attention.",
      raw: "Charyot means stand still and listen.",
      tokens: 20,
      seconds: 1,
    });
    expect(how.source).toBe("model");
    expect(how.label).toBe(LABEL_MODEL);
    expect(how.path).toBe("learn-why");
    expect(how.check?.ok).toBe(true);
    expect(labelMatchesSource(how)).toBe(true);
  });

  // Copilot #4529813922 — Learn why uses the grounding check
  it("Learn why falls back to From the notes when the check fails", () => {
    const item = bundle.items.find((i) => i.id === "what-a-pattern-tul-is")!;
    const facts = itemFacts(item, bundle);
    const r = finaliseLearnWhy({
      item,
      facts,
      raw: "Chon-Ji is a way of standing in a ready stance.",
      tokens: 20,
      seconds: 1,
    });
    expect(r.usedCard).toBe(true);
    expect(r.how.source).toBe("notes");
    expect(r.how.label).toBe(LABEL_NOTES);
    expect(r.how.path).toBe("learn-why-fallback");
    expect(r.how.check?.ok).toBe(false);
    expect(labelMatchesSource(r.how)).toBe(true);
  });
});

describe("how-answered panel markup", () => {
  it("exposes aria-expanded toggle and a labelled region", () => {
    const plan = planAsk(bundle, "What does charyot mean?");
    if (plan.kind !== "model") throw new Error("expected model");
    const r = finaliseAsk("Charyot means attention.", plan, { tokens: 10, seconds: 2 });
    const html = sourceLabelHtml(r.how, "ask") + howAnsweredPanelHtml(r.how, "ask");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="ask-how"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-labelledby="ask-how-btn"');
    expect(html).toContain("Show how this was answered");
    expect(html).toContain("Written by LFM3 on this device");
  });

  it("wireHowToggle flips aria-expanded and hidden", () => {
    // Minimal DOM stand-in so we do not need jsdom.
    const panel = {
      hidden: true,
      id: "ask-how",
    };
    const btn = {
      attrs: { "aria-expanded": "false" } as Record<string, string>,
      textContent: "Show how this was answered",
      getAttribute(k: string) {
        return this.attrs[k] ?? null;
      },
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      },
      onclick: null as null | (() => void),
    };
    const root = {
      querySelector(sel: string) {
        if (sel === "#ask-how-btn") return btn;
        if (sel === "#ask-how") return panel;
        return null;
      },
    };
    wireHowToggle(root as unknown as ParentNode, "ask");
    expect(btn.onclick).toBeTypeOf("function");
    btn.onclick!();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(btn.textContent).toMatch(/Hide/);
    btn.onclick!();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
  });
});
