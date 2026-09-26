import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  MAX_MVP_MONEY_MINOR,
  minorUnits,
  type MinorUnits,
  type Result,
} from "../src/domain/money";
import {
  MAX_ITEM_LABEL_CODE_POINTS,
  cartTotal,
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  itemCount,
  itemId,
  latestTripTimestamp,
  laterTimestamp,
  lineTotal,
  nominalOverage,
  mostRecentCompletedTrip,
  projectAddItem,
  projectSpendingPlan,
  reduceTrip,
  remaining,
  restoreTripItems,
  safeLimit,
  safeOverage,
  safeRemaining,
  sameTripContents,
  tripId,
  type ActiveTrip,
  type CartItem,
  type DomainError,
  type EditableItemPatch,
  type IsoTimestamp,
  type ItemId,
  type PriceConfidence,
  type PriceSource,
  type ShoppingTrip,
} from "../src/domain/shopping-trip";

const MANUAL: PriceSource = { kind: "manual" };
const START = "2026-09-21T09:00:00.000Z";
const LATER = "2026-09-21T09:05:00.000Z";
const FINISH = "2026-09-21T10:00:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected successful Result");
  }

  return result.value;
};

const money = (value: number): MinorUnits => unwrap(minorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));
const id = (value: string): ItemId => unwrap(itemId(value));

const confirmed = (value = START): PriceConfidence => ({
  kind: "confirmed",
  confirmedAt: time(value),
});

const createTrip = (
  budgetMinor = 5_000,
  safetyBufferMinor = 0,
): ActiveTrip =>
  unwrap(
    createActiveTrip({
      id: "trip-1",
      currency: "EUR",
      budgetMinor: money(budgetMinor),
      safetyBufferMinor: money(safetyBufferMinor),
      startedAt: START,
    }),
  );

const createItem = ({
  id: itemIdentifier,
  price,
  quantity = 1,
  label,
  confidence = confirmed(),
  createdAt = START,
  updatedAt,
}: {
  id: string;
  price: number;
  quantity?: number;
  label?: string | null;
  confidence?: PriceConfidence;
  createdAt?: string;
  updatedAt?: string;
}): CartItem =>
  unwrap(
    createCartItem({
      id: itemIdentifier,
      unitPriceMinor: money(price),
      quantity,
      ...(label === undefined ? {} : { label }),
      priceSource: MANUAL,
      priceConfidence: confidence,
      createdAt,
      ...(updatedAt === undefined ? {} : { updatedAt }),
    }),
  );

const expectActive = (trip: ShoppingTrip): ActiveTrip => {
  expect(trip.status).toBe("active");

  if (trip.status !== "active") {
    throw new Error("Expected active trip");
  }

  return trip;
};

const addItem = (trip: ActiveTrip, item: CartItem): ActiveTrip =>
  expectActive(
    unwrap(
      reduceTrip(trip, {
        type: "add-item",
        item,
      }),
    ),
  );

const expectDomainError = (
  result: Result<unknown, DomainError>,
  code: DomainError["code"],
): void => {
  expect(result).toEqual({
    ok: false,
    error: {
      kind: "domain",
      code,
    },
  });
};

describe("completed-trip selectors", () => {
  it("returns the newest completed trip without mutating source order", () => {
    const complete = (
      tripId: string,
      completedAt: string,
      budgetMinor: number,
    ) => {
      const active = unwrap(
        createActiveTrip({
          id: tripId,
          budgetMinor: money(budgetMinor),
          startedAt: START,
        }),
      );
      const result = unwrap(
        reduceTrip(active, {
          type: "complete-trip",
          completedAt: time(completedAt),
        }),
      );

      if (result.status !== "completed") {
        throw new Error("Expected completed trip");
      }

      return result;
    };

    const middle = complete("middle", "2026-09-21T11:00:00.000Z", 5_000);
    const newest = complete("newest", "2026-09-21T12:00:00.000Z", 7_500);
    const oldest = complete("oldest", "2026-09-21T10:00:00.000Z", 2_500);
    const trips = [middle, newest, oldest] as const;

    expect(mostRecentCompletedTrip(trips)).toBe(newest);
    expect(trips).toEqual([middle, newest, oldest]);
    expect(mostRecentCompletedTrip([])).toBeNull();
  });
});

