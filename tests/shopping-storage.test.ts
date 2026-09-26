import { describe, expect, it } from "vitest";

import {
  MAX_MVP_MONEY_MINOR,
  mvpMinorUnits,
  type MinorUnits,
  type Result,
} from "../src/domain/money";
import {
  cartTotal,
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  itemId,
  reduceTrip,
  remaining,
  safeRemaining,
  type ActiveTrip,
  type CompletedTrip,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import {
  ACTIVE_TRIP_STORAGE_KEY,
  CURRENT_ACTIVE_TRIP_SCHEMA_VERSION,
  CURRENT_HISTORY_SCHEMA_VERSION,
  HISTORY_STORAGE_KEY,
  HISTORICAL_NON_SHOPPING_STORAGE_KEYS,
} from "../src/infrastructure/storage/shopping-storage-schema";
import {
  bootstrapShoppingPersistence,
  clearActiveTrip,
  completeTripPersistence,
  decodeActiveTripSnapshot,
  decodeHistorySnapshot,
  encodeActiveTripSnapshot,
  encodeHistorySnapshot,
  restoreActiveTrip,
  restoreHistory,
  retireHistoricalNonShoppingKeys,
  updateCompletedTripPersistence,
  writeActiveTrip,
  type StorageLike,
} from "../src/infrastructure/storage/shopping-storage";

const START = "2026-09-21T09:00:00.000Z";
const ADD_TIME = "2026-09-21T09:05:00.000Z";
const SAVE_TIME = "2026-09-21T09:06:00.000Z";
const COMPLETE_TIME = "2026-09-21T09:10:00.000Z";
const RECONCILE_TIME = "2026-09-21T09:12:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected successful Result");
  }

  return result.value;
};

const money = (value: number): MinorUnits => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));

const createTrip = (): ActiveTrip => {
  const base = unwrap(
    createActiveTrip({
      id: "trip-1",
      currency: "EUR",
      budgetMinor: money(5_000),
      safetyBufferMinor: money(200),
      startedAt: START,
    }),
  );

  const item = unwrap(
    createCartItem({
      id: "item-1",
      unitPriceMinor: money(379),
      quantity: 2,
      label: "Milk",
      priceSource: { kind: "manual" },
      priceConfidence: {
        kind: "confirmed",
        confirmedAt: time(ADD_TIME),
      },
      createdAt: ADD_TIME,
      updatedAt: ADD_TIME,
    }),
  );

  const next = unwrap(
    reduceTrip(base, {
      type: "add-item",
      item,
    }),
  );

  if (next.status !== "active") {
    throw new Error("Expected active trip");
  }

  return next;
};

const createCompletedTrip = (
  actualCheckoutMinor?: number,
): CompletedTrip => {
  const completed = unwrap(
    reduceTrip(createTrip(), {
      type: "complete-trip",
      completedAt: time(COMPLETE_TIME),
    }),
  );

  if (completed.status !== "completed") {
    throw new Error("Expected completed trip");
  }

  if (actualCheckoutMinor === undefined) {
    return completed;
  }

  const reconciled = unwrap(
    reduceTrip(completed, {
      type: "set-actual-checkout",
      actualCheckoutMinor: money(actualCheckoutMinor),
    }),
  );

  if (reconciled.status !== "completed") {
    throw new Error("Expected reconciled completed trip");
  }

  return reconciled;
};

interface MemoryStorageOptions {
  readonly failGet?: boolean;
  readonly failSet?: boolean;
  readonly failSetKeys?: readonly string[];
  readonly failRemoveKeys?: readonly string[];
}

const createStorage = (
  entries: Record<string, string> = {},
  options: MemoryStorageOptions = {},
): StorageLike & {
  readonly values: Map<string, string>;
  readonly writes: Array<{ readonly key: string; readonly value: string }>;
  readonly removals: string[];
  readonly events: readonly string[];
} => {
  const values = new Map(Object.entries(entries));
  const writes: Array<{ key: string; value: string }> = [];
  const removals: string[] = [];
  const events: string[] = [];
  const failedSetKeys = new Set(options.failSetKeys ?? []);
  const failedRemoveKeys = new Set(options.failRemoveKeys ?? []);

  return {
    getItem(key) {
      if (options.failGet) {
        throw new Error("read blocked");
      }

      return values.get(key) ?? null;
    },
    setItem(key, value) {
      events.push(`set:${key}`);

      if (options.failSet || failedSetKeys.has(key)) {
        throw new Error("write blocked");
      }

      writes.push({ key, value });
      values.set(key, value);
    },
    removeItem(key) {
      events.push(`remove:${key}`);
      removals.push(key);

      if (failedRemoveKeys.has(key)) {
        throw new Error("remove blocked");
      }

      values.delete(key);
    },
    values,
    writes,
    removals,
    events,
  };
};

