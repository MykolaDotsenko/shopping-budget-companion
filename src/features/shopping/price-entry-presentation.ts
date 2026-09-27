import {
  formatEur,
  signedMinorUnits,
  type MoneyDraftMode,
} from "../../domain/money";
import type {
  ActiveTrip,
  TripProjection,
} from "../../domain/shopping-trip";
import type { PriceEntryInvalidReason } from "./price-entry-draft";
import { englishTranslate, type Translate } from "./translation";

export const errorMessage = (
  reason: PriceEntryInvalidReason,
  mode: MoneyDraftMode = "decimal",
  t: Translate = englishTranslate,
): string => {
  switch (reason) {
    case "zero-not-allowed":
      return t("Enter a price above €0.");
    case "negative-not-allowed":
      return t("Item prices cannot be negative.");
    case "too-many-fraction-digits":
      return t("Use no more than two decimal places.");
    case "above-product-limit":
    case "unsafe-integer":
      return t("That price is too large.");
    case "invalid-format":
      return mode === "auto-cents"
        ? "Cents mode takes digits only: 479 for €4.79."
        : "Use a price like 4.79 or 4,79.";
    case "empty":
    case "incomplete":
      return "";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
};

export const formatAbsoluteSigned = (
  value: number,
  locale: string,
): string => {
  const amount = signedMinorUnits(Math.abs(value));

  if (!amount.ok) {
    throw new RangeError("Projected shopping amount exceeded safe integer bounds");
  }

  return formatEur(amount.value, locale);
};

export const projectionCopy = (
  trip: ActiveTrip,
  projection: TripProjection,
  locale: string,
  t: Translate = englishTranslate,
): {
  readonly primary: string;
  readonly secondary: string | null;
  readonly status: "within" | "reserve" | "over";
} => {
  if (projection.crossesNominalBudget) {
    return {
      primary: t("This puts you {amount} over your limit.", { amount: formatAbsoluteSigned(projection.nominalOverageMinor, locale) }),
      secondary: t("Cart would be {cart} of {budget}.", { cart: formatAbsoluteSigned(projection.cartTotalMinor, locale), budget: formatEur(trip.budgetMinor, locale) }),
      status: "over",
    };
  }

  if (trip.safetyBufferMinor > 0) {
    if (projection.safeRemainingMinor >= 0) {
      return {
        primary: t("After adding: {amount} safe to spend", { amount: formatAbsoluteSigned(projection.safeRemainingMinor, locale) }),
        secondary: t("Your {buffer} safety buffer stays untouched.", { buffer: formatEur(trip.safetyBufferMinor, locale) }),
        status: "within",
      };
    }

    return {
      primary: t("This item uses {amount} of your safety buffer.", { amount: formatAbsoluteSigned(projection.safetyBufferUseMinor, locale) }),
      secondary: t("{amount} of your {buffer} safety buffer would be left.", { amount: formatAbsoluteSigned(projection.remainingMinor, locale), buffer: formatEur(trip.safetyBufferMinor, locale) }),
      status: "reserve",
    };
  }

  return {
    primary: t("After adding: {amount} left", { amount: formatAbsoluteSigned(projection.remainingMinor, locale) }),
    secondary: null,
    status: "within",
  };
};