describe("shopping trip construction", () => {
  it("creates an empty EUR trip with exact budget and buffer", () => {
    const trip = createTrip(5_000, 200);

    expect(trip).toMatchObject({
      currency: "EUR",
      budgetMinor: 5_000,
      safetyBufferMinor: 200,
      items: [],
      status: "active",
      startedAt: START,
    });
    expect(cartTotal(trip)).toBe(0);
    expect(remaining(trip)).toBe(5_000);
    expect(safeLimit(trip)).toBe(4_800);
    expect(safeRemaining(trip)).toBe(4_800);
  });

  it("defaults the safety buffer to zero", () => {
    const trip = unwrap(
      createActiveTrip({
        id: "trip-default-buffer",
        budgetMinor: money(2_500),
        startedAt: START,
      }),
    );

    expect(trip.safetyBufferMinor).toBe(0);
    expect(safeLimit(trip)).toBe(2_500);
  });

  it("rejects unsupported currency, zero budget and buffer above budget", () => {
    expectDomainError(
      createActiveTrip({
        id: "trip",
        currency: "USD",
        budgetMinor: money(5_000),
        startedAt: START,
      }),
      "unsupported-currency",
    );

    expectDomainError(
      createActiveTrip({
        id: "trip",
        budgetMinor: money(0),
        startedAt: START,
      }),
      "invalid-budget",
    );

    expectDomainError(
      createActiveTrip({
        id: "trip",
        budgetMinor: money(5_000),
        safetyBufferMinor: money(5_001),
        startedAt: START,
      }),
      "invalid-buffer",
    );
  });

  it("rejects product-level budget overflow even when technical minor units are safe", () => {
    expectDomainError(
      createActiveTrip({
        id: "trip",
        budgetMinor: money(MAX_MVP_MONEY_MINOR + 1),
        startedAt: START,
      }),
      "invalid-budget",
    );
  });

  it("trims identifiers and rejects empty identifiers", () => {
    const trip = unwrap(
      createActiveTrip({
        id: "  trip-trimmed  ",
        budgetMinor: money(5_000),
        startedAt: START,
      }),
    );

    expect(trip.id).toBe("trip-trimmed");

    expectDomainError(
      createActiveTrip({
        id: "   ",
        budgetMinor: money(5_000),
        startedAt: START,
      }),
      "invalid-id",
    );
  });

  it("accepts only canonical UTC ISO timestamps", () => {
    for (const startedAt of [
      "not-a-date",
      "09/21/2026 09:00",
      "2026-09-21T12:00:00+03:00",
      "2026-09-21T09:00:00Z",
      "2026-02-31T09:00:00.000Z",
    ]) {
      expectDomainError(
        createActiveTrip({
          id: "trip",
          budgetMinor: money(5_000),
          startedAt,
        }),
        "invalid-timestamp",
      );
    }

    expect(
      createActiveTrip({
        id: "trip",
        budgetMinor: money(5_000),
        startedAt: START,
      }).ok,
    ).toBe(true);
  });
});

describe("cart item construction", () => {
  it("creates an exact canonical item", () => {
    const item = createItem({
      id: "milk",
      price: 479,
      quantity: 3,
      label: "  Milk 1L  ",
    });

    expect(item).toMatchObject({
      id: "milk",
      unitPriceMinor: 479,
      quantity: 3,
      label: "Milk 1L",
      priceSource: { kind: "manual" },
      priceConfidence: { kind: "confirmed" },
      createdAt: START,
      updatedAt: START,
    });
    expect(lineTotal(item)).toBe(1_437);
  });

  it("normalizes blank labels to absent", () => {
    const item = createItem({
      id: "blank-label",
      price: 199,
      label: "   ",
    });

    expect("label" in item).toBe(false);
  });

  it("counts Unicode code points rather than UTF-16 code units for label limits", () => {
    const exact = "🛒".repeat(MAX_ITEM_LABEL_CODE_POINTS);
    const tooLong = exact + "🛒";

    expect(
      createCartItem({
        id: "emoji-ok",
        unitPriceMinor: money(100),
        quantity: 1,
        label: exact,
        priceSource: MANUAL,
        priceConfidence: confirmed(),
        createdAt: START,
      }).ok,
    ).toBe(true);

    expectDomainError(
      createCartItem({
        id: "emoji-too-long",
        unitPriceMinor: money(100),
        quantity: 1,
        label: tooLong,
        priceSource: MANUAL,
        priceConfidence: confirmed(),
        createdAt: START,
      }),
      "invalid-label",
    );
  });

  it("rejects zero price, over-limit price and invalid quantity", () => {
    expectDomainError(
      createCartItem({
        id: "zero",
        unitPriceMinor: money(0),
        quantity: 1,
        priceSource: MANUAL,
        priceConfidence: confirmed(),
        createdAt: START,
      }),
      "invalid-price",
    );

    expectDomainError(
      createCartItem({
        id: "too-expensive",
        unitPriceMinor: money(MAX_MVP_MONEY_MINOR + 1),
        quantity: 1,
        priceSource: MANUAL,
        priceConfidence: confirmed(),
        createdAt: START,
      }),
      "invalid-price",
    );

    for (const quantity of [0, -1, 1.5, 1_000]) {
      expectDomainError(
        createCartItem({
          id: `quantity-${quantity}`,
          unitPriceMinor: money(100),
          quantity,
          priceSource: MANUAL,
          priceConfidence: confirmed(),
          createdAt: START,
        }),
        "invalid-quantity",
      );
    }
  });

  it("rejects an update timestamp earlier than creation", () => {
    expectDomainError(
      createCartItem({
        id: "time-travel",
        unitPriceMinor: money(100),
        quantity: 1,
        priceSource: MANUAL,
        priceConfidence: confirmed(),
        createdAt: LATER,
        updatedAt: START,
      }),
      "invalid-timestamp",
    );
  });
});