const validEnvelope = (): Record<string, unknown> => ({
  schemaVersion: CURRENT_ACTIVE_TRIP_SCHEMA_VERSION,
  savedAt: SAVE_TIME,
  data: {
    id: "trip-1",
    status: "active",
    currency: "EUR",
    budgetMinor: 5_000,
    safetyBufferMinor: 200,
    startedAt: START,
    items: [
      {
        id: "item-1",
        unitPriceMinor: 379,
        quantity: 2,
        label: "Milk",
        priceSource: { kind: "manual" },
        priceConfidence: {
          kind: "confirmed",
          confirmedAt: ADD_TIME,
        },
        createdAt: ADD_TIME,
        updatedAt: ADD_TIME,
      },
    ],
  },
});

const decodeIssue = (value: unknown) => {
  const result = decodeActiveTripSnapshot(JSON.stringify(value));

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected decode failure");
  }

  return result.issue;
};

describe("shopping storage codec", () => {
  it("encodes a canonical v1 envelope without derived totals", () => {
    const trip = createTrip();
    const encoded = encodeActiveTripSnapshot(trip, SAVE_TIME);

    expect(encoded.ok).toBe(true);

    if (!encoded.ok) {
      throw new Error("Expected encoded snapshot");
    }

    const parsed = JSON.parse(encoded.raw) as Record<string, unknown>;
    const data = parsed.data as Record<string, unknown>;

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.savedAt).toBe(SAVE_TIME);
    expect(data.status).toBe("active");
    expect(data.budgetMinor).toBe(5_000);
    expect(data.safetyBufferMinor).toBe(200);
    expect(data.items).toHaveLength(1);

    for (const forbidden of [
      "cartTotal",
      "cartTotalMinor",
      "remaining",
      "remainingMinor",
      "safeRemaining",
      "safeRemainingMinor",
      "overBudget",
      "progress",
    ]) {
      expect(forbidden in data).toBe(false);
    }
  });

  it("round-trips exact canonical domain state", () => {
    const trip = createTrip();
    const encoded = encodeActiveTripSnapshot(trip, SAVE_TIME);

    expect(encoded.ok).toBe(true);

    if (!encoded.ok) {
      throw new Error("Expected encoded snapshot");
    }

    const decoded = decodeActiveTripSnapshot(encoded.raw);

    expect(decoded.ok).toBe(true);

    if (!decoded.ok) {
      throw new Error("Expected decoded snapshot");
    }

    expect(decoded.trip).toEqual(trip);
    expect(decoded.savedAt).toBe(SAVE_TIME);
    expect(cartTotal(decoded.trip)).toBe(758);
    expect(remaining(decoded.trip)).toBe(4_242);
    expect(safeRemaining(decoded.trip)).toBe(4_042);
  });

  it("rejects non-canonical savedAt before serialization", () => {
    const result = encodeActiveTripSnapshot(
      createTrip(),
      "2026-09-21T09:06:00Z",
    );

    expect(result).toEqual({
      ok: false,
      issue: {
        kind: "persistence",
        code: "serialization-failed",
        storageKey: ACTIVE_TRIP_STORAGE_KEY,
      },
    });
  });

  it("rejects malformed JSON distinctly", () => {
    const result = decodeActiveTripSnapshot("{broken-json");

    expect(result).toEqual({
      ok: false,
      issue: {
        kind: "persistence",
        code: "malformed-json",
        storageKey: ACTIVE_TRIP_STORAGE_KEY,
      },
    });
  });

  it("rejects a missing data field as invalid envelope", () => {
    const issue = decodeIssue({
      schemaVersion: 1,
      savedAt: SAVE_TIME,
    });

    expect(issue.code).toBe("invalid-envelope");
  });

  it("rejects extra envelope fields instead of silently accepting them", () => {
    const issue = decodeIssue({
      ...validEnvelope(),
      derivedCache: { remainingMinor: 4_242 },
    });

    expect(issue.code).toBe("invalid-envelope");
  });

  it("protects unsupported future versions", () => {
    const issue = decodeIssue({
      ...validEnvelope(),
      schemaVersion: 99,
    });

    expect(issue).toEqual({
      kind: "persistence",
      code: "unsupported-version",
      storageKey: ACTIVE_TRIP_STORAGE_KEY,
      schemaVersion: 99,
    });
  });

  it("rejects invalid historical schema versions", () => {
    const issue = decodeIssue({
      ...validEnvelope(),
      schemaVersion: 0,
    });

    expect(issue.code).toBe("invalid-envelope");
  });

  it("rejects impossible canonical-looking timestamps through domain validation", () => {
    const envelope = validEnvelope();
    const data = structuredClone(envelope.data) as Record<string, unknown>;
    data.startedAt = "2026-02-31T09:00:00.000Z";

    const issue = decodeIssue({
      ...envelope,
      data,
    });

    expect(issue.code).toBe("invalid-data");
  });

  it("rejects zero and above-limit budgets", () => {
    for (const budgetMinor of [0, MAX_MVP_MONEY_MINOR + 1]) {
      const envelope = validEnvelope();
      const data = structuredClone(envelope.data) as Record<string, unknown>;
      data.budgetMinor = budgetMinor;

      expect(
        decodeIssue({
          ...envelope,
          data,
        }).code,
      ).toBe("invalid-data");
    }
  });

  it("rejects safety buffer above budget", () => {
    const envelope = validEnvelope();
    const data = structuredClone(envelope.data) as Record<string, unknown>;
    data.budgetMinor = 500;
    data.safetyBufferMinor = 501;

    expect(
      decodeIssue({
        ...envelope,
        data,
      }).code,
    ).toBe("invalid-data");
  });

  it("rejects zero and above-limit item prices", () => {
    for (const unitPriceMinor of [0, MAX_MVP_MONEY_MINOR + 1]) {
      const envelope = validEnvelope();
      const data = structuredClone(envelope.data) as {
        items: Array<Record<string, unknown>>;
      };
      const item = data.items[0];

      if (item === undefined) {
        throw new Error("Fixture item missing");
      }

      item.unitPriceMinor = unitPriceMinor;

      expect(
        decodeIssue({
          ...envelope,
          data,
        }).code,
      ).toBe("invalid-data");
    }
  });

  it("rejects zero, fractional and above-limit quantities", () => {
    for (const quantity of [0, 1.5, 1_000]) {
      const envelope = validEnvelope();
      const data = structuredClone(envelope.data) as {
        items: Array<Record<string, unknown>>;
      };
      const item = data.items[0];

      if (item === undefined) {
        throw new Error("Fixture item missing");
      }

      item.quantity = quantity;

      expect(
        decodeIssue({
          ...envelope,
          data,
        }).code,
      ).toBe("invalid-data");
    }
  });

  it("rejects duplicate item ids through domain reconstruction", () => {
    const envelope = validEnvelope();
    const data = structuredClone(envelope.data) as {
      items: Array<Record<string, unknown>>;
    };
    const first = data.items[0];

    if (first === undefined) {
      throw new Error("Fixture item missing");
    }

    data.items.push({
      ...structuredClone(first),
      unitPriceMinor: 199,
    });

    expect(
      decodeIssue({
        ...envelope,
        data,
      }).code,
    ).toBe("invalid-data");
  });

  it("rejects malformed price provenance", () => {
    const envelope = validEnvelope();
    const data = structuredClone(envelope.data) as {
      items: Array<Record<string, unknown>>;
    };
    const item = data.items[0];

    if (item === undefined) {
      throw new Error("Fixture item missing");
    }

    item.priceSource = {
      kind: "price-memory",
      memoryId: "",
    };

    expect(
      decodeIssue({
        ...envelope,
        data,
      }).code,
    ).toBe("invalid-data");
  });

  it("rejects unresolved or unknown price-source kinds", () => {
    const envelope = validEnvelope();
    const data = structuredClone(envelope.data) as {
      items: Array<Record<string, unknown>>;
    };
    const item = data.items[0];

    if (item === undefined) {
      throw new Error("Fixture item missing");
    }

    item.priceSource = {
      kind: "ocr-candidate",
      text: "3.79",
    };

    expect(
      decodeIssue({
        ...envelope,
        data,
      }).code,
    ).toBe("invalid-data");
  });

  it("rejects extra derived fields inside canonical trip data", () => {
    const envelope = validEnvelope();
    const data = structuredClone(envelope.data) as Record<string, unknown>;
    data.remainingMinor = 4_242;

    expect(
      decodeIssue({
        ...envelope,
        data,
      }).code,
    ).toBe("invalid-data");
  });

  it("rejects blank and whitespace-padded labels instead of normalizing storage silently", () => {
    for (const label of ["", " Milk "]) {
      const envelope = validEnvelope();
      const data = structuredClone(envelope.data) as {
        items: Array<Record<string, unknown>>;
      };
      const item = data.items[0];

      if (item === undefined) {
        throw new Error("Fixture item missing");
      }

      item.label = label;

      expect(
        decodeIssue({
          ...envelope,
          data,
        }).code,
      ).toBe("invalid-data");
    }
  });
});

