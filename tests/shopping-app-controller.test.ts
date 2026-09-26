import { describe, expect, it } from "vitest";

import { mvpMinorUnits, type Result } from "../src/domain/money";
import {
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  itemId as parseItemId,
  reduceTrip,
  type ActiveTrip,
  type CompletedTrip,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import {
  createShoppingAppController,
  type ActiveTripBootstrapResult,
  type ActiveTripPersistencePort,
  type ActiveTripSaveResult,
  type Clock,
  type CompletedHistoryReadResult,
  type CompletionSaveResult,
  type HistorySetAsideResult,
  type IdGenerator,
  type PersistenceProblem,
} from "../src/application/shopping-app-controller";

const START = "2026-09-21T09:00:00.000Z";
const NEXT = "2026-09-21T09:05:00.000Z";
const LATER = "2026-09-21T09:10:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected successful Result");
  }

  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));

const createTrip = (
  budgetMinor = 5_000,
  safetyBufferMinor = 200,
): ActiveTrip =>
  unwrap(
    createActiveTrip({
      id: "restored-trip",
      budgetMinor: money(budgetMinor),
      safetyBufferMinor: money(safetyBufferMinor),
      startedAt: START,
    }),
  );

const createCompletedTrip = (
  id: string,
  completedAt: string,
  budgetMinor = 5_000,
  safetyBufferMinor = 0,
): CompletedTrip => {
  const active = unwrap(
    createActiveTrip({
      id,
      budgetMinor: money(budgetMinor),
      safetyBufferMinor: money(safetyBufferMinor),
      startedAt: START,
    }),
  );
  const completed = unwrap(
    reduceTrip(active, {
      type: "complete-trip",
      completedAt: time(completedAt),
    }),
  );

  if (completed.status !== "completed") {
    throw new Error("Expected completed trip");
  }

  return completed;
};

type BootstrapInput = ActiveTripBootstrapResult extends infer T
  ? T extends ActiveTripBootstrapResult
    ? Omit<T, "completedTrips" | "completionCleanupPending"> & {
        readonly completedTrips?: readonly CompletedTrip[];
        readonly completionCleanupPending?: boolean;
      }
    : never
  : never;

const normalizeBootstrap = (
  result: BootstrapInput,
): ActiveTripBootstrapResult => ({
  ...result,
  completedTrips: result.completedTrips ?? [],
  completionCleanupPending:
    result.completionCleanupPending ?? false,
} as ActiveTripBootstrapResult);

interface PersistenceFake extends ActiveTripPersistencePort {
  readonly bootstrapCalls: number;
  readonly saveCalls: readonly {
    trip: ActiveTrip;
    savedAt: IsoTimestamp;
  }[];
  readonly completeCalls: readonly {
    trip: CompletedTrip;
    savedAt: IsoTimestamp;
  }[];
  readonly saveCompletedCalls: readonly {
    trip: CompletedTrip;
    savedAt: IsoTimestamp;
  }[];
  readonly replaceCompletedHistoryCalls: readonly {
    trips: readonly CompletedTrip[];
    savedAt: IsoTimestamp;
  }[];
  readonly clearCompletedActiveCalls: number;
  readonly historySetAsideCalls: readonly IsoTimestamp[];
  readonly activeSetAsideCalls: readonly IsoTimestamp[];
  readonly historyReadCalls: number;
  setBootstrapResult(result: BootstrapInput): void;
  queueHistoryReadResult(result: CompletedHistoryReadResult): void;
  queueHistorySetAsideResult(result: HistorySetAsideResult): void;
  queueActiveSetAsideResult(result: ActiveTripSaveResult): void;
  queueSaveResult(result: ActiveTripSaveResult): void;
  queueCompleteResult(result: CompletionSaveResult): void;
  queueCompletedSaveResult(result: ActiveTripSaveResult): void;
  queueHistoryReplaceResult(result: ActiveTripSaveResult): void;
  queueClearResult(result: ActiveTripSaveResult): void;
}

const createPersistence = (
  initialBootstrap: BootstrapInput = {
    ok: true,
    activeTrip: null,
  },
): PersistenceFake => {
  let bootstrapResult = normalizeBootstrap(initialBootstrap);
  let bootstrapCalls = 0;
  let clearCompletedActiveCalls = 0;
  const saveCalls: Array<{
    trip: ActiveTrip;
    savedAt: IsoTimestamp;
  }> = [];
  const completeCalls: Array<{
    trip: CompletedTrip;
    savedAt: IsoTimestamp;
  }> = [];
  const saveCompletedCalls: Array<{
    trip: CompletedTrip;
    savedAt: IsoTimestamp;
  }> = [];
  const replaceCompletedHistoryCalls: Array<{
    trips: readonly CompletedTrip[];
    savedAt: IsoTimestamp;
  }> = [];
  const saveResults: ActiveTripSaveResult[] = [];
  const completeResults: CompletionSaveResult[] = [];
  const completedSaveResults: ActiveTripSaveResult[] = [];
  const historyReplaceResults: ActiveTripSaveResult[] = [];
  const clearResults: ActiveTripSaveResult[] = [];
  const historyReadResults: CompletedHistoryReadResult[] = [];
  const historySetAsideResults: HistorySetAsideResult[] = [];
  const activeSetAsideResults: ActiveTripSaveResult[] = [];
  const historySetAsideCalls: IsoTimestamp[] = [];
  const activeSetAsideCalls: IsoTimestamp[] = [];
  let historyReadCalls = 0;
  let durableTrips: readonly CompletedTrip[] | null = null;
  const durable = (): readonly CompletedTrip[] =>
    durableTrips ?? bootstrapResult.completedTrips;
  const record = (trip: CompletedTrip): void => {
    durableTrips = [
      ...durable().filter((candidate) => candidate.id !== trip.id),
      trip,
    ];
  };

  return {
    get historySetAsideCalls() {
      return historySetAsideCalls;
    },
    get activeSetAsideCalls() {
      return activeSetAsideCalls;
    },
    get historyReadCalls() {
      return historyReadCalls;
    },
    queueHistoryReadResult(result) {
      historyReadResults.push(result);
    },
    queueHistorySetAsideResult(result) {
      historySetAsideResults.push(result);
    },
    queueActiveSetAsideResult(result) {
      activeSetAsideResults.push(result);
    },
    readCompletedHistory() {
      historyReadCalls += 1;
      return (
        historyReadResults.shift() ?? {
          ok: true,
          completedTrips: durable(),
        }
      );
    },
    setAsideDamagedHistory(setAsideAt) {
      historySetAsideCalls.push(setAsideAt);
      return (
        historySetAsideResults.shift() ?? {
          ok: true,
          completedTrips: bootstrapResult.completedTrips,
        }
      );
    },
    setAsideUnreadableActiveTrip(setAsideAt) {
      activeSetAsideCalls.push(setAsideAt);
      return activeSetAsideResults.shift() ?? { ok: true };
    },
    get bootstrapCalls() {
      return bootstrapCalls;
    },
    get saveCalls() {
      return saveCalls;
    },
    get completeCalls() {
      return completeCalls;
    },
    get saveCompletedCalls() {
      return saveCompletedCalls;
    },
    get replaceCompletedHistoryCalls() {
      return replaceCompletedHistoryCalls;
    },
    get clearCompletedActiveCalls() {
      return clearCompletedActiveCalls;
    },
    setBootstrapResult(result) {
      bootstrapResult = normalizeBootstrap(result);
      durableTrips = null;
    },
    queueSaveResult(result) {
      saveResults.push(result);
    },
    queueCompleteResult(result) {
      completeResults.push(result);
    },
    queueCompletedSaveResult(result) {
      completedSaveResults.push(result);
    },
    queueHistoryReplaceResult(result) {
      historyReplaceResults.push(result);
    },
    queueClearResult(result) {
      clearResults.push(result);
    },
    bootstrap() {
      bootstrapCalls += 1;
      return bootstrapResult;
    },
    save(trip, savedAt) {
      saveCalls.push({ trip, savedAt });

      return (
        saveResults.shift() ?? {
          ok: true,
        }
      );
    },
    complete(trip, savedAt) {
      completeCalls.push({ trip, savedAt });
      const result = completeResults.shift() ?? { ok: true };

      if (result.ok || result.historyPersisted) {
        record(trip);
      }

      return result;
    },
    saveCompleted(trip, savedAt) {
      saveCompletedCalls.push({ trip, savedAt });
      const result = completedSaveResults.shift() ?? { ok: true };

      if (result.ok) {
        record(trip);
      }

      return result;
    },
    replaceCompletedHistory(trips, savedAt) {
      replaceCompletedHistoryCalls.push({ trips, savedAt });
      const result = historyReplaceResults.shift() ?? { ok: true };

      if (result.ok) {
        durableTrips = trips;
      }

      return result;
    },
    clearCompletedActive() {
      clearCompletedActiveCalls += 1;
      return clearResults.shift() ?? { ok: true };
    },
  };
};