describe("derived shopping values", () => {
  it("matches the canonical EUR 50 scenario exactly", () => {
    let trip = createTrip(5_000, 0);

    trip = addItem(
      trip,
      createItem({ id: "one", price: 379 }),
    );
    trip = addItem(
      trip,
      createItem({ id: "two", price: 1_250 }),
    );
    trip = addItem(
      trip,
      createItem({ id: "three", price: 799 }),
    );

    expect(cartTotal(trip)).toBe(2_428);
    expect(remaining(trip)).toBe(2_572);
    expect(safeRemaining(trip)).toBe(2_572);
    expect(nominalOverage(trip)).toBe(0);
    expect(safeOverage(trip)).toBe(0);
    expect(itemCount(trip)).toBe(3);
  });

  it("distinguishes safe-limit overage from nominal over-budget", () => {
    let trip = createTrip(5_000, 200);

    trip = addItem(
      trip,
      createItem({ id: "cart", price: 4_900 }),
    );

    expect(cartTotal(trip)).toBe(4_900);
    expect(remaining(trip)).toBe(100);
    expect(safeRemaining(trip)).toBe(-100);
    expect(nominalOverage(trip)).toBe(0);
    expect(safeOverage(trip)).toBe(100);
  });

  it("keeps nominal over-budget as a valid derived state", () => {
    let trip = createTrip(5_000, 200);

    trip = addItem(
      trip,
      createItem({ id: "over", price: 5_200 }),
    );

    expect(cartTotal(trip)).toBe(5_200);
    expect(remaining(trip)).toBe(-200);
    expect(safeRemaining(trip)).toBe(-400);
    expect(nominalOverage(trip)).toBe(200);
    expect(safeOverage(trip)).toBe(400);
  });

  it("defines item count as total quantity rather than cart-line count", () => {
    let trip = createTrip();

    trip = addItem(
      trip,
      createItem({ id: "apples", price: 125, quantity: 3 }),
    );
    trip = addItem(
      trip,
      createItem({ id: "bread", price: 250, quantity: 2 }),
    );

    expect(trip.items).toHaveLength(2);
    expect(itemCount(trip)).toBe(5);
  });
});

describe("trip timestamps", () => {
  it("reports the latest moment the trip records", () => {
    let trip = createTrip();

    expect(latestTripTimestamp(trip)).toBe(START);

    trip = addItem(
      trip,
      createItem({
        id: "late",
        price: 100,
        createdAt: LATER,
        updatedAt: "2026-09-21T09:07:00.000Z",
      }),
    );
    trip = addItem(trip, createItem({ id: "early", price: 100 }));

    expect(latestTripTimestamp(trip)).toBe("2026-09-21T09:07:00.000Z");

    const completed = unwrap(
      reduceTrip(trip, {
        type: "complete-trip",
        completedAt: unwrap(isoTimestamp("2026-09-21T09:08:00.000Z")),
      }),
    );

    expect(latestTripTimestamp(completed)).toBe("2026-09-21T09:08:00.000Z");
  });

  it("picks the later of two canonical timestamps", () => {
    const start = unwrap(isoTimestamp(START));
    const later = unwrap(isoTimestamp(LATER));

    expect(laterTimestamp(start, later)).toBe(later);
    expect(laterTimestamp(later, start)).toBe(later);
    expect(laterTimestamp(start, start)).toBe(start);
  });

  it("accepts corrections and completion stamped at the latest trip moment", () => {
    const trip = addItem(
      createTrip(),
      createItem({ id: "ahead", price: 100, createdAt: LATER }),
    );
    const floor = latestTripTimestamp(trip);

    const corrected = unwrap(
      reduceTrip(trip, {
        type: "update-item",
        itemId: unwrap(itemId("ahead")),
        patch: { quantity: 2 },
        now: floor,
      }),
    );

    expect(
      reduceTrip(corrected, { type: "complete-trip", completedAt: floor }).ok,
    ).toBe(true);
  });
});