describe("completed trip history persistence", () => {
  it("round-trips full completed trips without persisting derived totals", () => {
    const trip = createCompletedTrip(770);
    const encoded = encodeHistorySnapshot([trip], RECONCILE_TIME);

    expect(encoded.ok).toBe(true);

    if (!encoded.ok) {
      throw new Error("Expected history encoding");
    }

    const parsed = JSON.parse(encoded.raw) as {
      schemaVersion: number;
      data: {
        trips: Array<Record<string, unknown>>;
      };
    };

    expect(parsed.schemaVersion).toBe(CURRENT_HISTORY_SCHEMA_VERSION);
    expect(parsed.data.trips).toHaveLength(1);
    expect(parsed.data.trips[0]).toMatchObject({
      id: "trip-1",
      status: "completed",
      budgetMinor: 5_000,
      safetyBufferMinor: 200,
      completedAt: COMPLETE_TIME,
      actualCheckoutMinor: 770,
    });

    for (const forbidden of [
      "cartTotal",
      "remaining",
      "safeRemaining",
      "checkoutDifference",
      "overBudget",
      "progress",
    ]) {
      expect(forbidden in (parsed.data.trips[0] ?? {})).toBe(false);
    }

    const decoded = decodeHistorySnapshot(encoded.raw);
    expect(decoded.ok).toBe(true);

    if (!decoded.ok) {
      throw new Error("Expected history decoding");
    }

    expect(decoded.invalidEntryCount).toBe(0);
    expect(decoded.trips).toEqual([trip]);
    expect(decoded.savedAt).toBe(RECONCILE_TIME);
  });

  it("reads back a history it just wrote, and still checks any other stored text", () => {
    const trip = createCompletedTrip(770);
    const encoded = encodeHistorySnapshot([trip], RECONCILE_TIME);

    if (!encoded.ok) {
      throw new Error("Expected history encoding");
    }

    const reread = decodeHistorySnapshot(encoded.raw);
    expect(reread).toMatchObject({ ok: true, invalidEntryCount: 0, trips: [trip] });

    const tampered = encoded.raw.replace('"budgetMinor":5000', '"budgetMinor":-1');
    expect(tampered).not.toBe(encoded.raw);
    expect(decodeHistorySnapshot(tampered)).toMatchObject({
      ok: true,
      trips: [],
      invalidEntryCount: 1,
    });
    expect(decodeHistorySnapshot(encoded.raw)).toMatchObject({ ok: true, trips: [trip] });
  });

  it("refuses to write a trip whose stored form would not read back", () => {
    const valid = createCompletedTrip(770);
    const broken = { ...valid, id: "trip-2", budgetMinor: -1 } as unknown as typeof valid;

    expect(encodeHistorySnapshot([valid, broken], RECONCILE_TIME)).toMatchObject({
      ok: false,
      issue: { code: "invalid-data" },
    });
  });

  it("quarantines an invalid individual history entry without losing valid trips", () => {
    const encoded = encodeHistorySnapshot(
      [createCompletedTrip()],
      RECONCILE_TIME,
    );

    if (!encoded.ok) {
      throw new Error("Expected history encoding");
    }

    const envelope = JSON.parse(encoded.raw) as {
      data: {
        trips: Array<Record<string, unknown>>;
      };
    };
    envelope.data.trips.push({
      ...(structuredClone(envelope.data.trips[0]) as Record<string, unknown>),
      id: "broken-trip",
      completedAt: "not-a-timestamp",
    });

    const raw = JSON.stringify(envelope);
    const decoded = decodeHistorySnapshot(raw);

    expect(decoded.ok).toBe(true);

    if (!decoded.ok) {
      throw new Error("Expected partial history decoding");
    }

    expect(decoded.trips).toHaveLength(1);
    expect(decoded.trips[0]?.id).toBe("trip-1");
    expect(decoded.invalidEntryCount).toBe(1);

    const restored = restoreHistory(
      createStorage({ [HISTORY_STORAGE_KEY]: raw }),
    );

    expect(restored.health).toBe("degraded");
    expect(restored.trips).toHaveLength(1);

    if (restored.health !== "degraded") {
      throw new Error("Expected degraded partial history");
    }

    expect(restored.issue).toEqual({
      kind: "persistence",
      code: "invalid-history-entry",
      storageKey: HISTORY_STORAGE_KEY,
    });
    expect(restored.raw).toBe(raw);
  });

  it("writes completed history before clearing the active trip", () => {
    const active = encodeActiveTripSnapshot(createTrip(), SAVE_TIME);

    if (!active.ok) {
      throw new Error("Expected active encoding");
    }

    const storage = createStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: active.raw,
    });
    const completed = createCompletedTrip();

    expect(
      completeTripPersistence(storage, completed, COMPLETE_TIME),
    ).toEqual({ ok: true, trips: [completed] });

    expect(storage.events).toContain(`set:${HISTORY_STORAGE_KEY}`);
    expect(storage.events).toContain(`remove:${ACTIVE_TRIP_STORAGE_KEY}`);
    expect(
      storage.events.indexOf(`set:${HISTORY_STORAGE_KEY}`),
    ).toBeLessThan(
      storage.events.indexOf(`remove:${ACTIVE_TRIP_STORAGE_KEY}`),
    );
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(false);

    const history = restoreHistory(storage);
    expect(history.health).toBe("healthy");
    expect(history.trips).toEqual([completed]);
  });

  it("never clears the active trip when the history write fails", () => {
    const active = encodeActiveTripSnapshot(createTrip(), SAVE_TIME);

    if (!active.ok) {
      throw new Error("Expected active encoding");
    }

    const storage = createStorage(
      { [ACTIVE_TRIP_STORAGE_KEY]: active.raw },
      { failSetKeys: [HISTORY_STORAGE_KEY] },
    );

    const result = completeTripPersistence(
      storage,
      createCompletedTrip(),
      COMPLETE_TIME,
    );

    expect(result).toEqual({
      ok: false,
      stage: "history-write",
      issue: {
        kind: "persistence",
        code: "write-failed",
        storageKey: HISTORY_STORAGE_KEY,
      },
      historyPersisted: false,
    });
    expect(storage.values.get(ACTIVE_TRIP_STORAGE_KEY)).toBe(active.raw);
    expect(storage.removals).not.toContain(ACTIVE_TRIP_STORAGE_KEY);
  });

  it("keeps both durable records when active clear fails after history succeeds", () => {
    const active = encodeActiveTripSnapshot(createTrip(), SAVE_TIME);

    if (!active.ok) {
      throw new Error("Expected active encoding");
    }

    const storage = createStorage(
      { [ACTIVE_TRIP_STORAGE_KEY]: active.raw },
      { failRemoveKeys: [ACTIVE_TRIP_STORAGE_KEY] },
    );
    const completed = createCompletedTrip();

    const result = completeTripPersistence(
      storage,
      completed,
      COMPLETE_TIME,
    );

    expect(result).toEqual({
      ok: false,
      stage: "active-clear",
      issue: {
        kind: "persistence",
        code: "remove-failed",
        storageKey: ACTIVE_TRIP_STORAGE_KEY,
      },
      historyPersisted: true,
      trips: [completed],
    });
    expect(storage.values.get(ACTIVE_TRIP_STORAGE_KEY)).toBe(active.raw);
    expect(storage.values.has(HISTORY_STORAGE_KEY)).toBe(true);

    const history = restoreHistory(storage);
    expect(history.trips).toEqual([completed]);
  });

  it("reconciles an interrupted completion on startup without duplicating history", () => {
    const active = encodeActiveTripSnapshot(createTrip(), SAVE_TIME);
    const history = encodeHistorySnapshot(
      [createCompletedTrip()],
      COMPLETE_TIME,
    );

    if (!active.ok || !history.ok) {
      throw new Error("Expected completion fixtures");
    }

    const storage = createStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: active.raw,
      [HISTORY_STORAGE_KEY]: history.raw,
    });

    const bootstrap = bootstrapShoppingPersistence(storage);

    expect(bootstrap.health).toBe("healthy");
    expect(bootstrap.activeTrip).toBeNull();
    expect(bootstrap.completedTrips).toHaveLength(1);
    expect(bootstrap.reconciledCompletion).toBe(true);
    expect(bootstrap.completionCleanupPending).toBe(false);
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(false);

    const restoredHistory = restoreHistory(storage);
    expect(restoredHistory.trips).toHaveLength(1);
  });

  it("treats completed history as completion evidence even if stale active cleanup still fails", () => {
    const active = encodeActiveTripSnapshot(createTrip(), SAVE_TIME);
    const history = encodeHistorySnapshot(
      [createCompletedTrip()],
      COMPLETE_TIME,
    );

    if (!active.ok || !history.ok) {
      throw new Error("Expected completion fixtures");
    }

    const storage = createStorage(
      {
        [ACTIVE_TRIP_STORAGE_KEY]: active.raw,
        [HISTORY_STORAGE_KEY]: history.raw,
      },
      { failRemoveKeys: [ACTIVE_TRIP_STORAGE_KEY] },
    );

    const bootstrap = bootstrapShoppingPersistence(storage);

    expect(bootstrap.health).toBe("degraded");
    expect(bootstrap.activeTrip).toBeNull();
    expect(bootstrap.completedTrips).toHaveLength(1);
    expect(bootstrap.reconciledCompletion).toBe(true);
    expect(bootstrap.completionCleanupPending).toBe(true);

    if (bootstrap.health !== "degraded") {
      throw new Error("Expected degraded reconciliation");
    }

    expect(bootstrap.issue.code).toBe("remove-failed");
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(true);
  });

  it("keeps the recorded completion when the same shopping completes again", () => {
    const existing = createCompletedTrip(800);
    const existingHistory = encodeHistorySnapshot(
      [existing],
      COMPLETE_TIME,
    );

    if (!existingHistory.ok) {
      throw new Error("Expected history encoding");
    }

    const repeated = reduceTrip(createTrip(), {
      type: "complete-trip",
      completedAt: time(RECONCILE_TIME),
    });

    if (!repeated.ok || repeated.value.status !== "completed") {
      throw new Error("Expected repeated completed fixture");
    }

    const active = encodeActiveTripSnapshot(createTrip(), SAVE_TIME);

    if (!active.ok) {
      throw new Error("Expected active encoding");
    }

    const storage = createStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: active.raw,
      [HISTORY_STORAGE_KEY]: existingHistory.raw,
    });

    const result = completeTripPersistence(
      storage,
      repeated.value,
      RECONCILE_TIME,
    );

    expect(result).toEqual({ ok: true, trips: [existing] });
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(false);
    expect(restoreHistory(storage).trips).toEqual([existing]);
  });

  it("rejects different shopping under a recorded id instead of overwriting history", () => {
    const existing = createCompletedTrip();
    const existingHistory = encodeHistorySnapshot(
      [existing],
      COMPLETE_TIME,
    );

    if (!existingHistory.ok) {
      throw new Error("Expected history encoding");
    }

    const edited = unwrap(
      reduceTrip(createTrip(), {
        type: "update-item",
        itemId: unwrap(itemId("item-1")),
        patch: { quantity: 3 },
        now: time(RECONCILE_TIME),
      }),
    );
    const conflictingResult = reduceTrip(edited, {
      type: "complete-trip",
      completedAt: time(RECONCILE_TIME),
    });

    if (
      !conflictingResult.ok ||
      conflictingResult.value.status !== "completed"
    ) {
      throw new Error("Expected conflicting completed fixture");
    }

    const active = encodeActiveTripSnapshot(createTrip(), SAVE_TIME);

    if (!active.ok) {
      throw new Error("Expected active encoding");
    }

    const storage = createStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: active.raw,
      [HISTORY_STORAGE_KEY]: existingHistory.raw,
    });

    const result = completeTripPersistence(
      storage,
      conflictingResult.value,
      RECONCILE_TIME,
    );

    expect(result).toMatchObject({
      ok: false,
      stage: "history-write",
      historyPersisted: false,
      issue: {
        code: "history-conflict",
        storageKey: HISTORY_STORAGE_KEY,
      },
    });
    expect(storage.values.get(ACTIVE_TRIP_STORAGE_KEY)).toBe(active.raw);
    expect(restoreHistory(storage).trips).toEqual([existing]);
  });

  it("updates actual checkout inside the existing completed record", () => {
    const initial = createCompletedTrip();
    const initialHistory = encodeHistorySnapshot(
      [initial],
      COMPLETE_TIME,
    );

    if (!initialHistory.ok) {
      throw new Error("Expected history encoding");
    }

    const storage = createStorage({
      [HISTORY_STORAGE_KEY]: initialHistory.raw,
    });
    const reconciled = createCompletedTrip(770);

    expect(
      updateCompletedTripPersistence(
        storage,
        reconciled,
        RECONCILE_TIME,
      ),
    ).toEqual({
      health: "healthy",
      savedAt: RECONCILE_TIME,
    });

    const history = restoreHistory(storage);
    expect(history.trips).toEqual([reconciled]);
  });

  it("preserves unsupported future history without overwriting it", () => {
    const raw = JSON.stringify({
      schemaVersion: CURRENT_HISTORY_SCHEMA_VERSION + 1,
      savedAt: RECONCILE_TIME,
      data: { trips: [] },
    });
    const storage = createStorage({
      [HISTORY_STORAGE_KEY]: raw,
    });

    const restored = restoreHistory(storage);
    expect(restored.health).toBe("degraded");

    if (restored.health !== "degraded") {
      throw new Error("Expected future history rejection");
    }

    expect(restored.issue).toEqual({
      kind: "persistence",
      code: "unsupported-version",
      storageKey: HISTORY_STORAGE_KEY,
      schemaVersion: CURRENT_HISTORY_SCHEMA_VERSION + 1,
    });

    const completion = completeTripPersistence(
      storage,
      createCompletedTrip(),
      COMPLETE_TIME,
    );
    expect(completion.ok).toBe(false);
    expect(storage.values.get(HISTORY_STORAGE_KEY)).toBe(raw);
    expect(storage.writes).toHaveLength(0);
  });
});

