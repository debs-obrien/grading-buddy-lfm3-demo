import { describe, it, expect } from "vitest";
import { ASK_THINKING, askDisplayIsCalm, nextAskDisplay, type AskDisplay } from "../shared/ask-view.ts";

describe("ask display (no flicker)", () => {
  it("keeps Thinking… through token events, then shows the cleaned answer once", () => {
    let view: AskDisplay = nextAskDisplay({ text: "", final: false }, { type: "start" });
    const history = [view.text];
    // Raw stream that would later be shortened (the Chon-Ji flicker case).
    view = nextAskDisplay(view, {
      type: "token",
      text: "Chon-Ji has 19 moves. The moves are:\n1. Left foot left, low block left forearm.",
    });
    history.push(view.text);
    view = nextAskDisplay(view, {
      type: "token",
      text: "Chon-Ji has 19 moves. The moves are:\n1. Left foot left, low block left forearm.\n2. Step forward…",
    });
    history.push(view.text);
    view = nextAskDisplay(view, { type: "answer", text: "Chon-Ji has 19 moves." });
    history.push(view.text);

    expect(history).toEqual([ASK_THINKING, ASK_THINKING, ASK_THINKING, "Chon-Ji has 19 moves."]);
    expect(askDisplayIsCalm(history)).toBe(true);
    expect(view.final).toBe(true);
  });

  it("rejects a history where a longer draft is replaced by a different shorter string", () => {
    const flickered = [
      "Chon-Ji has 19 moves. The moves are: 1. Left foot left…",
      "Chon-Ji has 19 moves.",
    ];
    expect(askDisplayIsCalm(flickered)).toBe(false);
  });

  it("allows identical repeats and growing text after the first answer", () => {
    expect(askDisplayIsCalm([ASK_THINKING, "Hello", "Hello", "Hello there"])).toBe(true);
  });
});
