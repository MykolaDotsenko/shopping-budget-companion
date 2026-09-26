import type { CartItem } from "../../domain/shopping-trip";

const confidenceLabel = (item: CartItem): string => {
  switch (item.priceConfidence.kind) {
    case "confirmed":
      return "Confirmed";
    case "remembered":
      return "Remembered";
    case "estimated":
      return "Estimated";
    default: {
      const exhaustive: never = item.priceConfidence;
      return exhaustive;
    }
  }
};

const sourceLabel = (item: CartItem): string => {
  switch (item.priceSource.kind) {
    case "manual":
      return "Manual";
    case "price-memory":
      return "Price memory";
    case "shelf-scan":
      return "Shelf scan";
    case "encoded-barcode":
      return "Barcode";
    case "retailer-feed":
      return "Retailer feed";
    default: {
      const exhaustive: never = item.priceSource;
      return exhaustive;
    }
  }
};

export const trustLabel = (item: CartItem): string =>
  item.priceSource.kind === "price-memory" &&
  item.priceConfidence.kind === "remembered"
    ? "Remembered price"
    : `${confidenceLabel(item)} · ${sourceLabel(item)}`;