describe("active trip persistence", () => {
  it("treats a fresh store as healthy and empty", () => {
    expect(restoreActiveTrip(createStorage())).toEqual({
      health: "healthy",
      status: "empty",
      trip: null,
    });
  });

  it("reports unavailable storage instead of silently pretending empty state", () => {
    expect(restoreActiveTrip(null)).toEqual({
      health: "degraded",
      status: "recovery-required",
      trip: null,
      issue: {
        kind: "persistence",
        code: "storage-unavailable",
        storageKey: ACTIVE_TRIP_STORAGE_KEY,
      },
    });
  });

  it("reports read failure explicitly", () => {
    const storage = createStorage({}, { failGet: true });

    expect(restoreActiveTrip(storage)).toEqual({
      health: "degraded",
      status: "recovery-required",
      trip: null,
      issue: {
        kind: "persistence",
        code: "read-failed",
        storageKey: ACTIVE_TRIP_STORAGE_KEY,
      },
    });
  });

  it("restores a written trip exactly after reload", () => {
    const storage = createStorage();
    const trip = createTrip();

    expect(writeActiveTrip(storage, trip, SAVE_TIME)).toEqual({
      health: "healthy",
      savedAt: SAVE_TIME,
    });

    const restored = restoreActiveTrip(storage);

    expect(restored.health).toBe("healthy");
    expect(restored.status).toBe("restored");

    if (restored.status !== "restored") {
      throw new Error("Expected restored trip");
    }

    expect(restored.trip).toEqual(trip);
    expect(cartTotal(restored.trip)).toBe(758);
    expect(remaining(restored.trip)).toBe(4_242);
  });

  it("stores one complete envelope replacement per write", () => {
    const storage = createStorage();
    const trip = createTrip();

    writeActiveTrip(storage, trip, SAVE_TIME);

    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0]?.key).toBe(ACTIVE_TRIP_STORAGE_KEY);

    const persisted = JSON.parse(
      storage.values.get(ACTIVE_TRIP_STORAGE_KEY) ?? "null",
    );

    expect(persisted).toEqual(validEnvelope());
  });

  it("reports full browser storage apart from other write failures", () => {
    const fullStorage = (name: string): StorageLike => ({
      getItem: () => null,
      setItem: () => {
        throw new DOMException("The quota has been exceeded.", name);
      },
      removeItem: () => {},
    });

    expect(
      writeActiveTrip(fullStorage("QuotaExceededError"), createTrip(), SAVE_TIME),
    ).toEqual({
      health: "degraded",
      issue: {
        kind: "persistence",
        code: "storage-full",
        storageKey: ACTIVE_TRIP_STORAGE_KEY,
      },
    });
    expect(
      completeTripPersistence(
        fullStorage("NS_ERROR_DOM_QUOTA_REACHED"),
        createCompletedTrip(),
        COMPLETE_TIME,
      ),
    ).toMatchObject({
      ok: false,
      stage: "history-write",
      issue: { code: "storage-full", storageKey: HISTORY_STORAGE_KEY },
    });
    expect(
      writeActiveTrip(fullStorage("SecurityError"), createTrip(), SAVE_TIME),
    ).toMatchObject({ issue: { code: "write-failed" } });
  });

  it("preserves the valid in-memory trip when setItem fails", () => {
    const storage = createStorage({}, { failSet: true });
    const trip = createTrip();
    const before = structuredClone(trip);

    expect(writeActiveTrip(storage, trip, SAVE_TIME)).toEqual({
      health: "degraded",
      issue: {
        kind: "persistence",
        code: "write-failed",
        storageKey: ACTIVE_TRIP_STORAGE_KEY,
      },
    });

    expect(trip).toEqual(before);
    expect(cartTotal(trip)).toBe(758);
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(false);
  });

  it("does not overwrite a future-version snapshot during restore/bootstrap", () => {
    const rawFuture = JSON.stringify({
      ...validEnvelope(),
      schemaVersion: 99,
    });
    const storage = createStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: rawFuture,
      [HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0]]: JSON.stringify({
        version: 1,
        value: 9_999,
        step: 25,
      }),
    });

    const bootstrap = bootstrapShoppingPersistence(storage);

    expect(bootstrap.health).toBe("degraded");
    expect(storage.values.get(ACTIVE_TRIP_STORAGE_KEY)).toBe(rawFuture);
    expect(storage.values.has(HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0])).toBe(true);
    expect(storage.writes).toHaveLength(0);
  });

  it("preserves malformed raw shopping data for recovery", () => {
    const raw = "{broken-json";
    const storage = createStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: raw,
    });

    expect(restoreActiveTrip(storage)).toEqual({
      health: "degraded",
      status: "recovery-required",
      trip: null,
      issue: {
        kind: "persistence",
        code: "malformed-json",
        storageKey: ACTIVE_TRIP_STORAGE_KEY,
      },
      raw,
    });
    expect(storage.values.get(ACTIVE_TRIP_STORAGE_KEY)).toBe(raw);
  });

  it("clears the active key explicitly on success", () => {
    const storage = createStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: JSON.stringify(validEnvelope()),
    });

    expect(clearActiveTrip(storage)).toEqual({
      health: "healthy",
    });
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(false);
  });

  it("reports clear failure without claiming healthy persistence", () => {
    const raw = JSON.stringify(validEnvelope());
    const storage = createStorage(
      {
        [ACTIVE_TRIP_STORAGE_KEY]: raw,
      },
      {
        failRemoveKeys: [ACTIVE_TRIP_STORAGE_KEY],
      },
    );

    expect(clearActiveTrip(storage)).toEqual({
      health: "degraded",
      issue: {
        kind: "persistence",
        code: "remove-failed",
        storageKey: ACTIVE_TRIP_STORAGE_KEY,
      },
    });
    expect(storage.values.get(ACTIVE_TRIP_STORAGE_KEY)).toBe(raw);
  });
});