const createClock = (...timestamps: string[]): Clock => {
  const values = timestamps.map(time);
  let index = 0;

  return {
    now() {
      const value = values[Math.min(index, values.length - 1)];

      if (value === undefined) {
        throw new Error("Clock has no configured timestamp");
      }

      index += 1;
      return value;
    },
  };
};

const ids: IdGenerator = {
  tripId: () => "trip-generated",
  itemId: () => "item-generated",
};

const writeFailure: PersistenceProblem = {
  code: "write-failed",
  storageKey: "budget-cart:active-trip",
};

const historyWriteFailure: PersistenceProblem = {
  code: "write-failed",
  storageKey: "budget-cart:history",
};

describe("ShoppingAppController snapshot contract", () => {
  it("returns one cached immutable booting snapshot until state changes", () => {
    const controller = createShoppingAppController({
      persistence: createPersistence(),
      clock: createClock(START),
      ids,
    });

    const first = controller.getSnapshot();
    const second = controller.getSnapshot();

    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual({
      lifecycle: "booting",
      activeTrip: null,
      completedSummary: null,
      completedTrips: [],
      completionCleanupPending: false,
      persistence: { status: "healthy" },
      historyIntegrity: { status: "healthy" },
      priceMemories: [],
      priceMemoryPersistence: { status: "healthy" },
      barcodeLinks: [],
      barcodeLinkPersistence: { status: "healthy" },
      undo: null,
      recovery: null,
    });
  });

  it("publishes exactly once when bootstrap resolves to idle", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const before = controller.getSnapshot();
    const after = controller.bootstrap();

    expect(persistence.bootstrapCalls).toBe(1);
    expect(notifications).toBe(1);
    expect(after).not.toBe(before);
    expect(after.lifecycle).toBe("idle");
    expect(after.persistence).toEqual({ status: "healthy" });
    expect(controller.getSnapshot()).toBe(after);
  });

  it("does not reread storage over a live application state", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });

    controller.bootstrap();
    controller.startTrip({
      budgetMinor: money(5_000),
    });

    persistence.setBootstrapResult({
      ok: true,
      activeTrip: createTrip(1_000, 0),
    });

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const before = controller.getSnapshot();
    const after = controller.bootstrap();

    expect(after).toBe(before);
    expect(after.activeTrip?.budgetMinor).toBe(5_000);
    expect(persistence.bootstrapCalls).toBe(1);
    expect(notifications).toBe(0);
  });

  it("can retry bootstrap from recovery without inventing a new path", () => {
    const persistence = createPersistence({
      ok: false,
      activeTrip: null,
      issue: {
        code: "read-failed",
        storageKey: "budget-cart:active-trip",
      },
      recoveryRequired: true,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });

    expect(controller.bootstrap().lifecycle).toBe("recovery");

    const restoredTrip = createTrip();
    persistence.setBootstrapResult({
      ok: true,
      activeTrip: restoredTrip,
    });

    const retried = controller.bootstrap();

    expect(retried.lifecycle).toBe("active");
    expect(retried.activeTrip).toBe(restoredTrip);
    expect(retried.persistence).toEqual({ status: "healthy" });
    expect(persistence.bootstrapCalls).toBe(2);
  });

  it("unsubscribe stops later notifications", () => {
    const controller = createShoppingAppController({
      persistence: createPersistence(),
      clock: createClock(START),
      ids,
    });

    let notifications = 0;
    const unsubscribe = controller.subscribe(() => {
      notifications += 1;
    });

    controller.bootstrap();
    unsubscribe();

    controller.startTrip({
      budgetMinor: money(5_000),
    });

    expect(notifications).toBe(1);
  });
});

describe("ShoppingAppController bootstrap", () => {
  it("restores the exact active trip without reconstructing UI state", () => {
    const restoredTrip = createTrip();
    const controller = createShoppingAppController({
      persistence: createPersistence({
        ok: true,
        activeTrip: restoredTrip,
      }),
      clock: createClock(START),
      ids,
    });

    const state = controller.bootstrap();

    expect(state.lifecycle).toBe("active");
    expect(state.activeTrip).toBe(restoredTrip);
    expect(state.persistence).toEqual({ status: "healthy" });
    expect(state.recovery).toBeNull();
  });

  it("maps corrupt/future storage into recovery without inventing a trip", () => {
    const issue: PersistenceProblem = {
      code: "unsupported-version",
      storageKey: "budget-cart:active-trip",
      schemaVersion: 99,
    };
    const controller = createShoppingAppController({
      persistence: createPersistence({
        ok: false,
        activeTrip: null,
        issue,
        recoveryRequired: true,
        recoveryRaw: '{"schemaVersion":99}',
      }),
      clock: createClock(START),
      ids,
    });

    const state = controller.bootstrap();

    expect(state.lifecycle).toBe("recovery");
    expect(state.activeTrip).toBeNull();
    expect(state.persistence).toEqual({
      status: "degraded",
      issue,
      since: START,
    });
    expect(state.recovery).toEqual({
      issue,
      raw: '{"schemaVersion":99}',
    });
  });

  it("can remain active but degraded when bootstrap cleanup alone failed", () => {
    const restoredTrip = createTrip();
    const issue: PersistenceProblem = {
      code: "legacy-retirement-failed",
      storageKey: "counter",
    };
    const controller = createShoppingAppController({
      persistence: createPersistence({
        ok: false,
        activeTrip: restoredTrip,
        issue,
        recoveryRequired: false,
      }),
      clock: createClock(START),
      ids,
    });

    const state = controller.bootstrap();

    expect(state.lifecycle).toBe("active");
    expect(state.activeTrip).toBe(restoredTrip);
    expect(state.persistence).toEqual({
      status: "degraded",
      issue,
      since: START,
    });
    expect(state.recovery).toBeNull();
  });

  it("can remain idle but degraded when non-recovery bootstrap work failed", () => {
    const issue: PersistenceProblem = {
      code: "legacy-retirement-failed",
      storageKey: "counter",
    };
    const controller = createShoppingAppController({
      persistence: createPersistence({
        ok: false,
        activeTrip: null,
        issue,
        recoveryRequired: false,
      }),
      clock: createClock(START),
      ids,
    });

    const state = controller.bootstrap();

    expect(state.lifecycle).toBe("idle");
    expect(state.activeTrip).toBeNull();
    expect(state.persistence.status).toBe("degraded");
  });
});

