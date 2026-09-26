import { describe, expect, it } from "vitest";

import { bootstrapBrowserShoppingAppController } from "../src/app/composition-root";
import type {
  Clock,
  IdGenerator,
  ShoppingAppController,
} from "../src/application/shopping-app-controller";
import { mvpMinorUnits, type MinorUnits } from "../src/domain/money";
import { isoTimestamp } from "../src/domain/shopping-trip";
import {
  ACTIVE_TRIP_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
} from "../src/infrastructure/storage/shopping-storage-schema";
import {
  restoreActiveTrip,
  restoreHistory,
  type StorageLike,
} from "../src/infrastructure/storage/shopping-storage";

const money = (value: number): MinorUnits => {
  const result = mvpMinorUnits(value);

  if (!result.ok) {
    throw new Error("Expected valid money");
  }

  return result.value;
};

const clock: Clock = {
  now: () => {
    const result = isoTimestamp("2026-09-26T10:00:00.000Z");

    if (!result.ok) {
      throw new Error("Expected valid timestamp");
    }

    return result.value;
  },
};

const tabIds = (tab: string): IdGenerator => {
  let next = 0;
  return {
    tripId: () => `${tab}-trip-${(next += 1)}`,
    itemId: () => `${tab}-item-${(next += 1)}`,
  };
};

const sharedStorage = (): StorageLike & { values: Map<string, string> } => {
  const values = new Map<string, string>();

  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
};

const openTab = (storage: StorageLike, tab: string): ShoppingAppController =>
  bootstrapBrowserShoppingAppController({ storage, clock, ids: tabIds(tab) });

const storedLabels = (storage: StorageLike): readonly (string | undefined)[] => {
  const restored = restoreActiveTrip(storage);
  return restored.trip?.items.map((item) => item.label) ?? [];
};

describe("two tabs sharing one device store", () => {
  it("does not let an idle tab start a trip over one another tab started", () => {
    const storage = sharedStorage();
    const idle = openTab(storage, "c");
    const shopping = openTab(storage, "a");

    shopping.startTrip({ budgetMinor: money(7_500) });
    shopping.addManualItem({ unitPriceMinor: money(1_000), quantity: 1, label: "Coffee" });
    shopping.addManualItem({ unitPriceMinor: money(555), quantity: 1, label: "Tea" });

    const started = idle.startTrip({ budgetMinor: money(2_500) });

    expect(started).toMatchObject({ ok: false, error: { code: "active-trip-exists" } });
    expect(idle.getSnapshot()).toMatchObject({
      lifecycle: "active",
      activeTrip: { budgetMinor: 7_500 },
    });
    expect(storedLabels(storage)).toEqual(["Coffee", "Tea"]);
  });

  it("keeps items added in both tabs of the same trip", () => {
    const storage = sharedStorage();
    const first = openTab(storage, "a");
    first.startTrip({ budgetMinor: money(5_000) });
    const second = openTab(storage, "b");

    first.addManualItem({ unitPriceMinor: money(250), quantity: 1, label: "Bread" });
    second.addManualItem({ unitPriceMinor: money(320), quantity: 1, label: "Eggs" });

    expect(storedLabels(storage)).toEqual(["Bread", "Eggs"]);
    expect(second.getSnapshot().activeTrip?.items.map((item) => item.label)).toEqual([
      "Bread",
      "Eggs",
    ]);
  });

  it("does not reopen or record twice a trip another tab already finished", () => {
    const storage = sharedStorage();
    const first = openTab(storage, "a");
    first.startTrip({ budgetMinor: money(5_000) });
    first.addManualItem({ unitPriceMinor: money(139), quantity: 1, label: "Milk" });
    const stale = openTab(storage, "b");

    expect(first.completeTrip().ok).toBe(true);

    const added = stale.addManualItem({
      unitPriceMinor: money(450),
      quantity: 1,
      label: "Cheese",
    });

    expect(added).toMatchObject({ ok: false, error: { code: "no-active-trip" } });
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(false);
    expect(restoreHistory(storage).trips).toHaveLength(1);
    expect(stale.getSnapshot()).toMatchObject({ lifecycle: "idle", activeTrip: null });
    expect(stale.getSnapshot().completedTrips).toHaveLength(1);
  });

  it("follows another tab's change on request and ignores a request when nothing changed", () => {
    const storage = sharedStorage();
    const watcher = openTab(storage, "c");
    const shopping = openTab(storage, "a");

    expect(watcher.refreshFromStorage()).toMatchObject({ ok: true, changed: false });

    shopping.startTrip({ budgetMinor: money(3_000) });
    const followed = watcher.refreshFromStorage();

    expect(followed).toMatchObject({ ok: true, changed: true });
    expect(watcher.getSnapshot()).toMatchObject({
      lifecycle: "active",
      activeTrip: { budgetMinor: 3_000 },
    });
    expect(watcher.refreshFromStorage()).toMatchObject({ ok: true, changed: false });
  });

  it("keeps the unsaved view of a tab whose own saves are failing", () => {
    const values = new Map<string, string>();
    let failWrites = false;
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (failWrites && key === ACTIVE_TRIP_STORAGE_KEY) {
          throw new Error("quota");
        }
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    const tab = openTab(storage, "a");
    tab.startTrip({ budgetMinor: money(5_000) });
    failWrites = true;
    tab.addManualItem({ unitPriceMinor: money(250), quantity: 1, label: "Bread" });

    values.set(HISTORY_STORAGE_KEY, "changed elsewhere");

    expect(tab.refreshFromStorage()).toMatchObject({ ok: true, changed: false });
    expect(tab.getSnapshot().activeTrip?.items.map((item) => item.label)).toEqual([
      "Bread",
    ]);
  });

  it("keeps and saves again an open trip whose saved copy was wiped from the device", () => {
    const storage = sharedStorage();
    const tab = openTab(storage, "a");
    tab.startTrip({ budgetMinor: money(5_000) });
    tab.addManualItem({ unitPriceMinor: money(250), quantity: 1, label: "Bread" });

    storage.values.clear();

    expect(tab.refreshFromStorage()).toMatchObject({ ok: true, durability: "persisted" });
    expect(tab.getSnapshot()).toMatchObject({ lifecycle: "active" });
    expect(storedLabels(storage)).toEqual(["Bread"]);
  });

  it("follows another tab that finished the trip instead of saving it again", () => {
    const storage = sharedStorage();
    const first = openTab(storage, "a");
    first.startTrip({ budgetMinor: money(5_000) });
    first.addManualItem({ unitPriceMinor: money(250), quantity: 1, label: "Bread" });
    const second = openTab(storage, "b");

    second.completeTrip();
    second.dismissCompletedSummary();

    first.refreshFromStorage();

    expect(first.getSnapshot()).toMatchObject({ lifecycle: "idle", activeTrip: null });
    expect(restoreActiveTrip(storage).trip).toBeNull();
    expect(restoreHistory(storage).trips).toHaveLength(1);
  });
});

