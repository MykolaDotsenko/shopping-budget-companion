import {
  formatEur,
  signedMinorUnits,
  type MoneyInputErrorCode,
} from "../../domain/money";
import { englishTranslate, type Translate } from "./translation";
import {
  lineTotal,
  remaining,
  safeRemaining,
  type ActiveTrip,
  type CartItem,
  type ShoppingTrip,
} from "../../domain/shopping-trip";

export const formatAbsoluteEur = (value: number, locale: string): string => {
  const amount = signedMinorUnits(Math.abs(value));

  if (!amount.ok) {
    throw new RangeError("Amount exceeded safe integer bounds");
  }

  return formatEur(amount.value, locale);
};

export type BudgetOutcomeStatus = "under" | "on" | "over";

export const budgetOutcome = (
  trip: ShoppingTrip,
  locale: string,
  t: Translate = englishTranslate,
): { readonly status: BudgetOutcomeStatus; readonly label: string } => {
  const paid =
    trip.status === "completed" && trip.actualCheckoutMinor !== undefined
      ? trip.actualCheckoutMinor
      : null;
  const amount = paid === null ? remaining(trip) : trip.budgetMinor - paid;
  const prefix = paid === null ? "" : "Paid ";

  if (amount === 0) {
    return {
      status: "on",
      label: paid === null ? t("On budget") : t("Paid exactly the budget"),
    };
  }

  const formatted = formatAbsoluteEur(amount, locale);

  if (paid !== null) {
    return amount > 0
      ? { status: "under", label: t("Paid {amount} under budget", { amount: formatted }) }
      : { status: "over", label: t("Paid {amount} over budget", { amount: formatted }) };
  }

  return amount > 0
    ? { status: "under", label: t("{amount} under budget", { amount: formatted }) }
    : { status: "over", label: t("{amount} over budget", { amount: formatted }) };
};

export const remainingFeedback = (
  trip: ActiveTrip,
  locale: string,
  t: Translate = englishTranslate,
): string => {
  const nominalRemaining = remaining(trip);

  if (nominalRemaining < 0) {
    return t("{amount} over your limit.", {
      amount: formatAbsoluteEur(nominalRemaining, locale),
    });
  }

  if (trip.safetyBufferMinor > 0) {
    const protectedRemaining = safeRemaining(trip);

    if (protectedRemaining >= 0) {
      return t("{amount} safe to spend.", {
        amount: formatEur(protectedRemaining, locale),
      });
    }

    return t("{amount} of your {buffer} safety buffer left.", {
      amount: formatEur(nominalRemaining, locale),
      buffer: formatEur(trip.safetyBufferMinor, locale),
    });
  }

  return t("{amount} left.", {
    amount: formatEur(nominalRemaining, locale),
  });
};

export const addedFeedback = (
  trip: ActiveTrip,
  item: CartItem,
  locale: string,
  t: Translate = englishTranslate,
): string =>
  t("{amount} added. {remaining}", {
    amount: formatEur(lineTotal(item), locale),
    remaining: remainingFeedback(trip, locale, t),
  });

export const moneyInputErrorMessage = (
  code: MoneyInputErrorCode,
  t: Translate = englishTranslate,
): string => {
  switch (code) {
    case "empty":
      return t("Enter an amount.");
    case "incomplete":
      return t("Finish the amount.");
    case "invalid-format":
      return t("Use a euro amount like 50.00.");
    case "negative-not-allowed":
      return t("Use zero or a positive amount.");
    case "too-many-fraction-digits":
      return t("Use no more than two decimal places.");
    case "above-product-limit":
    case "unsafe-integer":
      return t("That amount is too large.");
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
};