describe("ShoppingAppController startTrip", () => {
  it("rejects start before bootstrap without notify or persistence", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const result = controller.startTrip({
      budgetMinor: money(5_000),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "application",
        code: "not-ready",
      },
      state: controller.getSnapshot(),
    });
    expect(persistence.saveCalls).toHaveLength(0);
    expect(notifications).toBe(0);
  });

  it("creates, persists, and publishes one canonical active trip", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const result = controller.startTrip({
      budgetMinor: money(5_000),
      safetyBufferMinor: money(200),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected startTrip success");
    }

    expect(result.changed).toBe(true);
    expect(result.durability).toBe("persisted");
    expect(result.state.lifecycle).toBe("active");
    expect(result.state.activeTrip).toMatchObject({
      id: "trip-generated",
      budgetMinor: 5_000,
      safetyBufferMinor: 200,
      startedAt: START,
    });
    expect(result.state.persistence).toEqual({ status: "healthy" });
    expect(persistence.saveCalls).toHaveLength(1);
    expect(persistence.saveCalls[0]?.trip).toBe(result.state.activeTrip);
    expect(persistence.saveCalls[0]?.savedAt).toBe(START);
    expect(notifications).toBe(1);
  });

  it("keeps the valid in-memory trip and marks degraded when save fails", () => {
    const persistence = createPersistence();
    persistence.queueSaveResult({
      ok: false,
      issue: writeFailure,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    const result = controller.startTrip({
      budgetMinor: money(5_000),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected memory-only start");
    }

    expect(result.durability).toBe("memory-only");
    expect(result.state.lifecycle).toBe("active");
    expect(result.state.activeTrip?.budgetMinor).toBe(5_000);
    expect(result.state.persistence).toEqual({
      status: "degraded",
      issue: writeFailure,
      since: START,
    });
  });

  it("rejects invalid budget without persistence or notification", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const result = controller.startTrip({
      budgetMinor: money(0),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected invalid budget failure");
    }

    expect(result.error).toEqual({
      kind: "domain",
      code: "invalid-budget",
    });
    expect(controller.getSnapshot().lifecycle).toBe("idle");
    expect(persistence.saveCalls).toHaveLength(0);
    expect(notifications).toBe(0);
  });

  it("rejects a second start while a trip is active", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START, NEXT),
      ids,
    });
    controller.bootstrap();
    controller.startTrip({ budgetMinor: money(5_000) });

    const result = controller.startTrip({
      budgetMinor: money(7_500),
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "active-trip-exists",
      },
    });
    expect(persistence.saveCalls).toHaveLength(1);
  });

  it("rejects start while recovery is unresolved", () => {
    const persistence = createPersistence({
      ok: false,
      activeTrip: null,
      issue: {
        code: "malformed-json",
        storageKey: "budget-cart:active-trip",
      },
      recoveryRequired: true,
      recoveryRaw: "{broken",
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    const result = controller.startTrip({
      budgetMinor: money(5_000),
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "recovery-required",
      },
    });
    expect(persistence.saveCalls).toHaveLength(0);
  });
});

describe("ShoppingAppController repeat trip", () => {
  it("starts a fresh empty trip from a completed spending plan and preserves history", () => {
    const source = createCompletedTrip(
      "completed-source",
      NEXT,
      7_500,
      500,
    );
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: [source],
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    const result = controller.startTripFromCompleted(source.id);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected repeat-trip success");
    }

    expect(result.state.lifecycle).toBe("active");
    expect(result.state.activeTrip).toMatchObject({
      id: "trip-generated",
      budgetMinor: 7_500,
      safetyBufferMinor: 500,
      items: [],
      startedAt: LATER,
    });
    expect(result.state.activeTrip?.id).not.toBe(source.id);
    expect(result.state.completedTrips).toEqual([source]);
    expect(result.state.completedSummary).toBeNull();
    expect(persistence.saveCalls).toHaveLength(1);
    expect(persistence.saveCalls[0]?.trip).toBe(result.state.activeTrip);
    expect(persistence.saveCalls[0]?.savedAt).toBe(LATER);
  });

  it("can shop again directly from a healthy completed summary", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 200),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    const finished = controller.completeTrip();
    expect(finished.ok).toBe(true);

    const source = controller.getSnapshot().completedSummary;

    if (source === null) {
      throw new Error("Expected completed summary");
    }

    const repeated = controller.startTripFromCompleted(source.id);

    expect(repeated.ok).toBe(true);

    if (!repeated.ok) {
      throw new Error("Expected direct repeat-trip success");
    }

    expect(repeated.state).toMatchObject({
      lifecycle: "active",
      completedSummary: null,
      activeTrip: {
        budgetMinor: 5_000,
        safetyBufferMinor: 200,
        items: [],
        startedAt: LATER,
      },
    });
    expect(repeated.state.completedTrips).toHaveLength(1);
  });

  it("blocks repeat when completed persistence is degraded or cleanup is pending", () => {
    const source = createCompletedTrip("repeat-source", NEXT);
    const issue: PersistenceProblem = {
      code: "history-read-failed",
      storageKey: "budget-cart:history",
    };
    const persistence = createPersistence({
      ok: false,
      activeTrip: null,
      completedTrips: [source],
      completionCleanupPending: true,
      issue,
      recoveryRequired: false,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    const result = controller.startTripFromCompleted(source.id);

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "repeat-source-unavailable",
      },
    });
    expect(persistence.saveCalls).toHaveLength(0);
    expect(controller.getSnapshot().completedTrips).toEqual([source]);
  });

  it("rejects a missing completed source without creating or persisting a trip", () => {
    const source = createCompletedTrip("known-source", NEXT);
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: [source],
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    const missing = unwrap(
      createActiveTrip({
        id: "missing-source",
        budgetMinor: money(1_000),
        startedAt: START,
      }),
    ).id;

    const result = controller.startTripFromCompleted(missing);

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "completed-trip-not-found",
      },
    });
    expect(persistence.saveCalls).toHaveLength(0);
  });
});