describe("trip contents", () => {
  const shopped = (): ActiveTrip =>
    addItem(
      createTrip(),
      createItem({ id: "milk", price: 379, quantity: 2, label: "Milk" }),
    );

  it("treats a completion as the same shopping as its open copy", () => {
    const open = shopped();
    const completed = unwrap(
      reduceTrip(open, {
        type: "complete-trip",
        completedAt: time(FINISH),
      }),
    );
    const reconciled = unwrap(
      reduceTrip(completed, {
        type: "set-actual-checkout",
        actualCheckoutMinor: money(800),
      }),
    );

    expect(sameTripContents(open, completed)).toBe(true);
    expect(sameTripContents(completed, open)).toBe(true);
    expect(sameTripContents(open, reconciled)).toBe(true);
  });

  it("tells apart every edit the shopper can make", () => {
    const open = shopped();
    const edit = (patch: EditableItemPatch): ActiveTrip =>
      expectActive(
        unwrap(
          reduceTrip(open, {
            type: "update-item",
            itemId: id("milk"),
            patch,
            now: time(START),
          }),
        ),
      );
    const variants: readonly ShoppingTrip[] = [
      edit({ quantity: 3 }),
      edit({ unitPriceMinor: money(380) }),
      edit({ label: null }),
      edit({ label: "Oat milk" }),
      edit({ priceSource: { kind: "shelf-scan" } }),
      edit({ priceConfidence: { kind: "estimated" } }),
      expectActive(
        unwrap(reduceTrip(open, { type: "remove-item", itemId: id("milk") })),
      ),
      addItem(open, createItem({ id: "bread", price: 250 })),
      expectActive(
        unwrap(reduceTrip(open, { type: "set-budget", budgetMinor: money(6_000) })),
      ),
      expectActive(
        unwrap(
          reduceTrip(open, { type: "set-buffer", safetyBufferMinor: money(100) }),
        ),
      ),
      { ...open, id: unwrap(tripId("trip-2")) },
      { ...open, startedAt: time(LATER) },
    ];

    for (const variant of variants) {
      expect(sameTripContents(open, variant)).toBe(false);
      expect(sameTripContents(variant, open)).toBe(false);
    }
  });

  it("treats an edit that was reverted as the same shopping", () => {
    const open = shopped();
    const reedit = (trip: ActiveTrip, quantity: number, now: string) =>
      expectActive(
        unwrap(
          reduceTrip(trip, {
            type: "update-item",
            itemId: id("milk"),
            patch: {
              quantity,
              priceConfidence: { kind: "confirmed", confirmedAt: time(now) },
            },
            now: time(now),
          }),
        ),
      );
    const reverted = reedit(reedit(open, 3, LATER), 2, FINISH);

    expect(reverted.items[0]?.updatedAt).toBe(FINISH);
    expect(sameTripContents(open, reverted)).toBe(true);
    expect(sameTripContents(open, reedit(open, 3, LATER))).toBe(false);
  });

  it("ignores an optional field that is present but undefined", () => {
    const open = shopped();
    const [item] = open.items;

    if (item === undefined) {
      throw new Error("Expected an item");
    }

    const loose = {
      ...open,
      items: [
        {
          ...item,
          priceSource: { kind: "shelf-scan", captureId: undefined },
        },
      ],
    } as unknown as ActiveTrip;
    const strict = {
      ...open,
      items: [{ ...item, priceSource: { kind: "shelf-scan" } }],
    } as ActiveTrip;

    expect(sameTripContents(loose, strict)).toBe(true);
    expect(sameTripContents(strict, loose)).toBe(true);
  });
});

