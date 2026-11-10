import type { HowAnswered } from "../../shared/provenance.ts";

export type Device = "webgpu" | "wasm";

export type ToWorker =
  | { type: "load"; device: Device; dtype: string }
  | { type: "ask"; id: number; question: string }
  | { type: "why"; id: number; itemId: string };

export type FromWorker =
  | { type: "progress"; loaded: number; total: number; file?: string; fromCache: boolean }
  | { type: "status"; text: string }
  | { type: "ready"; device: Device; dtype: string; loadSeconds: number }
  | { type: "token"; id: number; text: string }
  | {
      type: "answer";
      id: number;
      text: string;
      sources: string[];
      gated: boolean;
      tokens: number;
      seconds: number;
      how: HowAnswered;
      /** True when the visible text is an item card / note fallback. */
      usedCard?: boolean;
      /** Learn why helper explanation. */
      helper?: boolean;
    }
  | { type: "error"; id?: number; message: string };