describe("ShoppingAppController cancelling an empty trip", () => {
  it("returns to the start without a history entry and removes the saved trip", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START, NEXT),
      ids,
    });

    controller.bootstrap();
    controller.startTrip({ budgetMinor: money(5_000) });

    const result = controller.discardEmptyTrip();

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      durability: "persisted",
      state: {
        lifecycle: "idle",
        activeTrip: null,
        completedSummary: null,
        completedTrips: [],
        persistence: { status: "healthy" },
        undo: null,
      },
    });
    expect(persistence.clearCompletedActiveCalls).toBe(1);
    expect(persistence.completeCalls).toHaveLength(0);
  });

  it("refuses a trip that has items and leaves it untouched", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START, NEXT),
      ids,
    });

    controller.bootstrap();
    controller.startTrip({ budgetMinor: money(5_000) });
    controller.addManualItem({ unitPriceMinor: money(250), quantity: 1 });
    const before = controller.getSnapshot();

    const result = controller.discardEmptyTrip();

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "application", code: "trip-not-empty" },
    });
    expect(controller.getSnapshot()).toBe(before);
    expect(persistence.clearCompletedActiveCalls).toBe(0);
  });

  it("keeps the trip open when its saved copy cannot be removed", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START, NEXT),
      ids,
    });

    controller.bootstrap();
    controller.startTrip({ budgetMinor: money(5_000) });
    persistence.queueClearResult({ ok: false, issue: writeFailure });
    const before = controller.getSnapshot();

    const result = controller.discardEmptyTrip();

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "application", code: "discard-not-saved" },
    });
    expect(controller.getSnapshot()).toBe(before);
    expect(before.lifecycle).toBe("active");
  });

  it("clears the saving warning once the unsaved empty trip is gone", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START, NEXT),
      ids,
    });

    controller.bootstrap();
    persistence.queueSaveResult({ ok: false, issue: writeFailure });
    controller.startTrip({ budgetMinor: money(5_000) });
    expect(controller.getSnapshot().persistence.status).toBe("degraded");

    const result = controller.discardEmptyTrip();

    expect(result.state).toMatchObject({
      lifecycle: "idle",
      persistence: { status: "healthy" },
    });
  });

  it("needs an open trip", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });

    controller.bootstrap();

    expect(controller.discardEmptyTrip()).toMatchObject({
      ok: false,
      error: { kind: "application", code: "no-active-trip" },
    });
    expect(persistence.clearCompletedActiveCalls).toBe(0);
  });
});

describe("ShoppingAppController addManualItem", () => {
  it("creates one canonical confirmed manual item and persists the exact committed trip", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const result = controller.addManualItem({
      unitPriceMinor: money(129),
      quantity: 3,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected manual item commit");
    }

    expect(result.changed).toBe(true);
    expect(result.durability).toBe("persisted");
    expect(result.state.activeTrip?.items).toHaveLength(1);
    expect(result.state.activeTrip?.items[0]).toMatchObject({
      id: "item-generated",
      unitPriceMinor: 129,
      quantity: 3,
      priceSource: { kind: "manual" },
      priceConfidence: {
        kind: "confirmed",
        confirmedAt: NEXT,
      },
      createdAt: NEXT,
      updatedAt: NEXT,
    });
    expect(persistence.saveCalls).toHaveLength(1);
    expect(persistence.saveCalls[0]?.trip).toBe(result.state.activeTrip);
    expect(persistence.saveCalls[0]?.savedAt).toBe(LATER);
    expect(notifications).toBe(1);
  });

  it("keeps the committed manual item in memory when persistence fails", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    persistence.queueSaveResult({
      ok: false,
      issue: writeFailure,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();

    const result = controller.addManualItem({
      unitPriceMinor: money(479),
      quantity: 1,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected memory-only manual item commit");
    }

    expect(result.changed).toBe(true);
    expect(result.durability).toBe("memory-only");
    expect(result.state.activeTrip?.items).toHaveLength(1);
    expect(result.state.activeTrip?.items[0]).toMatchObject({
      unitPriceMinor: 479,
      quantity: 1,
    });
    expect(result.state.persistence).toEqual({
      status: "degraded",
      issue: writeFailure,
      since: LATER,
    });
    expect(persistence.saveCalls[0]?.trip).toBe(result.state.activeTrip);
  });

  it("rejects an invalid quantity before persistence and publication", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const before = controller.getSnapshot();
    const result = controller.addManualItem({
      unitPriceMinor: money(129),
      quantity: 0,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected invalid quantity rejection");
    }

    expect(result.error).toEqual({
      kind: "domain",
      code: "invalid-quantity",
    });
    expect(controller.getSnapshot()).toBe(before);
    expect(persistence.saveCalls).toHaveLength(0);
    expect(notifications).toBe(0);
  });

  it("rejects manual add outside an active lifecycle without persistence", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });

    const beforeBootstrap = controller.addManualItem({
      unitPriceMinor: money(479),
      quantity: 1,
    });

    expect(beforeBootstrap).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "not-ready",
      },
    });
    expect(persistence.saveCalls).toHaveLength(0);

    controller.bootstrap();

    const idleResult = controller.addManualItem({
      unitPriceMinor: money(479),
      quantity: 1,
    });

    expect(idleResult).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "no-active-trip",
      },
    });
    expect(persistence.saveCalls).toHaveLength(0);
  });
});

describe("ShoppingAppController undo", () => {
  it("restores and persists the exact canonical snapshot before the last add", () => {
    const initialTrip = createTrip(5_000, 0);
    const persistence = createPersistence({
      ok: true,
      activeTrip: initialTrip,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER, LATER),
      ids,
    });
    controller.bootstrap();

    const added = controller.addManualItem({
      unitPriceMinor: money(479),
      quantity: 1,
    });

    expect(added.ok).toBe(true);

    if (!added.ok) {
      throw new Error("Expected add before undo");
    }

    expect(added.state.undo).toEqual({
      previousTrip: initialTrip,
      description: "add",
    });

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const undone = controller.undo();

    expect(undone.ok).toBe(true);

    if (!undone.ok) {
      throw new Error("Expected undo success");
    }

    expect(undone.changed).toBe(true);
    expect(undone.durability).toBe("persisted");
    expect(undone.state.activeTrip).toBe(initialTrip);
    expect(undone.state.activeTrip?.items).toHaveLength(0);
    expect(undone.state.undo).toBeNull();
    expect(persistence.saveCalls).toHaveLength(2);
    expect(persistence.saveCalls[1]?.trip).toBe(initialTrip);
    expect(notifications).toBe(1);
  });

  it("keeps the restored snapshot in memory when undo persistence fails", () => {
    const initialTrip = createTrip(5_000, 0);
    const persistence = createPersistence({
      ok: true,
      activeTrip: initialTrip,
    });
    persistence.queueSaveResult({ ok: true });
    persistence.queueSaveResult({
      ok: false,
      issue: writeFailure,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER, LATER),
      ids,
    });
    controller.bootstrap();
    controller.addManualItem({
      unitPriceMinor: money(479),
      quantity: 1,
    });

    const undone = controller.undo();

    expect(undone.ok).toBe(true);

    if (!undone.ok) {
      throw new Error("Expected memory-only undo");
    }

    expect(undone.durability).toBe("memory-only");
    expect(undone.state.activeTrip).toBe(initialTrip);
    expect(undone.state.activeTrip?.items).toHaveLength(0);
    expect(undone.state.undo).toBeNull();
    expect(undone.state.persistence).toEqual({
      status: "degraded",
      issue: writeFailure,
      since: LATER,
    });
  });

  it("is a no-op when no undoable cart mutation exists", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    const before = controller.getSnapshot();
    const result = controller.undo();

    expect(result).toEqual({
      ok: true,
      changed: false,
      durability: "unchanged",
      state: before,
    });
    expect(persistence.saveCalls).toHaveLength(0);
  });

  it("clears stale cart undo when a later non-cart canonical mutation occurs", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER, LATER),
      ids,
    });
    controller.bootstrap();

    controller.addManualItem({
      unitPriceMinor: money(479),
      quantity: 1,
    });
    expect(controller.getSnapshot().undo?.description).toBe("add");

    controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(200),
    });

    expect(controller.getSnapshot().undo).toBeNull();
    const beforeUndo = controller.getSnapshot();
    expect(controller.undo()).toEqual({
      ok: true,
      changed: false,
      durability: "unchanged",
      state: beforeUndo,
    });
  });
});