describe("add projection", () => {
  it("previews a safety-buffer crossing without mutating the trip", () => {
    let trip = createTrip(5_000, 200);
    trip = addItem(
      trip,
      createItem({ id: "existing", price: 4_700 }),
    );

    const before = trip;

    const projection = unwrap(
      projectAddItem(trip, {
        unitPriceMinor: money(200),
        quantity: 1,
      }),
    );

    expect(projection).toEqual({
      lineTotalMinor: 200,
      cartTotalMinor: 4_900,
      remainingMinor: 100,
      safeRemainingMinor: -100,
      crossesSafeLimit: true,
      crossesNominalBudget: false,
      nominalOverageMinor: 0,
      safetyBufferUseMinor: 100,
    });
    expect(trip).toBe(before);
    expect(cartTotal(trip)).toBe(4_700);
  });

  it("attributes only this line's share of the safety buffer when the cart is already in reserve", () => {
    let trip = createTrip(5_000, 500);
    trip = addItem(
      trip,
      createItem({ id: "existing", price: 4_600 }),
    );

    const projection = unwrap(
      projectAddItem(trip, {
        unitPriceMinor: money(200),
        quantity: 1,
      }),
    );

    expect(projection.safeRemainingMinor).toBe(-300);
    expect(projection.safetyBufferUseMinor).toBe(200);
  });

  it("never attributes more buffer than the line adds, whatever the cart already holds", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 20 }),
        (budgetInput, bufferInput, existingPrice, price, quantity) => {
          const budget = Math.max(budgetInput, 1);
          const buffer = Math.min(bufferInput, budget);
          const trip = addItem(
            createTrip(budget, buffer),
            createItem({ id: "existing", price: existingPrice }),
          );
          const projection = unwrap(
            projectAddItem(trip, { unitPriceMinor: money(price), quantity }),
          );
          const committed = addItem(
            trip,
            createItem({ id: "projected", price, quantity }),
          );
          const bufferUsed = (value: ShoppingTrip): number =>
            Math.min(safeOverage(value), buffer);

          expect(projection.safetyBufferUseMinor).toBe(
            bufferUsed(committed) - bufferUsed(trip),
          );
          expect(projection.safetyBufferUseMinor).toBeLessThanOrEqual(
            projection.lineTotalMinor,
          );
        },
      ),
      { numRuns: 1_500 },
    );
  });

  it("counts only the reserve band when a line also crosses the nominal budget", () => {
    let trip = createTrip(5_000, 500);
    trip = addItem(
      trip,
      createItem({ id: "existing", price: 4_900 }),
    );

    const projection = unwrap(
      projectAddItem(trip, {
        unitPriceMinor: money(300),
        quantity: 1,
      }),
    );

    expect(projection.crossesNominalBudget).toBe(true);
    expect(projection.nominalOverageMinor).toBe(200);
    expect(projection.safetyBufferUseMinor).toBe(100);
  });

  it("previews nominal overage exactly", () => {
    let trip = createTrip(5_000, 0);
    trip = addItem(
      trip,
      createItem({ id: "existing", price: 4_800 }),
    );

    const projection = unwrap(
      projectAddItem(trip, {
        unitPriceMinor: money(400),
        quantity: 1,
      }),
    );

    expect(projection.cartTotalMinor).toBe(5_200);
    expect(projection.remainingMinor).toBe(-200);
    expect(projection.crossesNominalBudget).toBe(true);
    expect(projection.nominalOverageMinor).toBe(200);
  });

  it("validates pending price, quantity and label before projection", () => {
    const trip = createTrip();

    expectDomainError(
      projectAddItem(trip, {
        unitPriceMinor: money(0),
        quantity: 1,
      }),
      "invalid-price",
    );

    expectDomainError(
      projectAddItem(trip, {
        unitPriceMinor: money(100),
        quantity: 0,
      }),
      "invalid-quantity",
    );

    expectDomainError(
      projectAddItem(trip, {
        unitPriceMinor: money(100),
        quantity: 1,
        label: "x".repeat(MAX_ITEM_LABEL_CODE_POINTS + 1),
      }),
      "invalid-label",
    );
  });
});

