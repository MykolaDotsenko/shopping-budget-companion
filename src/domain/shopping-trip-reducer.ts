import type { Result } from "./money";
import {
  cartTotalResult,
  domainError,
  isoTimestamp,
  normalizeLabel,
  ok,
  timestampAtOrAfter,
  validateActualCheckout,
  validateBudget,
  validateBuffer,
  validateCartItem,
  validateUniqueItemIds,
  type ActiveTrip,
  type CartItem,
  type CompletedTrip,
  type DomainError,
  type ShoppingTrip,
  type TripCommand,
} from "./shopping-trip-model";

const activeTripOnly = (
  trip: ShoppingTrip,
): Result<ActiveTrip, DomainError> =>
  trip.status === "active" ? ok(trip) : domainError("trip-not-active");

const completedTripOnly = (
  trip: ShoppingTrip,
): Result<CompletedTrip, DomainError> =>
  trip.status === "completed"
    ? ok(trip)
    : domainError("trip-not-completed");

const withValidatedItems = (
  trip: ActiveTrip,
  items: readonly CartItem[],
): Result<ActiveTrip, DomainError> => {
  const uniqueResult = validateUniqueItemIds(items);

  if (!uniqueResult.ok) {
    return uniqueResult;
  }

  const totalResult = cartTotalResult(items);

  if (!totalResult.ok) {
    return totalResult;
  }

  return ok({
    ...trip,
    items,
  });
};

export const restoreTripItems = (
  trip: ActiveTrip,
  items: readonly CartItem[],
): Result<ActiveTrip, DomainError> => {
  const restored: CartItem[] = [...trip.items];

  for (const item of items) {
    const itemResult = validateCartItem(item);

    if (!itemResult.ok) {
      return itemResult;
    }

    restored.push(itemResult.value);
  }

  return withValidatedItems(trip, restored);
};

const hasOwn = <K extends PropertyKey>(
  value: object,
  key: K,
): value is Record<K, unknown> =>
  Object.prototype.hasOwnProperty.call(value, key);

