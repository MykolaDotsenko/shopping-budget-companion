import type { CartItem } from "../../domain/shopping-trip";
import { englishTranslate, type Translate } from "./translation";

const confidenceLabel = (item: CartItem, t: Translate): string => {
  switch (item.priceConfidence.kind) {
    case "confirmed":
      return t("Confirmed");
    case "remembered":
      return t("Remembered");
    case "estimated":
      return t("Estimated");
    default: {
      const exhaustive: never = item.priceConfidence;
      return exhaustive;
    }
  }
};

const sourceLabel = (item: CartItem, t: Translate): string => {
  switch (item.priceSource.kind) {
    case "manual":
      return t("Manual");
    case "price-memory":
      return t("Price memory");
    case "shelf-scan":
      return t("Shelf scan");
    case "encoded-barcode":
      return t("Barcode");
    case "retailer-feed":
      return t("Retailer feed");
    default: {
      const exhaustive: never = item.priceSource;
      return exhaustive;
    }
  }
};

export const trustLabel = (
  item: CartItem,
  t: Translate = englishTranslate,
): string =>
  item.priceSource.kind === "price-memory" &&
  item.priceConfidence.kind === "remembered"
    ? t("Remembered price")
    : `${confidenceLabel(item, t)} · ${sourceLabel(item, t)}`;