describe("ShoppingAppController item correction", () => {
  it("edits manual price and quantity through the application boundary and keeps one-step undo", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER, LATER, LATER, LATER),
      ids,
    });
    controller.bootstrap();

    const added = controller.addManualItem({
      unitPriceMinor: money(479),
      quantity: 1,
    });
    expect(added.ok).toBe(true);

    const item = controller.getSnapshot().activeTrip?.items[0];
    expect(item).toBeDefined();

    if (item === undefined) {
      throw new Error("Expected added item");
    }

    const corrected = controller.updateManualItem({
      itemId: item.id,
      unitPriceMinor: money(529),
      quantity: 2,
    });

    expect(corrected.ok).toBe(true);

    if (!corrected.ok) {
      throw new Error("Expected correction success");
    }

    expect(corrected.state.activeTrip?.items[0]).toMatchObject({
      id: item.id,
      unitPriceMinor: 529,
      quantity: 2,
      priceSource: { kind: "manual" },
      priceConfidence: {
        kind: "confirmed",
        confirmedAt: LATER,
      },
      updatedAt: LATER,
    });
    expect(corrected.state.undo?.description).toBe("edit");
    expect(persistence.saveCalls).toHaveLength(2);

    const undone = controller.undo();
    expect(undone.ok).toBe(true);
    expect(undone.state.activeTrip?.items[0]).toMatchObject({
      unitPriceMinor: 479,
      quantity: 1,
    });
  });

  it("preserves remembered provenance and confidence when only quantity changes", () => {
    const base = createTrip(5_000, 0);
    const rememberedItem = unwrap(
      createCartItem({
        id: "remembered-item",
        unitPriceMinor: money(139),
        quantity: 1,
        label: "Milk",
        priceSource: {
          kind: "price-memory",
          memoryId: "memory-1",
        },
        priceConfidence: {
          kind: "remembered",
          observedAt: time(START),
        },
        createdAt: START,
      }),
    );
    const added = reduceTrip(base, {
      type: "add-item",
      item: rememberedItem,
    });

    if (!added.ok || added.value.status !== "active") {
      throw new Error("Expected remembered fixture trip");
    }

    const persistence = createPersistence({
      ok: true,
      activeTrip: added.value,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();

    const result = controller.updateManualItem({
      itemId: rememberedItem.id,
      unitPriceMinor: rememberedItem.unitPriceMinor,
      quantity: 2,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected quantity correction success");
    }

    expect(result.state.activeTrip?.items[0]).toMatchObject({
      quantity: 2,
      priceSource: {
        kind: "price-memory",
        memoryId: "memory-1",
      },
      priceConfidence: {
        kind: "remembered",
        observedAt: START,
      },
    });
  });

  it("removes an item immediately, persists the correction, and allows exact undo", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER, LATER, LATER),
      ids,
    });
    controller.bootstrap();
    controller.addManualItem({
      unitPriceMinor: money(479),
      quantity: 1,
    });

    const item = controller.getSnapshot().activeTrip?.items[0];

    if (item === undefined) {
      throw new Error("Expected added item");
    }

    const removed = controller.removeItem(item.id);
    expect(removed.ok).toBe(true);

    if (!removed.ok) {
      throw new Error("Expected remove success");
    }

    expect(removed.state.activeTrip?.items).toHaveLength(0);
    expect(removed.state.undo?.description).toBe("remove");
    expect(persistence.saveCalls).toHaveLength(2);

    const undone = controller.undo();
    expect(undone.ok).toBe(true);
    expect(undone.state.activeTrip?.items).toHaveLength(1);
    expect(undone.state.activeTrip?.items[0]?.id).toBe(item.id);
  });

  it("rejects correction for a missing item without persistence", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    const result = controller.updateManualItem({
      itemId: unwrap(parseItemId("missing-item")),
      unitPriceMinor: money(479),
      quantity: 1,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "domain",
        code: "item-not-found",
      },
    });
    expect(persistence.saveCalls).toHaveLength(0);
  });
});

