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

  const add = (candidate: string): boolean => {
    const label = normalize(candidate);
    const key = label.toLocaleLowerCase("en");

    if (label === "" || seen.has(key)) {
      return false;
    }

    seen.add(key);
    labels.push(label);
    return true;
  };

  let personalCount = 0;

  for (const record of newestFirst) {
    if (add(record.label)) {
      personalCount += 1;
    }

    if (personalCount >= VISUAL_RECOGNITION_MAX_PERSONAL_LABELS) {
      break;
    }
  }

  for (const candidate of COMMON_UNBARCODED_PRODUCTS) {
    add(candidate);

    if (labels.length >= VISUAL_RECOGNITION_MAX_LABELS) {
      return Object.freeze(labels);
    }
  }

  for (const record of newestFirst) {
    add(record.label);

    if (labels.length >= VISUAL_RECOGNITION_MAX_LABELS) {
      break;
    }
  }

  return Object.freeze(labels);
};