describe("trip reducer", () => {
  it("adds and removes items immutably", () => {
    const initial = createTrip();
    const item = createItem({ id: "item-1", price: 379 });

    const added = addItem(initial, item);

    expect(initial.items).toHaveLength(0);
    expect(added.items).toHaveLength(1);
    expect(cartTotal(added)).toBe(379);

    const removed = expectActive(
      unwrap(
        reduceTrip(added, {
          type: "remove-item",
          itemId: item.id,
        }),
      ),
    );

    expect(removed.items).toHaveLength(0);
    expect(cartTotal(removed)).toBe(0);
    expect(added.items).toHaveLength(1);
  });

  it("rejects duplicate item IDs", () => {
    const item = createItem({ id: "same-id", price: 100 });
    const trip = addItem(createTrip(), item);

    expectDomainError(
      reduceTrip(trip, {
        type: "add-item",
        item: createItem({ id: "same-id", price: 200 }),
      }),
      "duplicate-item-id",
    );
  });

  it("returns item-not-found for edit and removal misses", () => {
    const trip = createTrip();
    const missing = id("missing");

    expectDomainError(
      reduceTrip(trip, {
        type: "remove-item",
        itemId: missing,
      }),
      "item-not-found",
    );

    expectDomainError(
      reduceTrip(trip, {
        type: "update-item",
        itemId: missing,
        patch: { quantity: 2 },
        now: time(LATER),
      }),
      "item-not-found",
    );
  });

  it("edits price and quantity without changing provenance implicitly", () => {
    const remembered: PriceConfidence = {
      kind: "remembered",
      observedAt: time("2026-09-10T09:00:00.000Z"),
    };
    let trip = createTrip();
    const item = createItem({
      id: "remembered",
      price: 139,
      confidence: remembered,
    });
    trip = addItem(trip, item);

    const edited = expectActive(
      unwrap(
        reduceTrip(trip, {
          type: "update-item",
          itemId: item.id,
          patch: {
            unitPriceMinor: money(149),
            quantity: 2,
          },
          now: time(LATER),
        }),
      ),
    );

    expect(edited.items[0]?.unitPriceMinor).toBe(149);
    expect(edited.items[0]?.quantity).toBe(2);
    expect(edited.items[0]?.priceSource).toEqual(MANUAL);
    expect(edited.items[0]?.priceConfidence).toEqual(remembered);
    expect(cartTotal(edited)).toBe(298);
  });

  it("preserves edited price and quantity when label is removed in the same command", () => {
    let trip = createTrip();
    const item = createItem({
      id: "combined-edit",
      price: 890,
      quantity: 1,
      label: "Old label",
    });
    trip = addItem(trip, item);

    const edited = expectActive(
      unwrap(
        reduceTrip(trip, {
          type: "update-item",
          itemId: item.id,
          patch: {
            unitPriceMinor: money(690),
            quantity: 3,
            label: null,
          },
          now: time(LATER),
        }),
      ),
    );

    const updated = edited.items[0];

    expect(updated?.unitPriceMinor).toBe(690);
    expect(updated?.quantity).toBe(3);
    expect(updated && "label" in updated).toBe(false);
    expect(cartTotal(edited)).toBe(2_070);
  });

  it("rejects backwards edit timestamps", () => {
    let trip = createTrip();
    const item = createItem({
      id: "timestamped",
      price: 100,
      createdAt: LATER,
    });
    trip = addItem(trip, item);

    expectDomainError(
      reduceTrip(trip, {
        type: "update-item",
        itemId: item.id,
        patch: { quantity: 2 },
        now: time(START),
      }),
      "invalid-timestamp",
    );
  });

  it("allows budget below cart total but not below the current safety buffer", () => {
    let trip = createTrip(5_000, 200);
    trip = addItem(
      trip,
      createItem({ id: "large-cart", price: 4_500 }),
    );

    const lowerBudget = expectActive(
      unwrap(
        reduceTrip(trip, {
          type: "set-budget",
          budgetMinor: money(4_000),
        }),
      ),
    );

    expect(lowerBudget.budgetMinor).toBe(4_000);
    expect(remaining(lowerBudget)).toBe(-500);

    expectDomainError(
      reduceTrip(lowerBudget, {
        type: "set-budget",
        budgetMinor: money(100),
      }),
      "invalid-buffer",
    );
  });

  it("projects a proposed spending plan without mutating canonical trip state", () => {
    let trip = createTrip(5_000, 200);
    trip = addItem(
      trip,
      createItem({ id: "plan-preview-item", price: 4_500 }),
    );

    const projection = unwrap(
      projectSpendingPlan(
        trip,
        money(4_000),
        money(500),
      ),
    );

    expect(projection).toEqual({
      cartTotalMinor: 4_500,
      remainingMinor: -500,
      safeRemainingMinor: -1_000,
      crossesSafeLimit: true,
      crossesNominalBudget: true,
    });
    expect(trip.budgetMinor).toBe(5_000);
    expect(trip.safetyBufferMinor).toBe(200);
  });

  it("updates budget and safety buffer atomically against the final pair", () => {
    const trip = createTrip(5_000, 4_000);

    const updated = expectActive(
      unwrap(
        reduceTrip(trip, {
          type: "set-spending-plan",
          budgetMinor: money(3_000),
          safetyBufferMinor: money(1_000),
        }),
      ),
    );

    expect(updated).toMatchObject({
      budgetMinor: 3_000,
      safetyBufferMinor: 1_000,
    });

    expectDomainError(
      reduceTrip(trip, {
        type: "set-spending-plan",
        budgetMinor: money(3_000),
        safetyBufferMinor: money(3_001),
      }),
      "invalid-buffer",
    );
  });

  it("updates the safety buffer without changing item totals", () => {
    let trip = createTrip(5_000, 0);
    trip = addItem(
      trip,
      createItem({ id: "item", price: 1_000 }),
    );

    const buffered = expectActive(
      unwrap(
        reduceTrip(trip, {
          type: "set-buffer",
          safetyBufferMinor: money(500),
        }),
      ),
    );

    expect(cartTotal(buffered)).toBe(1_000);
    expect(remaining(buffered)).toBe(4_000);
    expect(safeRemaining(buffered)).toBe(3_500);
  });

  it("rejects a safety buffer above budget", () => {
    const trip = createTrip(5_000, 0);

    expectDomainError(
      reduceTrip(trip, {
        type: "set-buffer",
        safetyBufferMinor: money(5_001),
      }),
      "invalid-buffer",
    );
  });
});