describe("ShoppingAppController trip completion", () => {
  const historyWriteFailure: PersistenceProblem = {
    code: "write-failed",
    storageKey: "budget-cart:history",
  };
  const activeClearFailure: PersistenceProblem = {
    code: "remove-failed",
    storageKey: "budget-cart:active-trip",
  };

  it("finishes into a durable completed summary and history entry", () => {
    const active = createTrip(5_000, 0);
    const persistence = createPersistence({
      ok: true,
      activeTrip: active,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    const result = controller.completeTrip();

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected completion success");
    }

    expect(result.durability).toBe("persisted");
    expect(result.state).toMatchObject({
      lifecycle: "completed-summary",
      activeTrip: null,
      completedSummary: {
        id: active.id,
        status: "completed",
        completedAt: NEXT,
      },
      completionCleanupPending: false,
      persistence: { status: "healthy" },
      undo: null,
    });
    expect(result.state.completedTrips).toHaveLength(1);
    expect(persistence.completeCalls).toHaveLength(1);
    expect(persistence.completeCalls[0]?.savedAt).toBe(NEXT);
    expect(persistence.completeCalls[0]?.trip).toEqual(
      result.state.completedSummary,
    );
  });

  it("keeps the trip active when history cannot be durably written", () => {
    const active = createTrip(5_000, 0);
    const persistence = createPersistence({
      ok: true,
      activeTrip: active,
    });
    persistence.queueCompleteResult({
      ok: false,
      stage: "history-write",
      issue: historyWriteFailure,
      historyPersisted: false,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    const result = controller.completeTrip();

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "completion-not-saved",
      },
      state: {
        lifecycle: "active",
        activeTrip: active,
        completedSummary: null,
        completedTrips: [],
        completionCleanupPending: false,
        persistence: {
          status: "degraded",
          issue: historyWriteFailure,
          since: NEXT,
        },
      },
    });
  });

  it("enters completed summary when history is durable even if stale active cleanup fails", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    persistence.queueCompleteResult({
      ok: false,
      stage: "active-clear",
      issue: activeClearFailure,
      historyPersisted: true,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    const result = controller.completeTrip();

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected durable completion");
    }

    expect(result.state.lifecycle).toBe("completed-summary");
    expect(result.state.activeTrip).toBeNull();
    expect(result.state.completedTrips).toHaveLength(1);
    expect(result.state.completionCleanupPending).toBe(true);
    expect(result.state.persistence).toEqual({
      status: "degraded",
      issue: activeClearFailure,
      since: NEXT,
    });
  });

  it("persists optional actual checkout against the completed record", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    controller.completeTrip();

    const result = controller.setActualCheckout(money(4_672));

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected checkout reconciliation success");
    }

    expect(result.durability).toBe("persisted");
    expect(result.state.completedSummary?.actualCheckoutMinor).toBe(
      4_672,
    );
    expect(result.state.completedTrips[0]?.actualCheckoutMinor).toBe(
      4_672,
    );
    expect(persistence.saveCompletedCalls).toHaveLength(1);
    expect(persistence.saveCompletedCalls[0]?.savedAt).toBe(LATER);
  });

  it("keeps a checkout reconciliation in memory and warns when history update fails", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    persistence.queueCompletedSaveResult({
      ok: false,
      issue: historyWriteFailure,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    controller.completeTrip();

    const result = controller.setActualCheckout(money(4_672));

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected memory-only checkout update");
    }

    expect(result.durability).toBe("memory-only");
    expect(result.state.completedSummary?.actualCheckoutMinor).toBe(
      4_672,
    );
    expect(result.state.persistence).toEqual({
      status: "degraded",
      issue: historyWriteFailure,
      since: LATER,
    });
  });

  it("retries history and stale-active cleanup before declaring completion persistence healthy", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    persistence.queueCompleteResult({
      ok: false,
      stage: "active-clear",
      issue: activeClearFailure,
      historyPersisted: true,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    controller.completeTrip();

    const retried = controller.retryPersistence();

    expect(retried.ok).toBe(true);

    if (!retried.ok) {
      throw new Error("Expected completion retry success");
    }

    expect(persistence.saveCompletedCalls).toHaveLength(1);
    expect(persistence.clearCompletedActiveCalls).toBe(1);
    expect(retried.state.completionCleanupPending).toBe(false);
    expect(retried.state.persistence).toEqual({
      status: "healthy",
    });
  });

  it("does not dismiss a completion summary while durable cleanup is unresolved", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    persistence.queueCompleteResult({
      ok: false,
      stage: "active-clear",
      issue: activeClearFailure,
      historyPersisted: true,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    controller.completeTrip();

    expect(controller.dismissCompletedSummary()).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "completion-not-saved",
      },
    });

    controller.retryPersistence();
    const dismissed = controller.dismissCompletedSummary();

    expect(dismissed.ok).toBe(true);

    if (!dismissed.ok) {
      throw new Error("Expected summary dismissal");
    }

    expect(dismissed.state).toMatchObject({
      lifecycle: "idle",
      activeTrip: null,
      completedSummary: null,
      completionCleanupPending: false,
      persistence: { status: "healthy" },
    });
    expect(dismissed.state.completedTrips).toHaveLength(1);
  });

  it("hydrates persisted history without inventing an active or summary trip", () => {
    const completedResult = reduceTrip(createTrip(5_000, 0), {
      type: "complete-trip",
      completedAt: time(NEXT),
    });

    if (
      !completedResult.ok ||
      completedResult.value.status !== "completed"
    ) {
      throw new Error("Expected completed fixture");
    }

    const controller = createShoppingAppController({
      persistence: createPersistence({
        ok: true,
        activeTrip: null,
        completedTrips: [completedResult.value],
      }),
      clock: createClock(LATER),
      ids,
    });

    const state = controller.bootstrap();

    expect(state.lifecycle).toBe("idle");
    expect(state.activeTrip).toBeNull();
    expect(state.completedSummary).toBeNull();
    expect(state.completedTrips).toEqual([completedResult.value]);
  });
});

describe("ShoppingAppController receipt total for a past trip", () => {
  it("adds the receipt total to a trip in history and saves it", () => {
    const past = createCompletedTrip("trip-past", NEXT);
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: [past],
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    const result = controller.setCompletedTripCheckout(past.id, money(4_812));

    expect(result).toMatchObject({ ok: true, changed: true, durability: "persisted" });
    expect(result.state.completedTrips[0]?.actualCheckoutMinor).toBe(4_812);
    expect(persistence.replaceCompletedHistoryCalls).toHaveLength(1);
    expect(persistence.replaceCompletedHistoryCalls[0]?.trips).toEqual([
      { ...past, actualCheckoutMinor: 4_812 },
    ]);
  });

  it("writes nothing when the receipt total is already saved", () => {
    const past = {
      ...createCompletedTrip("trip-past", NEXT),
      actualCheckoutMinor: money(4_812),
    };
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: [past],
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    const result = controller.setCompletedTripCheckout(past.id, money(4_812));

    expect(result).toMatchObject({ ok: true, changed: false, durability: "unchanged" });
    expect(persistence.replaceCompletedHistoryCalls).toHaveLength(0);
  });

  it("refuses a trip that is no longer in history", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    const result = controller.setCompletedTripCheckout(
      createCompletedTrip("trip-gone", NEXT).id,
      money(1_000),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "application", code: "completed-trip-not-found" },
    });
    expect(persistence.replaceCompletedHistoryCalls).toHaveLength(0);
  });

  it("keeps history as it was when the change cannot be saved", () => {
    const past = createCompletedTrip("trip-past", NEXT);
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: [past],
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();
    persistence.queueHistoryReplaceResult({ ok: false, issue: historyWriteFailure });
    const before = controller.getSnapshot();

    const result = controller.setCompletedTripCheckout(past.id, money(4_812));

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "application", code: "history-write-unavailable" },
    });
    expect(controller.getSnapshot()).toBe(before);
    expect(before.completedTrips[0]?.actualCheckoutMinor).toBeUndefined();
  });

  it("updates the open summary when its trip gets a receipt total from history", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    const finished = controller.completeTrip();
    const summaryId = finished.state.completedSummary?.id;

    if (summaryId === undefined) {
      throw new Error("Expected an open summary");
    }

    const result = controller.setCompletedTripCheckout(summaryId, money(4_672));

    expect(result).toMatchObject({ ok: true, durability: "persisted" });
    expect(result.state.completedSummary?.actualCheckoutMinor).toBe(4_672);
    expect(result.state.completedTrips[0]?.actualCheckoutMinor).toBe(4_672);
    expect(result.state.lifecycle).toBe("completed-summary");
  });
});

describe("ShoppingAppController leaving a summary whose receipt was not saved", () => {
  it("closes the summary and keeps the trip as it was last saved", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    controller.completeTrip();
    persistence.queueCompletedSaveResult({ ok: false, issue: historyWriteFailure });
    controller.setActualCheckout(money(4_672));
    expect(controller.getSnapshot().persistence.status).toBe("degraded");

    const result = controller.dismissCompletedSummary();

    expect(result).toMatchObject({
      ok: true,
      state: {
        lifecycle: "idle",
        completedSummary: null,
        persistence: { status: "healthy" },
      },
    });
    expect(result.state.completedTrips).toHaveLength(1);
    expect(result.state.completedTrips[0]?.actualCheckoutMinor).toBeUndefined();
  });

  it("keeps the summary open while its trip is not in history", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    controller.completeTrip();
    persistence.queueCompletedSaveResult({ ok: false, issue: historyWriteFailure });
    controller.setActualCheckout(money(4_672));
    persistence.queueHistoryReadResult({ ok: true, completedTrips: [] });

    expect(controller.dismissCompletedSummary()).toMatchObject({
      ok: false,
      error: { kind: "application", code: "completion-not-saved" },
      state: { lifecycle: "completed-summary" },
    });
  });

  it("says the trip is gone when it was deleted from history elsewhere, without blocking Done", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    controller.completeTrip();
    persistence.queueCompletedSaveResult({
      ok: false,
      issue: { code: "history-conflict", storageKey: "budget-cart:history" },
    });

    expect(controller.setActualCheckout(money(4_672))).toMatchObject({
      ok: false,
      error: { kind: "application", code: "completed-trip-not-found" },
      state: { persistence: { status: "healthy" } },
    });
    expect(controller.dismissCompletedSummary()).toMatchObject({ ok: true });
  });
});

