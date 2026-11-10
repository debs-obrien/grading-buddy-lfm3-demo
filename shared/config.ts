// Every tunable default lives here so it is easy to change.
export const CONFIG = {
  // onnx-community export: Liquid's documented web path (Transformers.js + ONNX + WebGPU).
  modelId: "onnx-community/LFM3-1.7B-ONNX",
  dtypeWebGPU: "q4f16", // ~1.09 GB
  dtypeWasm: "q4", // ~1.30 GB — not used unless allowWasmFallback
  // No WebGPU -> Learn + Quiz still open; Ask shows a plain-words notice.
  allowWasmFallback: false,
  downloadSizeLabel: "about 1.1 GB",
  maxNewTokens: 160,
  // iOS Safari memory fix (onnxruntime issue #33793). Must sit under `extra`.
  sessionOptions: {
    extra: { "optimization.disable_specified_optimizers": "ConstantFolding" },
  },
  // Greedy decoding so answers are repeatable.
  generation: { do_sample: false, repetition_penalty: 1.05 },
};

// Fixed refusal when nothing in the white-to-yellow content matches.
export const DECLINE = "Sorry, that's not part of the white to yellow belt grading.";

// Shown instead of DECLINE when a pain/injury question is safety-gated (no medical advice).
export const PAIN_REPLY = "If something hurts, stop and tell your instructor or a grown-up.";