describe("restoring stored items", () => {
  it("gives the same trip as adding each item in order", () => {
    const items = [
      createItem({ id: "item-1", price: 379, quantity: 2, label: "Milk" }),
      createItem({ id: "item-2", price: 1_250 }),
      createItem({ id: "item-3", price: 129, quantity: 3 }),
    ];
    const replayed = items.reduce(addItem, createTrip());

    expect(unwrap(restoreTripItems(createTrip(), items))).toEqual(replayed);
  });

  it("rejects what adding the items one by one would reject", () => {
    const first = createItem({ id: "item-1", price: 379 });

    expectDomainError(
      restoreTripItems(createTrip(), [first, createItem({ id: "item-1", price: 100 })]),
      "duplicate-item-id",
    );
    expectDomainError(
      restoreTripItems(addItem(createTrip(), first), [createItem({ id: "item-1", price: 5 })]),
      "duplicate-item-id",
    );
    expectDomainError(
      restoreTripItems(createTrip(), [{ ...first, quantity: 0 }]),
      "invalid-quantity",
    );
  });

  it("restores a long trip in one pass", () => {
    const items = Array.from({ length: 2_000 }, (_, index) =>
      createItem({ id: `item-${index}`, price: 100 + (index % 50) }),
    );
    const restored = unwrap(restoreTripItems(createTrip(), items));

    expect(restored.items).toHaveLength(2_000);
    expect(cartTotal(restored)).toBe(
      items.reduce((total, item) => total + Number(item.unitPriceMinor), 0),
    );
  });
});

describe("trip completion", () => {
  it("completes an active trip without adding derived totals to canonical state", () => {
    let trip = createTrip(5_000, 200);
    trip = addItem(
      trip,
      createItem({
        id: "item",
        price: 1_250,
        updatedAt: LATER,
      }),
    );

    const completed = unwrap(
      reduceTrip(trip, {
        type: "complete-trip",
        completedAt: time(FINISH),
      }),
    );

    expect(completed.status).toBe("completed");

    if (completed.status !== "completed") {
      throw new Error("Expected completed trip");
    }

    expect(completed.completedAt).toBe(FINISH);
    expect("cartTotalMinor" in completed).toBe(false);
    expect("remainingMinor" in completed).toBe(false);
    expect(cartTotal(completed)).toBe(1_250);
  });

  it("rejects completion earlier than the latest canonical item update", () => {
    let trip = createTrip();
    const late = "2026-09-21T11:00:00.000Z";
    trip = addItem(
      trip,
      createItem({
        id: "late-item",
        price: 100,
        createdAt: late,
      }),
    );

    expectDomainError(
      reduceTrip(trip, {
        type: "complete-trip",
        completedAt: time(FINISH),
      }),
      "invalid-timestamp",
    );
  });

  it("blocks cart mutations after completion", () => {
    const active = createTrip();
    const completed = unwrap(
      reduceTrip(active, {
        type: "complete-trip",
        completedAt: time(FINISH),
      }),
    );

    expectDomainError(
      reduceTrip(completed, {
        type: "set-budget",
        budgetMinor: money(6_000),
      }),
      "trip-not-active",
    );

    expectDomainError(
      reduceTrip(completed, {
        type: "add-item",
        item: createItem({ id: "late-add", price: 100 }),
      }),
      "trip-not-active",
    );
  });

  it("allows optional checkout reconciliation only on completed trips", () => {
    const active = createTrip();

    expectDomainError(
      reduceTrip(active, {
        type: "set-actual-checkout",
        actualCheckoutMinor: money(4_672),
      }),
      "trip-not-completed",
    );

    const completed = unwrap(
      reduceTrip(active, {
        type: "complete-trip",
        completedAt: time(FINISH),
      }),
    );

    const reconciled = unwrap(
      reduceTrip(completed, {
        type: "set-actual-checkout",
        actualCheckoutMinor: money(4_672),
      }),
    );

    expect(reconciled.status).toBe("completed");

    if (reconciled.status !== "completed") {
      throw new Error("Expected completed trip");
    }

    expect(reconciled.actualCheckoutMinor).toBe(4_672);
  });

  it("allows a zero actual checkout total but rejects product-limit overflow", () => {
    const completed = unwrap(
      reduceTrip(createTrip(), {
        type: "complete-trip",
        completedAt: time(FINISH),
      }),
    );

    const zero = unwrap(
      reduceTrip(completed, {
        type: "set-actual-checkout",
        actualCheckoutMinor: money(0),
      }),
    );

    expect(zero.status).toBe("completed");

    if (zero.status === "completed") {
      expect(zero.actualCheckoutMinor).toBe(0);
    }

    expectDomainError(
      reduceTrip(completed, {
        type: "set-actual-checkout",
        actualCheckoutMinor: money(MAX_MVP_MONEY_MINOR + 1),
      }),
      "invalid-price",
    );
  });
});