describe("ShoppingAppController making room in history", () => {
  it("removes the oldest trips first and never the trip in the open summary", () => {
    const oldest = createCompletedTrip("trip-oldest", "2026-09-21T09:01:00.000Z");
    const older = createCompletedTrip("trip-older", "2026-09-21T09:02:00.000Z");
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
      completedTrips: [older, oldest],
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    const summaryId = controller.completeTrip().state.completedSummary?.id;

    const result = controller.deleteOldestCompletedTrips(10);

    expect(result).toMatchObject({ ok: true, durability: "persisted" });
    expect(persistence.replaceCompletedHistoryCalls[0]?.trips.map((trip) => trip.id)).toEqual([
      summaryId,
    ]);
    expect(result.state.completedSummary?.id).toBe(summaryId);
    expect(result.state.completedTrips.map((trip) => trip.id)).toEqual([summaryId]);
  });

  it("removes only as many trips as asked, oldest first", () => {
    const trips = [
      createCompletedTrip("trip-b", "2026-09-23T09:00:00.000Z"),
      createCompletedTrip("trip-a", "2026-09-22T09:00:00.000Z"),
      createCompletedTrip("trip-c", "2026-09-24T09:00:00.000Z"),
    ];
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: trips,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    controller.deleteOldestCompletedTrips(2);

    expect(persistence.replaceCompletedHistoryCalls[0]?.trips.map((trip) => trip.id)).toEqual([
      "trip-c",
    ]);
  });

  it("refuses when history has nothing to remove", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    expect(controller.deleteOldestCompletedTrips(10)).toMatchObject({
      ok: false,
      error: { kind: "application", code: "completed-trip-not-found" },
    });
    expect(persistence.replaceCompletedHistoryCalls).toHaveLength(0);
  });

  it("changes nothing while history cannot be read", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: [createCompletedTrip("trip-a", NEXT)],
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();
    persistence.queueHistoryReadResult({
      ok: false,
      issue: { code: "read-failed", storageKey: "budget-cart:history" },
      completedTrips: [],
    });

    const result = controller.deleteOldestCompletedTrips(10);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "application", code: "history-write-unavailable" },
      state: { historyIntegrity: { status: "degraded" } },
    });
    expect(persistence.replaceCompletedHistoryCalls).toHaveLength(0);
    expect(controller.deleteOldestCompletedTrips(10)).toMatchObject({
      ok: false,
      error: { kind: "application", code: "history-write-unavailable" },
    });
  });

  it("keeps history as it was when the shorter history cannot be written", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: [createCompletedTrip("trip-a", NEXT)],
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();
    persistence.queueHistoryReplaceResult({ ok: false, issue: historyWriteFailure });
    const before = controller.getSnapshot();

    expect(controller.deleteOldestCompletedTrips(10)).toMatchObject({
      ok: false,
      error: { kind: "application", code: "history-write-unavailable" },
    });
    expect(controller.getSnapshot()).toBe(before);
  });
});

describe("ShoppingAppController device clock moving backwards", () => {
  const AHEAD = "2026-09-21T10:00:00.000Z";
  const BEHIND = "2026-09-21T09:30:00.000Z";

  const restoredTripWithItemAt = (at: string): ActiveTrip => {
    const item = unwrap(
      createCartItem({
        id: "item-ahead",
        unitPriceMinor: money(379),
        quantity: 1,
        priceSource: { kind: "manual" },
        priceConfidence: { kind: "confirmed", confirmedAt: time(at) },
        createdAt: at,
      }),
    );
    const trip = unwrap(
      reduceTrip(createTrip(5_000, 0), { type: "add-item", item }),
    );

    if (trip.status !== "active") {
      throw new Error("Expected active trip");
    }

    return trip;
  };

  it("stamps corrections no earlier than the trip's latest recorded moment", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: restoredTripWithItemAt(AHEAD),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(BEHIND),
      ids,
    });
    controller.bootstrap();

    const edited = controller.updateManualItem({
      itemId: unwrap(parseItemId("item-ahead")),
      unitPriceMinor: money(399),
      quantity: 2,
    });

    expect(edited.ok).toBe(true);

    if (!edited.ok) {
      throw new Error("Expected correction despite clock rollback");
    }

    const item = edited.state.activeTrip?.items[0];

    expect(item?.unitPriceMinor).toBe(399);
    expect(item?.updatedAt).toBe(AHEAD);
    expect(item?.priceConfidence).toEqual({
      kind: "confirmed",
      confirmedAt: AHEAD,
    });
    expect(edited.durability).toBe("persisted");
  });

  it("adds items and finishes the trip without an invalid-timestamp dead end", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: restoredTripWithItemAt(AHEAD),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(BEHIND),
      ids,
    });
    controller.bootstrap();

    const added = controller.addManualItem({
      unitPriceMinor: money(120),
      quantity: 1,
    });

    expect(added.ok).toBe(true);

    if (!added.ok) {
      throw new Error("Expected add despite clock rollback");
    }

    expect(added.state.activeTrip?.items.at(-1)?.createdAt).toBe(AHEAD);

    const finished = controller.completeTrip();

    expect(finished.ok).toBe(true);

    if (!finished.ok) {
      throw new Error("Expected completion despite clock rollback");
    }

    expect(finished.state.lifecycle).toBe("completed-summary");
    expect(finished.state.completedSummary?.completedAt).toBe(AHEAD);
  });

  it("keeps using the device clock when it is ahead of the trip", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: restoredTripWithItemAt(NEXT),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    const finished = controller.completeTrip();

    expect(finished.ok).toBe(true);

    if (!finished.ok) {
      throw new Error("Expected completion");
    }

    expect(finished.state.completedSummary?.completedAt).toBe(LATER);
  });
});

