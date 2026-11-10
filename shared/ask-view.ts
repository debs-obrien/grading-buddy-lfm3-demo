// Ask answer panel: never flash raw streamed tokens that cleanAnswer will rewrite.
export const ASK_THINKING = "Thinking…";

export type AskDisplay = { text: string; final: boolean };

export type AskViewEvent =
  | { type: "start" }
  | { type: "token"; text: string }
  | { type: "answer"; text: string }
  | { type: "error"; text: string };

/** Next visible Ask text. Tokens are ignored so the panel never jumps when cleaning runs. */
export function nextAskDisplay(prev: AskDisplay, event: AskViewEvent, plain: (t: string) => string = (t) => t): AskDisplay {
  if (event.type === "start") return { text: ASK_THINKING, final: false };
  if (event.type === "token") return prev;
  if (event.type === "error") return { text: event.text, final: true };
  if (event.type === "answer") return { text: plain(event.text), final: true };
  return prev;
}

/**
 * Visible history is calm: optional Thinking…, then the final answer once
 * (or a string that only grows). Never a longer draft replaced by a different string.
 */
export function askDisplayIsCalm(history: string[]): boolean {
  let leftThinking = false;
  let final: string | null = null;
  for (const text of history) {
    if (!leftThinking) {
      if (text === ASK_THINKING) continue;
      leftThinking = true;
      final = text;
      continue;
    }
    if (final === null) return false;
    // After the first real answer, only allow identical or growing text — never a swap.
    if (text !== final && !text.startsWith(final)) return false;
    final = text;
  }
  return true;
}
