import { describe, expect, it } from "vitest";

import { mvpMinorUnits, type Result } from "../src/domain/money";
import {
  createPriceMemoryRecord,
  lastBoughtByProduct,
  priceMemoryIdFor,
  priceMemoryRecordsFromCompletedTrip,
  productIdFromLabel,
  recentPriceMemories,
  upsertPriceMemory,
  type PriceMemoryRecord,
} from "../src/domain/price-memory";
import {
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  reduceTrip,
  storeId,
  type IsoTimestamp,
  type StoreId,
} from "../src/domain/shopping-trip";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected successful Result");
  }

  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));
const store = (value: string): StoreId => unwrap(storeId(value));

const memory = ({
  label,
  price,
  observedAt,
  storeId: storeValue,
}: {
  label: string;
  price: number;
  observedAt: string;
  storeId?: StoreId;
}): PriceMemoryRecord =>
  unwrap(
    createPriceMemoryRecord({
      label,
      unitPriceMinor: money(price),
      observedAt,
      ...(storeValue === undefined
        ? {}
        : { storeId: storeValue }),
      source: { kind: "manual" },
    }),
  );

describe("price memory domain", () => {
  it("normalizes local label identity without losing display casing", () => {
    const result = createPriceMemoryRecord({
      label: "  Valio   Milk 1L  ",
      unitPriceMinor: money(139),
      observedAt: "2026-09-21T09:00:00.000Z",
      source: { kind: "manual" },
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected valid memory");
    }

    expect(result.value).toMatchObject({
      label: "Valio Milk 1L",
      productId: "label:valio milk 1l",
      unitPriceMinor: 139,
      currency: "EUR",
      observedAt: "2026-09-21T09:00:00.000Z",
      source: { kind: "manual" },
    });
    expect(result.value.id).toBe(
      priceMemoryIdFor(result.value.productId),
    );
  });

  it("keeps product identity stable across case and compatibility whitespace", () => {
    expect(unwrap(productIdFromLabel("Milk 1L"))).toBe(
      unwrap(productIdFromLabel("  MILK   1L  ")),
    );
  });

  it("rejects invalid price, timestamp, store and unsupported currency", () => {
    expect(
      createPriceMemoryRecord({
        label: "Milk",
        unitPriceMinor: money(0),
        observedAt: "2026-09-21T09:00:00.000Z",
        source: { kind: "manual" },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid-price" },
    });

    expect(
      createPriceMemoryRecord({
        label: "Milk",
        unitPriceMinor: money(139),
        observedAt: "21.09.2026",
        source: { kind: "manual" },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid-timestamp" },
    });

    expect(
      createPriceMemoryRecord({
        label: "Milk",
        unitPriceMinor: money(139),
        observedAt: "2026-09-21T09:00:00.000Z",
        storeId: "   ",
        source: { kind: "manual" },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid-store-id" },
    });

    expect(
      createPriceMemoryRecord({
        label: "Milk",
        currency: "USD",
        unitPriceMinor: money(139),
        observedAt: "2026-09-21T09:00:00.000Z",
        source: { kind: "manual" },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "unsupported-currency" },
    });
  });

  it("upserts one latest record per product/store context without mutating input", () => {
    const first = memory({
      label: "Milk",
      price: 139,
      observedAt: "2026-09-20T09:00:00.000Z",
    });
    const latest = memory({
      label: "Milk",
      price: 149,
      observedAt: "2026-09-21T09:00:00.000Z",
    });
    const original = [first] as const;

    const updated = upsertPriceMemory(original, latest);

    expect(original).toEqual([first]);
    expect(updated).toEqual([latest]);
    expect(upsertPriceMemory(updated, latest)).toBe(updated);
  });

  it("never lets an older duplicate observation overwrite a newer memory", () => {
    const newer = memory({
      label: "Milk",
      price: 149,
      observedAt: "2026-09-21T10:00:00.000Z",
    });
    const older = memory({
      label: "Milk",
      price: 139,
      observedAt: "2026-09-21T09:00:00.000Z",
    });

    const kept = upsertPriceMemory([newer], older);

    expect(kept).toEqual([newer]);
    expect(kept).not.toContain(older);
  });

  it("lets a fresh observation replace one dated in the future by a fast clock", () => {
    const fromFastClock = memory({
      label: "Milk",
      price: 139,
      observedAt: "2027-04-09T10:00:00.000Z",
    });
    const fresh = memory({
      label: "Milk",
      price: 149,
      observedAt: "2026-09-21T10:00:00.000Z",
    });

    expect(upsertPriceMemory([fromFastClock], fresh)).toEqual([fromFastClock]);
    expect(
      upsertPriceMemory([fromFastClock], fresh, time("2026-09-21T10:00:00.000Z")),
    ).toEqual([fresh]);
  });

  it("keeps the newest same-product observation regardless of incoming order", () => {
    const older = memory({
      label: "Milk",
      price: 139,
      observedAt: "2026-09-21T09:00:00.000Z",
    });
    const newer = memory({
      label: "Milk",
      price: 149,
      observedAt: "2026-09-21T10:00:00.000Z",
    });

    expect(
      upsertPriceMemory(
        upsertPriceMemory([], newer),
        older,
      ),
    ).toEqual([newer]);

    expect(
      upsertPriceMemory(
        upsertPriceMemory([], older),
        newer,
      ),
    ).toEqual([newer]);
  });

  it("prefers exact-store memory, then store-neutral memory, and hides another-store-only prices", () => {
    const prisma = store("store-prisma");
    const kCity = store("store-k-city");
    const neutralMilk = memory({
      label: "Milk",
      price: 139,
      observedAt: "2026-09-21T09:00:00.000Z",
    });
    const prismaMilk = memory({
      label: "Milk",
      price: 129,
      observedAt: "2026-09-20T09:00:00.000Z",
      storeId: prisma,
    });
    const kCityBread = memory({
      label: "Bread",
      price: 249,
      observedAt: "2026-09-21T10:00:00.000Z",
      storeId: kCity,
    });
    const neutralEggs = memory({
      label: "Eggs",
      price: 315,
      observedAt: "2026-09-21T11:00:00.000Z",
    });

    const recent = recentPriceMemories(
      [neutralMilk, prismaMilk, kCityBread, neutralEggs],
      { storeId: prisma, limit: 4 },
    );

    expect(recent.map((record) => record.label)).toEqual([
      "Eggs",
      "Milk",
    ]);
    expect(recent.find((record) => record.label === "Milk")).toBe(
      prismaMilk,
    );
  });

  it("uses the newest observation per product when no store context is known", () => {
    const old = memory({
      label: "Milk",
      price: 139,
      observedAt: "2026-09-20T09:00:00.000Z",
    });
    const latest = memory({
      label: "Milk",
      price: 149,
      observedAt: "2026-09-21T09:00:00.000Z",
      storeId: store("store-prisma"),
    });
    const bread = memory({
      label: "Bread",
      price: 249,
      observedAt: "2026-09-21T08:00:00.000Z",
    });

    expect(recentPriceMemories([old, latest, bread], { limit: 2 })).toEqual([
      latest,
      bread,
    ]);
  });

  it("knows when each named item was last bought, whatever priced it", () => {
    const tripOn = (id: string, completedAt: string, labels: readonly (string | undefined)[]) => {
      let trip = unwrap(
        createActiveTrip({ id, budgetMinor: money(5_000), startedAt: completedAt }),
      );

      labels.forEach((label, index) => {
        const item = unwrap(
          createCartItem({
            id: `${id}-${index}`,
            unitPriceMinor: money(100),
            quantity: 1,
            ...(label === undefined ? {} : { label }),
            priceSource: { kind: "price-memory", memoryId: "memory:any:*" },
            priceConfidence: {
              kind: "remembered",
              observedAt: time("2026-08-01T08:00:00.000Z"),
            },
            createdAt: completedAt,
          }),
        );
        const next = unwrap(reduceTrip(trip, { type: "add-item", item }));

        if (next.status !== "active") {
          throw new Error("Expected active trip");
        }

        trip = next;
      });

      const completed = unwrap(
        reduceTrip(trip, { type: "complete-trip", completedAt: time(completedAt) }),
      );

      if (completed.status !== "completed") {
        throw new Error("Expected completed trip");
      }

      return completed;
    };
    const lastBought = lastBoughtByProduct([
      tripOn("later", "2026-09-20T08:00:00.000Z", ["Milk  1L"]),
      tripOn("earlier", "2026-09-13T08:00:00.000Z", ["milk 1l", "Bread", undefined]),
    ]);
    const milk = unwrap(productIdFromLabel("Milk 1L"));
    const bread = unwrap(productIdFromLabel("Bread"));

    expect(lastBought.get(milk)).toBe(Date.parse("2026-09-20T08:00:00.000Z"));
    expect(lastBought.get(bread)).toBe(Date.parse("2026-09-13T08:00:00.000Z"));
    expect(lastBought.size).toBe(2);
    expect(
      recentPriceMemories(
        [
          memory({ label: "Bread", price: 249, observedAt: "2026-09-15T08:00:00.000Z" }),
          memory({ label: "Milk 1L", price: 139, observedAt: "2026-08-01T08:00:00.000Z" }),
        ],
        { lastBoughtAt: lastBought },
      ).map((record) => record.label),
    ).toEqual(["Milk 1L", "Bread"]);
  });

  it("derives memories only from named confirmed observations in a completed trip", () => {
    const base = unwrap(
      createActiveTrip({
        id: "memory-completed-trip",
        budgetMinor: money(5_000),
        startedAt: "2026-09-20T07:00:00.000Z",
      }),
    );
    const confirmedMilk = unwrap(
      createCartItem({
        id: "confirmed-milk",
        unitPriceMinor: money(139),
        quantity: 1,
        label: "Milk 1L",
        priceSource: { kind: "manual" },
        priceConfidence: {
          kind: "confirmed",
          confirmedAt: time("2026-09-20T08:00:00.000Z"),
        },
        createdAt: "2026-09-20T08:00:00.000Z",
      }),
    );
    const rememberedBread = unwrap(
      createCartItem({
        id: "remembered-bread",
        unitPriceMinor: money(249),
        quantity: 1,
        label: "Bread",
        priceSource: {
          kind: "price-memory",
          memoryId: "memory-bread",
        },
        priceConfidence: {
          kind: "remembered",
          observedAt: time("2026-09-18T08:00:00.000Z"),
        },
        createdAt: "2026-09-20T08:05:00.000Z",
      }),
    );
    const unnamed = unwrap(
      createCartItem({
        id: "unnamed",
        unitPriceMinor: money(315),
        quantity: 1,
        priceSource: { kind: "manual" },
        priceConfidence: {
          kind: "confirmed",
          confirmedAt: time("2026-09-20T08:10:00.000Z"),
        },
        createdAt: "2026-09-20T08:10:00.000Z",
      }),
    );

    let active = base;

    for (const item of [confirmedMilk, rememberedBread, unnamed]) {
      const next = unwrap(
        reduceTrip(active, {
          type: "add-item",
          item,
        }),
      );

      if (next.status !== "active") {
        throw new Error("Expected active trip");
      }

      active = next;
    }

    const completed = unwrap(
      reduceTrip(active, {
        type: "complete-trip",
        completedAt: time("2026-09-20T09:00:00.000Z"),
      }),
    );

    if (completed.status !== "completed") {
      throw new Error("Expected completed trip");
    }

    expect(priceMemoryRecordsFromCompletedTrip(completed)).toEqual([
      expect.objectContaining({
        label: "Milk 1L",
        unitPriceMinor: 139,
        observedAt: "2026-09-20T08:00:00.000Z",
        source: { kind: "manual" },
      }),
    ]);
  });
});