describe("property-based shopping invariants", () => {
  const lineArbitrary = fc.record({
    price: fc.integer({ min: 1, max: 100_000 }),
    quantity: fc.integer({ min: 1, max: 20 }),
  });

  it("preserves cart, remaining, buffer and item-count algebra", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_MVP_MONEY_MINOR }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.array(lineArbitrary, { maxLength: 30 }),
        (budget, requestedBuffer, lines) => {
          const buffer = Math.min(requestedBuffer, budget);
          let trip = createTrip(budget, buffer);

          lines.forEach((line, index) => {
            trip = addItem(
              trip,
              createItem({
                id: `generated-${index}`,
                price: line.price,
                quantity: line.quantity,
              }),
            );
          });

          const expectedTotal = lines.reduce(
            (sum, line) => sum + line.price * line.quantity,
            0,
          );
          const expectedCount = lines.reduce(
            (sum, line) => sum + line.quantity,
            0,
          );

          expect(cartTotal(trip)).toBe(expectedTotal);
          expect(remaining(trip) + cartTotal(trip)).toBe(budget);
          expect(safeRemaining(trip) + cartTotal(trip)).toBe(
            budget - buffer,
          );
          expect(nominalOverage(trip)).toBe(
            Math.max(expectedTotal - budget, 0),
          );
          expect(safeOverage(trip)).toBe(
            Math.max(expectedTotal - (budget - buffer), 0),
          );
          expect(itemCount(trip)).toBe(expectedCount);
        },
      ),
      { numRuns: 1_500 },
    );
  });

  it("projection equals the totals after committing the same item", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 20 }),
        (budgetInput, bufferInput, price, quantity) => {
          const budget = Math.max(budgetInput, 1);
          const buffer = Math.min(bufferInput, budget);
          const trip = createTrip(budget, buffer);
          const draft = {
            unitPriceMinor: money(price),
            quantity,
          } as const;

          const projection = unwrap(projectAddItem(trip, draft));
          const item = createItem({
            id: "projected",
            price,
            quantity,
          });
          const committed = addItem(trip, item);

          expect(projection.lineTotalMinor).toBe(lineTotal(item));
          expect(projection.cartTotalMinor).toBe(cartTotal(committed));
          expect(projection.remainingMinor).toBe(remaining(committed));
          expect(projection.safeRemainingMinor).toBe(
            safeRemaining(committed),
          );
          expect(projection.nominalOverageMinor).toBe(
            nominalOverage(committed),
          );

          const bufferUsed = (value: ShoppingTrip): number =>
            Math.min(safeOverage(value), buffer);

          expect(projection.safetyBufferUseMinor).toBe(
            bufferUsed(committed) - bufferUsed(trip),
          );
          expect(projection.safetyBufferUseMinor).toBeGreaterThanOrEqual(0);
          expect(projection.safetyBufferUseMinor).toBeLessThanOrEqual(
            projection.lineTotalMinor,
          );
        },
      ),
      { numRuns: 1_500 },
    );
  });

  it("add then remove restores the original canonical totals", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 20 }),
        (budget, price, quantity) => {
          const initial = createTrip(budget, 0);
          const item = createItem({
            id: "reversible",
            price,
            quantity,
          });
          const added = addItem(initial, item);
          const restored = expectActive(
            unwrap(
              reduceTrip(added, {
                type: "remove-item",
                itemId: item.id,
              }),
            ),
          );

          expect(cartTotal(restored)).toBe(cartTotal(initial));
          expect(remaining(restored)).toBe(remaining(initial));
          expect(safeRemaining(restored)).toBe(safeRemaining(initial));
          expect(itemCount(restored)).toBe(itemCount(initial));
          expect(restored.items).toEqual(initial.items);
        },
      ),
      { numRuns: 1_500 },
    );
  });

  it("quantity edits remain exact integer-cent arithmetic", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 999 }),
        (price, quantity) => {
          let trip = createTrip(MAX_MVP_MONEY_MINOR, 0);
          const item = createItem({
            id: "quantity-edit",
            price,
            quantity: 1,
          });
          trip = addItem(trip, item);

          const edited = expectActive(
            unwrap(
              reduceTrip(trip, {
                type: "update-item",
                itemId: item.id,
                patch: { quantity },
                now: time(LATER),
              }),
            ),
          );

          expect(cartTotal(edited)).toBe(price * quantity);
          expect(Number.isSafeInteger(cartTotal(edited))).toBe(true);
        },
      ),
      { numRuns: 1_500 },
    );
  });
});
