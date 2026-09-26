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

export const errorMessage = (
  reason: PriceEntryInvalidReason,
  mode: MoneyDraftMode = "decimal",
): string => {
  switch (reason) {
    case "zero-not-allowed":
      return "Enter a price above €0.";
    case "negative-not-allowed":
      return "Item prices cannot be negative.";
    case "too-many-fraction-digits":
      return "Use no more than two decimal places.";
    case "above-product-limit":
    case "unsafe-integer":
      return "That price is too large.";
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
): {
  readonly primary: string;
  readonly secondary: string | null;
  readonly status: "within" | "reserve" | "over";
} => {
  if (projection.crossesNominalBudget) {
    return {
      primary: `This puts you ${formatAbsoluteSigned(projection.nominalOverageMinor, locale)} over your limit.`,
      secondary: `Cart would be ${formatAbsoluteSigned(projection.cartTotalMinor, locale)} of ${formatEur(trip.budgetMinor, locale)}.`,
      status: "over",
    };
  }

  if (trip.safetyBufferMinor > 0) {
    if (projection.safeRemainingMinor >= 0) {
      return {
        primary: `After adding: ${formatAbsoluteSigned(projection.safeRemainingMinor, locale)} safe to spend`,
        secondary: `Your ${formatEur(trip.safetyBufferMinor, locale)} safety buffer stays untouched.`,
        status: "within",
      };
    }

    return {
      primary: `This item uses ${formatAbsoluteSigned(projection.safetyBufferUseMinor, locale)} of your safety buffer.`,
      secondary: `${formatAbsoluteSigned(projection.remainingMinor, locale)} of your ${formatEur(trip.safetyBufferMinor, locale)} safety buffer would be left.`,
      status: "reserve",
    };
  }

  return {
    primary: `After adding: ${formatAbsoluteSigned(projection.remainingMinor, locale)} left`,
    secondary: null,
    status: "within",
  };
};
