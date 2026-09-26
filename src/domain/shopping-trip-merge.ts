import type { ActiveTrip, CartItem } from "./shopping-trip-model";
import { restoreTripItems } from "./shopping-trip-reducer";
import { sameCartItem } from "./shopping-trip-selectors";

const samePlan = (left: ActiveTrip, right: ActiveTrip): boolean =>
  left.budgetMinor === right.budgetMinor &&
  left.safetyBufferMinor === right.safetyBufferMinor;

export const mergeTripChanges = (
  base: ActiveTrip,
  mine: ActiveTrip,
  theirs: ActiveTrip,
): ActiveTrip | null => {
  if (base.id !== mine.id || base.id !== theirs.id) {
    return null;
  }

  const baseItems = new Map(base.items.map((item) => [item.id, item]));
  const mineItems = new Map(mine.items.map((item) => [item.id, item]));
  const theirItems = new Set(theirs.items.map((item) => item.id));
  const items: CartItem[] = [
    ...theirs.items.flatMap((item) => {
      const before = baseItems.get(item.id);

      if (before === undefined || !sameCartItem(before, item)) {
        return [item];
      }

      const now = mineItems.get(item.id);

      return now === undefined ? [] : [now];
    }),
    ...mine.items.filter(
      (item) => !baseItems.has(item.id) && !theirItems.has(item.id),
    ),
  ];
  const plan = !samePlan(mine, base) && samePlan(theirs, base) ? mine : theirs;
  const merged = restoreTripItems(
    {
      ...theirs,
      budgetMinor: plan.budgetMinor,
      safetyBufferMinor: plan.safetyBufferMinor,
      items: [],
    },
    items,
  );

  return merged.ok ? merged.value : null;
};
