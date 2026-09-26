import {
  formatEur,
  signedMinorUnits,
  type MoneyInputErrorCode,
} from "../../domain/money";
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
): { readonly status: BudgetOutcomeStatus; readonly label: string } => {
  const paid =
    trip.status === "completed" && trip.actualCheckoutMinor !== undefined
      ? trip.actualCheckoutMinor
      : null;
  const amount = paid === null ? remaining(trip) : trip.budgetMinor - paid;
  const prefix = paid === null ? "" : "Paid ";

  if (amount === 0) {
    return { status: "on", label: paid === null ? "On budget" : "Paid exactly the budget" };
  }

  return amount > 0
    ? { status: "under", label: `${prefix}${formatAbsoluteEur(amount, locale)} under budget` }
    : { status: "over", label: `${prefix}${formatAbsoluteEur(amount, locale)} over budget` };
};

export const remainingFeedback = (
  trip: ActiveTrip,
  locale: string,
): string => {
  const nominalRemaining = remaining(trip);

  if (nominalRemaining < 0) {
    return `${formatAbsoluteEur(nominalRemaining, locale)} over your limit.`;
  }

  if (trip.safetyBufferMinor > 0) {
    const protectedRemaining = safeRemaining(trip);

    if (protectedRemaining >= 0) {
      return `${formatEur(protectedRemaining, locale)} safe to spend.`;
    }

    return `${formatEur(nominalRemaining, locale)} of your ${formatEur(
      trip.safetyBufferMinor,
      locale,
    )} safety buffer left.`;
  }

  return `${formatEur(nominalRemaining, locale)} left.`;
};

export const addedFeedback = (
  trip: ActiveTrip,
  item: CartItem,
  locale: string,
): string =>
  `${formatEur(lineTotal(item), locale)} added. ${remainingFeedback(trip, locale)}`;

export const moneyInputErrorMessage = (code: MoneyInputErrorCode): string => {
  switch (code) {
    case "empty":
      return "Enter an amount.";
    case "incomplete":
      return "Finish the amount.";
    case "invalid-format":
      return "Use a euro amount like 50.00.";
    case "negative-not-allowed":
      return "Use zero or a positive amount.";
    case "too-many-fraction-digits":
      return "Use no more than two decimal places.";
    case "above-product-limit":
    case "unsafe-integer":
      return "That amount is too large.";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
};