export const reduceTrip = (
  trip: ShoppingTrip,
  command: TripCommand,
): Result<ShoppingTrip, DomainError> => {
  switch (command.type) {
    case "add-item": {
      const activeResult = activeTripOnly(trip);

      if (!activeResult.ok) {
        return activeResult;
      }

      const itemResult = validateCartItem(command.item);

      if (!itemResult.ok) {
        return itemResult;
      }

      if (
        activeResult.value.items.some(
          (item) => item.id === itemResult.value.id,
        )
      ) {
        return domainError("duplicate-item-id");
      }

      return withValidatedItems(activeResult.value, [
        ...activeResult.value.items,
        itemResult.value,
      ]);
    }

    case "update-item": {
      const activeResult = activeTripOnly(trip);

      if (!activeResult.ok) {
        return activeResult;
      }

      const index = activeResult.value.items.findIndex(
        (item) => item.id === command.itemId,
      );

      if (index < 0) {
        return domainError("item-not-found");
      }

      const current = activeResult.value.items[index];

      if (current === undefined) {
        return domainError("item-not-found");
      }

      if (!timestampAtOrAfter(command.now, current.updatedAt)) {
        return domainError("invalid-timestamp");
      }

      const labelResult = hasOwn(command.patch, "label")
        ? normalizeLabel(command.patch.label as string | null | undefined)
        : ok(current.label);

      if (!labelResult.ok) {
        return labelResult;
      }

      const candidateBase = {
        id: current.id,
        unitPriceMinor:
          command.patch.unitPriceMinor ?? current.unitPriceMinor,
        quantity: command.patch.quantity ?? current.quantity,
        priceSource: command.patch.priceSource ?? current.priceSource,
        priceConfidence:
          command.patch.priceConfidence ?? current.priceConfidence,
        createdAt: current.createdAt,
        updatedAt: command.now,
      } satisfies Omit<CartItem, "label">;

      const candidate: CartItem =
        labelResult.value === undefined
          ? candidateBase
          : { ...candidateBase, label: labelResult.value };

      const candidateResult = validateCartItem(candidate);

      if (!candidateResult.ok) {
        return candidateResult;
      }

      const nextItems = activeResult.value.items.map((item, itemIndex) =>
        itemIndex === index ? candidateResult.value : item,
      );

      return withValidatedItems(activeResult.value, nextItems);
    }

    case "remove-item": {
      const activeResult = activeTripOnly(trip);

      if (!activeResult.ok) {
        return activeResult;
      }

      const exists = activeResult.value.items.some(
        (item) => item.id === command.itemId,
      );

      if (!exists) {
        return domainError("item-not-found");
      }

      return withValidatedItems(
        activeResult.value,
        activeResult.value.items.filter(
          (item) => item.id !== command.itemId,
        ),
      );
    }

    case "set-spending-plan": {
      const activeResult = activeTripOnly(trip);

      if (!activeResult.ok) {
        return activeResult;
      }

      const budgetResult = validateBudget(command.budgetMinor);

      if (!budgetResult.ok) {
        return budgetResult;
      }

      const bufferResult = validateBuffer(
        command.safetyBufferMinor,
        budgetResult.value,
      );

      if (!bufferResult.ok) {
        return bufferResult;
      }

      if (
        budgetResult.value === activeResult.value.budgetMinor &&
        bufferResult.value === activeResult.value.safetyBufferMinor
      ) {
        return ok(activeResult.value);
      }

      return ok({
        ...activeResult.value,
        budgetMinor: budgetResult.value,
        safetyBufferMinor: bufferResult.value,
      });
    }

    case "set-budget": {
      const activeResult = activeTripOnly(trip);

      if (!activeResult.ok) {
        return activeResult;
      }

      const budgetResult = validateBudget(command.budgetMinor);

      if (!budgetResult.ok) {
        return budgetResult;
      }

      const bufferResult = validateBuffer(
        activeResult.value.safetyBufferMinor,
        budgetResult.value,
      );

      if (!bufferResult.ok) {
        return bufferResult;
      }

      if (budgetResult.value === activeResult.value.budgetMinor) {
        return ok(activeResult.value);
      }

      return ok({
        ...activeResult.value,
        budgetMinor: budgetResult.value,
      });
    }

    case "set-buffer": {
      const activeResult = activeTripOnly(trip);

      if (!activeResult.ok) {
        return activeResult;
      }

      const bufferResult = validateBuffer(
        command.safetyBufferMinor,
        activeResult.value.budgetMinor,
      );

      if (!bufferResult.ok) {
        return bufferResult;
      }

      if (
        bufferResult.value === activeResult.value.safetyBufferMinor
      ) {
        return ok(activeResult.value);
      }

      return ok({
        ...activeResult.value,
        safetyBufferMinor: bufferResult.value,
      });
    }

    case "complete-trip": {
      const activeResult = activeTripOnly(trip);

      if (!activeResult.ok) {
        return activeResult;
      }

      const completedAtResult = isoTimestamp(command.completedAt);

      if (!completedAtResult.ok) {
        return completedAtResult;
      }

      let latestTimestamp = activeResult.value.startedAt;

      for (const item of activeResult.value.items) {
        if (timestampAtOrAfter(item.updatedAt, latestTimestamp)) {
          latestTimestamp = item.updatedAt;
        }
      }

      if (
        !timestampAtOrAfter(
          completedAtResult.value,
          latestTimestamp,
        )
      ) {
        return domainError("invalid-timestamp");
      }

      return ok({
        id: activeResult.value.id,
        currency: activeResult.value.currency,
        budgetMinor: activeResult.value.budgetMinor,
        safetyBufferMinor: activeResult.value.safetyBufferMinor,
        items: activeResult.value.items,
        status: "completed",
        startedAt: activeResult.value.startedAt,
        completedAt: completedAtResult.value,
      });
    }

    case "set-actual-checkout": {
      const completedResult = completedTripOnly(trip);

      if (!completedResult.ok) {
        return completedResult;
      }

      const checkoutResult = validateActualCheckout(
        command.actualCheckoutMinor,
      );

      if (!checkoutResult.ok) {
        return checkoutResult;
      }

      return ok({
        ...completedResult.value,
        actualCheckoutMinor: checkoutResult.value,
      });
    }

    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
};
