import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pipeline: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({
  pipeline: mocks.pipeline,
}));

import {
  createTransformersVisualProductRecognizer,
  VISUAL_RECOGNITION_MODEL_ID,
  VISUAL_RECOGNITION_MODEL_REVISION,
} from "../src/infrastructure/visual-recognition/transformers-visual-recognizer";

describe("Transformers visual product recognizer", () => {
  beforeEach(() => {
    mocks.pipeline.mockReset();
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });
  });

  it("loads the pinned model lazily and returns ranked closed-set candidates", async () => {
    const classifier = vi.fn(async () => [
      { label: "Banana", score: 0.9 },
      { label: "Apple", score: 0.08 },
      { label: "Unknown", score: 0.99 },
    ]);
    mocks.pipeline.mockResolvedValue(classifier);

    const recognizer = createTransformersVisualProductRecognizer();

    expect(mocks.pipeline).not.toHaveBeenCalled();
    await expect(recognizer.prepare()).resolves.toBe(true);
    expect(mocks.pipeline).toHaveBeenCalledWith(
      "zero-shot-image-classification",
      VISUAL_RECOGNITION_MODEL_ID,
      expect.objectContaining({
        revision: VISUAL_RECOGNITION_MODEL_REVISION,
        device: "wasm",
        dtype: "q8",
      }),
    );

    await expect(
      recognizer.recognize(
        new Blob(["image"], { type: "image/jpeg" }),
        ["Banana", "Apple"],
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      status: "recognized",
      candidates: [
        { label: "Banana", confidence: 0.9 },
        { label: "Apple", confidence: 0.08 },
      ],
    });

    expect(classifier).toHaveBeenCalledWith(
      expect.any(Blob),
      ["Banana", "Apple"],
      { hypothesis_template: "a photo of the retail product {}" },
    );
  });

  it("tries WebGPU first and falls back to WASM if initialization fails", async () => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {},
    });
    const classifier = vi.fn(async () => []);
    mocks.pipeline
      .mockRejectedValueOnce(new Error("webgpu unavailable for model"))
      .mockResolvedValueOnce(classifier);

    const recognizer = createTransformersVisualProductRecognizer();

    await expect(recognizer.prepare()).resolves.toBe(true);
    expect(mocks.pipeline).toHaveBeenNthCalledWith(
      1,
      "zero-shot-image-classification",
      VISUAL_RECOGNITION_MODEL_ID,
      expect.objectContaining({ device: "webgpu", dtype: "q4f16" }),
    );
    expect(mocks.pipeline).toHaveBeenNthCalledWith(
      2,
      "zero-shot-image-classification",
      VISUAL_RECOGNITION_MODEL_ID,
      expect.objectContaining({ device: "wasm", dtype: "q8" }),
    );
  });

  it("honors cancellation and never turns a late result into a product choice", async () => {
    let finish: ((value: unknown) => void) | null = null;
    const classifier = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          finish = resolve;
        }),
    );
    mocks.pipeline.mockResolvedValue(classifier);
    const recognizer = createTransformersVisualProductRecognizer();
    await recognizer.prepare();

    const controller = new AbortController();
    const pending = recognizer.recognize(
      new Blob(["image"]),
      ["Banana", "Apple"],
      controller.signal,
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    finish?.([{ label: "Banana", score: 1 }]);
  });

  it("returns no-match without invoking inference when the candidate set is too small", async () => {
    const classifier = vi.fn();
    mocks.pipeline.mockResolvedValue(classifier);
    const recognizer = createTransformersVisualProductRecognizer();

    await expect(
      recognizer.recognize(
        new Blob(["image"]),
        ["Only product"],
        new AbortController().signal,
      ),
    ).resolves.toEqual({ status: "no-match" });
    expect(classifier).not.toHaveBeenCalled();
  });
});
