import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ORT_VARIANT,
  ORT_VERSION,
  PAGES_MAX_FILE_BYTES,
  isWasmMagic,
  ortCdnBase,
  ortCdnWasmUrl,
} from "../shared/ort.ts";

const ORT_DIR = [
  "node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist",
  "node_modules/onnxruntime-web/dist",
].map((p) => path.resolve(p)).find((p) => fs.existsSync(p))!;

describe("ORT Pages deploy constraints", () => {
  it("pins the same onnxruntime-web version Transformers.js installed", () => {
    const installed = JSON.parse(fs.readFileSync(path.join(ORT_DIR, "..", "package.json"), "utf8")).version;
    expect(ORT_VERSION).toBe(installed);
  });

  it("documents that asyncify.wasm is over the Pages 25 MiB limit", () => {
    const wasm = path.join(ORT_DIR, `${ORT_VARIANT}.wasm`);
    const bytes = fs.statSync(wasm).size;
    expect(bytes).toBeGreaterThan(PAGES_MAX_FILE_BYTES);
    expect(PAGES_MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
  });

  it("ships a same-origin .mjs under 25 MiB and keeps wasm on jsDelivr", () => {
    const mjs = path.join(ORT_DIR, `${ORT_VARIANT}.mjs`);
    expect(fs.statSync(mjs).size).toBeLessThanOrEqual(PAGES_MAX_FILE_BYTES);
    expect(ortCdnWasmUrl()).toBe(`${ortCdnBase()}${ORT_VARIANT}.wasm`);
  });

  it("accepts real wasm magic and rejects gzip bytes", () => {
    const wasm = fs.readFileSync(path.join(ORT_DIR, `${ORT_VARIANT}.wasm`));
    expect(isWasmMagic(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength))).toBe(true);
    expect(isWasmMagic(wasm.subarray(0, 8))).toBe(true);
    expect(isWasmMagic(Uint8Array.from([0x1f, 0x8b, 0x08, 0x08]))).toBe(false);
    expect(isWasmMagic(Uint8Array.from([0x00, 0x61, 0x73, 0x6d]))).toBe(true);
  });
});