describe("ShoppingAppController retryPersistence", () => {
  it("retries the exact canonical active trip and heals degraded persistence", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    persistence.queueSaveResult({
      ok: false,
      issue: writeFailure,
    });
    persistence.queueSaveResult({ ok: true });

    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();

    const degraded = controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(500),
    });

    expect(degraded.ok).toBe(true);
    expect(controller.getSnapshot().persistence.status).toBe("degraded");

    const canonicalBeforeRetry = controller.getSnapshot().activeTrip;
    const retried = controller.retryPersistence();

    expect(retried.ok).toBe(true);

    if (!retried.ok) {
      throw new Error("Expected retry success");
    }

    expect(retried.changed).toBe(true);
    expect(retried.durability).toBe("persisted");
    expect(retried.state.persistence).toEqual({ status: "healthy" });
    expect(retried.state.activeTrip).toBe(canonicalBeforeRetry);
    expect(persistence.saveCalls).toHaveLength(2);
    expect(persistence.saveCalls[1]?.trip).toBe(canonicalBeforeRetry);
    expect(persistence.saveCalls[1]?.savedAt).toBe(LATER);
  });

  it("keeps degraded state and original since timestamp when retry fails", () => {
    const secondFailure: PersistenceProblem = {
      code: "quota-exceeded",
      storageKey: "budget-cart:active-trip",
    };
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    persistence.queueSaveResult({
      ok: false,
      issue: writeFailure,
    });
    persistence.queueSaveResult({
      ok: false,
      issue: secondFailure,
    });

    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(500),
    });

    const retried = controller.retryPersistence();

    expect(retried.ok).toBe(true);

    if (!retried.ok) {
      throw new Error("Expected retry attempt result");
    }

    expect(retried.changed).toBe(true);
    expect(retried.durability).toBe("memory-only");
    expect(retried.state.persistence).toEqual({
      status: "degraded",
      issue: secondFailure,
      since: NEXT,
    });
  });

  it("is a no-op when persistence is already healthy", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    const before = controller.getSnapshot();
    const retried = controller.retryPersistence();

    expect(retried).toEqual({
      ok: true,
      changed: false,
      durability: "unchanged",
      state: before,
    });
    expect(persistence.saveCalls).toHaveLength(0);
  });

  it("does not use retryPersistence to overwrite recovery data", () => {
    const persistence = createPersistence({
      ok: false,
      activeTrip: null,
      issue: {
        code: "unsupported-version",
        storageKey: "budget-cart:active-trip",
        schemaVersion: 99,
      },
      recoveryRequired: true,
      recoveryRaw: '{"schemaVersion":99}',
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    const result = controller.retryPersistence();

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "recovery-required",
      },
    });
    expect(persistence.saveCalls).toHaveLength(0);
  });
});

describe("ShoppingAppController dispatch", () => {
  it("persists and publishes a successful active-trip command once", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const result = controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(500),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected dispatch success");
    }

    expect(result.changed).toBe(true);
    expect(result.durability).toBe("persisted");
    expect(result.state.activeTrip?.safetyBufferMinor).toBe(500);
    expect(persistence.saveCalls).toHaveLength(1);
    expect(persistence.saveCalls[0]?.savedAt).toBe(NEXT);
    expect(notifications).toBe(1);
  });

  it("does not persist or notify for a domain no-op", () => {
    const trip = createTrip(5_000, 200);
    const persistence = createPersistence({
      ok: true,
      activeTrip: trip,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const before = controller.getSnapshot();
    const result = controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(200),
    });

    expect(result).toEqual({
      ok: true,
      changed: false,
      durability: "unchanged",
      state: before,
    });
    expect(controller.getSnapshot()).toBe(before);
    expect(persistence.saveCalls).toHaveLength(0);
    expect(notifications).toBe(0);
  });

  it("does not persist or notify for a rejected domain command", () => {
    const trip = createTrip(5_000, 200);
    const persistence = createPersistence({
      ok: true,
      activeTrip: trip,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    const before = controller.getSnapshot();
    const result = controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(5_001),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected invalid buffer failure");
    }

    expect(result.error).toEqual({
      kind: "domain",
      code: "invalid-buffer",
    });
    expect(controller.getSnapshot()).toBe(before);
    expect(persistence.saveCalls).toHaveLength(0);
    expect(notifications).toBe(0);
  });

  it("publishes the committed trip as memory-only when persistence fails", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    persistence.queueSaveResult({
      ok: false,
      issue: writeFailure,
    });

    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    const result = controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(500),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected memory-only dispatch");
    }

    expect(result.durability).toBe("memory-only");
    expect(result.state.activeTrip?.safetyBufferMinor).toBe(500);
    expect(result.state.persistence).toEqual({
      status: "degraded",
      issue: writeFailure,
      since: NEXT,
    });
  });

  it("persists budget and buffer as one atomic spending-plan mutation", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 4_000),
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT),
      ids,
    });
    controller.bootstrap();

    const result = controller.updateSpendingPlan({
      budgetMinor: money(3_000),
      safetyBufferMinor: money(1_000),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected spending-plan update");
    }

    expect(result.changed).toBe(true);
    expect(result.state.activeTrip).toMatchObject({
      budgetMinor: 3_000,
      safetyBufferMinor: 1_000,
    });
    expect(persistence.saveCalls).toHaveLength(1);
    expect(persistence.saveCalls[0]?.trip).toBe(result.state.activeTrip);
  });

  it("returns to healthy after a later successful canonical write", () => {
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(5_000, 0),
    });
    persistence.queueSaveResult({
      ok: false,
      issue: writeFailure,
    });
    persistence.queueSaveResult({ ok: true });

    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();

    controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(500),
    });

    const healed = controller.dispatch({
      type: "set-budget",
      budgetMinor: money(6_000),
    });

    expect(healed.ok).toBe(true);

    if (!healed.ok) {
      throw new Error("Expected healed dispatch");
    }

    expect(healed.durability).toBe("persisted");
    expect(healed.state.activeTrip).toMatchObject({
      budgetMinor: 6_000,
      safetyBufferMinor: 500,
    });
    expect(healed.state.persistence).toEqual({
      status: "healthy",
    });
    expect(persistence.saveCalls).toHaveLength(2);
    expect(persistence.saveCalls[1]?.savedAt).toBe(LATER);
  });

  it("deletes one completed trip through the durable history boundary", () => {
    const older = createCompletedTrip("older", NEXT, 2_500);
    const newer = createCompletedTrip("newer", LATER, 5_000);
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: [older, newer],
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    const result = controller.deleteCompletedTrip(older.id);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected history deletion success");
    }

    expect(result.durability).toBe("persisted");
    expect(result.state.completedTrips).toEqual([newer]);
    expect(persistence.replaceCompletedHistoryCalls).toHaveLength(1);
    expect(persistence.replaceCompletedHistoryCalls[0]?.trips).toEqual([
      newer,
    ]);
    expect(persistence.replaceCompletedHistoryCalls[0]?.savedAt).toBe(
      LATER,
    );
  });

  it("clears completed history only after a durable replacement succeeds", () => {
    const completed = createCompletedTrip("completed", NEXT);
    const persistence = createPersistence({
      ok: true,
      activeTrip: null,
      completedTrips: [completed],
    });
    persistence.queueHistoryReplaceResult({
      ok: false,
      issue: historyWriteFailure,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(LATER),
      ids,
    });
    controller.bootstrap();

    const result = controller.clearCompletedHistory();

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "history-write-unavailable",
      },
    });
    expect(result.state.completedTrips).toEqual([completed]);
    expect(result.state.persistence).toEqual({
      status: "healthy",
    });
  });

  it("rejects dispatch when no active trip exists", () => {
    const persistence = createPersistence();
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    const result = controller.dispatch({
      type: "set-budget",
      budgetMinor: money(6_000),
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "no-active-trip",
      },
    });
    expect(persistence.saveCalls).toHaveLength(0);
  });
});
