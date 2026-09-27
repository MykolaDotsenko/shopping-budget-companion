import type { PriceMemoryRecord } from "../domain/price-memory";

export const VISUAL_RECOGNITION_MAX_LABELS = 30;

const COMMON_UNBARCODED_PRODUCTS = Object.freeze([
  "Banana",
  "Apple",
  "Orange",
  "Lemon",
  "Lime",
  "Pear",
  "Avocado",
  "Tomato",
  "Cucumber",
  "Carrot",
  "Potato",
  "Onion",
  "Garlic",
  "Bell pepper",
  "Broccoli",
  "Cauliflower",
  "Zucchini",
  "Eggplant",
  "Lettuce",
  "Cabbage",
  "Grapes",
  "Kiwi",
  "Mango",
  "Peach",
] as const);

const normalize = (value: string): string =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ");

export const visualRecognitionLabels = (
  memories: readonly PriceMemoryRecord[],
): readonly string[] => {
  const newestFirst = [...memories].sort(
    (left, right) =>
      Date.parse(right.observedAt) - Date.parse(left.observedAt),
  );
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const candidate of [
    ...newestFirst.map((record) => record.label),
    ...COMMON_UNBARCODED_PRODUCTS,
  ]) {
    const label = normalize(candidate);
    const key = label.toLocaleLowerCase("en");

    if (label === "" || seen.has(key)) {
      continue;
    }

    seen.add(key);
    labels.push(label);

    if (labels.length >= VISUAL_RECOGNITION_MAX_LABELS) {
      break;
    }
  }

  return Object.freeze(labels);
};
