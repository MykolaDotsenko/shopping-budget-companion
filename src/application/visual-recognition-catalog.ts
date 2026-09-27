import type { PriceMemoryRecord } from "../domain/price-memory";

export const VISUAL_RECOGNITION_MAX_LABELS = 30;
export const VISUAL_RECOGNITION_MAX_PERSONAL_LABELS = 18;

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
  const personal = newestFirst.map((record) => record.label);
  const candidates = [
    ...personal.slice(0, VISUAL_RECOGNITION_MAX_PERSONAL_LABELS),
    ...COMMON_UNBARCODED_PRODUCTS,
    ...personal.slice(VISUAL_RECOGNITION_MAX_PERSONAL_LABELS),
  ];

  for (const candidate of candidates) {
    const label = normalize(candidate);
    const key = label.toLocaleLowerCase("en");

    if (label !== "" && !seen.has(key)) {
      seen.add(key);
      labels.push(label);
    }

    if (labels.length >= VISUAL_RECOGNITION_MAX_LABELS) {
      break;
    }
  }

  return Object.freeze(labels);
};