describe("historical non-shopping storage retirement", () => {
  it("removes both historical non-shopping keys without interpreting their values", () => {
    const storage = createStorage({
      [HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0]]: JSON.stringify({
        version: 1,
        value: 5_000,
        step: 25,
      }),
      [HISTORICAL_NON_SHOPPING_STORAGE_KEYS[1]]: "5000",
    });

    const bootstrap = bootstrapShoppingPersistence(storage);

    expect(bootstrap).toEqual({
      health: "healthy",
      activeTrip: null,
      completedTrips: [],
      completionCleanupPending: false,
      legacyKeysRetired: true,
    });
    expect(storage.values.has(HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0])).toBe(false);
    expect(storage.values.has(HISTORICAL_NON_SHOPPING_STORAGE_KEYS[1])).toBe(false);
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(false);
  });

  it("restores valid shopping data and only then retires legacy keys", () => {
    const trip = createTrip();
    const encoded = encodeActiveTripSnapshot(trip, SAVE_TIME);

    if (!encoded.ok) {
      throw new Error("Expected encoded snapshot");
    }

    const storage = createStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: encoded.raw,
      [HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0]]: JSON.stringify({
        version: 1,
        value: 99_999,
        step: 25,
      }),
      [HISTORICAL_NON_SHOPPING_STORAGE_KEYS[1]]: "99999",
    });

    const bootstrap = bootstrapShoppingPersistence(storage);

    expect(bootstrap.health).toBe("healthy");
    expect(bootstrap.activeTrip).toEqual(trip);
    expect(bootstrap.legacyKeysRetired).toBe(true);
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(true);
    expect(storage.values.has(HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0])).toBe(false);
    expect(storage.values.has(HISTORICAL_NON_SHOPPING_STORAGE_KEYS[1])).toBe(false);
  });

  it("does not retire legacy keys when shopping-state validation fails", () => {
    const storage = createStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: "{broken-json",
      [HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0]]: "legacy-one",
      [HISTORICAL_NON_SHOPPING_STORAGE_KEYS[1]]: "legacy-two",
    });

    const bootstrap = bootstrapShoppingPersistence(storage);

    expect(bootstrap.health).toBe("degraded");
    expect(bootstrap.legacyKeysRetired).toBe(false);
    expect(storage.values.get(HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0])).toBe("legacy-one");
    expect(storage.values.get(HISTORICAL_NON_SHOPPING_STORAGE_KEYS[1])).toBe("legacy-two");
  });

  it("reports partial legacy cleanup failure as degraded", () => {
    const failedKey = HISTORICAL_NON_SHOPPING_STORAGE_KEYS[1];
    const storage = createStorage(
      {
        [HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0]]: "legacy-one",
        [failedKey]: "legacy-two",
      },
      {
        failRemoveKeys: [failedKey],
      },
    );

    expect(retireHistoricalNonShoppingKeys(storage)).toEqual({
      health: "degraded",
      retired: false,
      issue: {
        kind: "persistence",
        code: "legacy-retirement-failed",
        storageKey: failedKey,
      },
    });

    expect(storage.values.has(HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0])).toBe(false);
    expect(storage.values.get(failedKey)).toBe("legacy-two");
  });

  it("keeps restored shopping state available if legacy cleanup alone fails", () => {
    const trip = createTrip();
    const encoded = encodeActiveTripSnapshot(trip, SAVE_TIME);

    if (!encoded.ok) {
      throw new Error("Expected encoded snapshot");
    }

    const failedKey = HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0];
    const storage = createStorage(
      {
        [ACTIVE_TRIP_STORAGE_KEY]: encoded.raw,
        [failedKey]: "legacy",
      },
      {
        failRemoveKeys: [failedKey],
      },
    );

    const bootstrap = bootstrapShoppingPersistence(storage);

    expect(bootstrap.health).toBe("degraded");
    expect(bootstrap.activeTrip).toEqual(trip);
    expect(bootstrap.legacyKeysRetired).toBe(false);

    if (bootstrap.health !== "degraded") {
      throw new Error("Expected degraded bootstrap");
    }

    expect(bootstrap.issue.code).toBe("legacy-retirement-failed");
    expect(bootstrap.restoredSavedAt).toBe(SAVE_TIME);
    expect(storage.values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(true);
  });
});
