import { describe, expect, it } from "vitest";

import {
  VISUAL_RECOGNITION_MAX_LABELS,
  VISUAL_RECOGNITION_MAX_PERSONAL_LABELS,
  visualRecognitionLabels,
} from "../src/application/visual-recognition-catalog";
import type { PriceMemoryRecord } from "../src/domain/price-memory";

const memory = (label: string, observedAt: string): PriceMemoryRecord =>
  ({
    id: `memory:${label}`,
    productId: `label:${label.toLowerCase()}`,
    label,
    currency: "EUR",
    unitPriceMinor: 100,
    observedAt,
    source: { kind: "manual" },
  }) as PriceMemoryRecord;

describe("visual recognition catalog", () => {
  it("puts the shopper's newest remembered products before common produce", () => {
    const labels = visualRecognitionLabels([
      memory("Older milk", "2026-09-01T10:00:00.000Z"),
      memory("Fresh bread", "2026-09-20T10:00:00.000Z"),
    ]);

    expect(labels.slice(0, 4)).toEqual([
      "Fresh bread",
      "Older milk",
      "Banana",
      "Apple",
    ]);
  });

  it("reserves capacity for common produce even with a large personal catalog", () => {
    const records = Array.from({ length: VISUAL_RECOGNITION_MAX_LABELS + 10 }, (_, index) =>
      memory(
        `Remembered product ${index}`,
        `2026-09-${String((index % 20) + 1).padStart(2, "0")}T10:00:00.000Z`,
      ),
    );

    const labels = visualRecognitionLabels(records);

    expect(labels).toHaveLength(VISUAL_RECOGNITION_MAX_LABELS);
    expect(labels.slice(0, VISUAL_RECOGNITION_MAX_PERSONAL_LABELS)).toHaveLength(
      VISUAL_RECOGNITION_MAX_PERSONAL_LABELS,
    );
    expect(labels).toEqual(expect.arrayContaining(["Banana", "Apple", "Tomato"]));
  });

  it("normalizes, deduplicates and keeps the recognition set bounded", () => {
    const records = Array.from({ length: 40 }, (_, index) =>
      memory(
        index === 1 ? "  Product   0  " : `Product ${index}`,
        `2026-09-${String((index % 20) + 1).padStart(2, "0")}T10:00:00.000Z`,
      ),
    );

    const labels = visualRecognitionLabels(records);

    expect(labels).toHaveLength(VISUAL_RECOGNITION_MAX_LABELS);
    expect(new Set(labels.map((label) => label.toLowerCase())).size).toBe(
      labels.length,
    );
  });
});
