import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  createShoppingAppController,
  type ActiveTripBootstrapResult,
  type ActiveTripPersistencePort,
  type ActiveTripSaveResult,
  type Clock,
  type IdGenerator,
} from "../src/application/shopping-app-controller";
import { mvpMinorUnits, type Result } from "../src/domain/money";
import {
  createActiveTrip,
  isoTimestamp,
  type ActiveTrip,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import { ActiveTripScreen } from "../src/features/shopping/ActiveTripScreen";
import { RecoveryScreen } from "../src/features/shopping/RecoveryScreen";

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

const createTrip = (): ActiveTrip =>
  unwrap(
    createActiveTrip({
      id: "trip-persistence-ux",
      budgetMinor: money(5_000),
      safetyBufferMinor: money(0),
      startedAt: START,
    }),
  );

const ids: IdGenerator = {
  tripId: () => "trip-persistence-ux",
  itemId: () => "item-persistence-ux",
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

type BootstrapInput = ActiveTripBootstrapResult extends infer T
  ? T extends ActiveTripBootstrapResult
    ? Omit<T, "completedTrips" | "completionCleanupPending"> & {
        readonly completedTrips?: ActiveTripBootstrapResult["completedTrips"];
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
  readonly saveCalls: readonly ActiveTrip[];
  setBootstrapResult(result: BootstrapInput): void;
  queueSaveResult(result: ActiveTripSaveResult): void;
}

const createPersistence = (
  initialBootstrap: BootstrapInput,
): PersistenceFake => {
  let bootstrapResult = normalizeBootstrap(initialBootstrap);
  const saveResults: ActiveTripSaveResult[] = [];
  const saveCalls: ActiveTrip[] = [];

  return {
    get saveCalls() {
      return saveCalls;
    },
    setBootstrapResult(result) {
      bootstrapResult = normalizeBootstrap(result);
    },
    queueSaveResult(result) {
      saveResults.push(result);
    },
    bootstrap() {
      return bootstrapResult;
    },
    save(trip) {
      saveCalls.push(trip);
      return saveResults.shift() ?? { ok: true };
    },
    complete() {
      return { ok: true };
    },
    saveCompleted() {
      return { ok: true };
    },
    replaceCompletedHistory() {
      return { ok: true };
    },
    clearCompletedActive() {
      return { ok: true };
    },
    readCompletedHistory() {
      return { ok: true, completedTrips: [] };
    },
    setAsideDamagedHistory() {
      return { ok: true, completedTrips: [] };
    },
    setAsideUnreadableActiveTrip() {
      return { ok: true };
    },
  };
};

const renderActive = (
  controller: ReturnType<typeof createShoppingAppController>,
) => {
  render(
    <ActiveTripScreen
      controller={controller}
      onAddPrice={() => undefined}
      locale="en-IE"
    />,
  );
};

describe("persistence-health UX", () => {
  it("stays quiet while persistence is healthy", () => {
    const controller = createShoppingAppController({
      persistence: createPersistence({
        ok: true,
        activeTrip: createTrip(),
      }),
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    renderActive(controller);

    expect(
      screen.queryByText("This trip is not being saved right now"),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("warns truthfully after a write failure and heals after Retry", async () => {
    const user = userEvent.setup();
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(),
    });
    persistence.queueSaveResult({
      ok: false,
      issue: {
        code: "write-failed",
        storageKey: "budget-cart:active-trip",
      },
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
      safetyBufferMinor: money(200),
    });

    renderActive(controller);

    expect(
      screen.getByText("This trip is not being saved right now"),
    ).not.toBeNull();
    expect(
      screen.getByText(/Keep this page open until checkout/),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(controller.getSnapshot().persistence).toEqual({
      status: "healthy",
    });
    expect(
      screen.queryByText("This trip is not being saved right now"),
    ).toBeNull();
    expect(persistence.saveCalls).toHaveLength(2);
  });

  it("keeps the warning and explains when Retry still cannot save", async () => {
    const user = userEvent.setup();
    const persistence = createPersistence({
      ok: true,
      activeTrip: createTrip(),
    });
    persistence.queueSaveResult({
      ok: false,
      issue: {
        code: "write-failed",
        storageKey: "budget-cart:active-trip",
      },
    });
    persistence.queueSaveResult({
      ok: false,
      issue: {
        code: "quota-exceeded",
        storageKey: "budget-cart:active-trip",
      },
    });

    const controller = createShoppingAppController({
      persistence,
      clock: createClock(NEXT, LATER),
      ids,
    });
    controller.bootstrap();
    controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(200),
    });

    renderActive(controller);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      screen.getByText(
        "Still not saved. Keep this page open and try again later.",
      ),
    ).not.toBeNull();
    expect(controller.getSnapshot().persistence.status).toBe("degraded");
  });

  it("explains storage unavailability without offering a fake retry", () => {
    const controller = createShoppingAppController({
      persistence: createPersistence({
        ok: false,
        activeTrip: createTrip(),
        issue: {
          code: "storage-unavailable",
        },
        recoveryRequired: false,
      }),
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    renderActive(controller);

    expect(
      screen.getByText("This trip cannot be saved on this device"),
    ).not.toBeNull();
    expect(
      screen.getByText(/reloading or closing it can lose this trip/),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("does not misreport historical cleanup as current-trip data loss", () => {
    const controller = createShoppingAppController({
      persistence: createPersistence({
        ok: false,
        activeTrip: createTrip(),
        issue: {
          code: "legacy-retirement-failed",
          storageKey: "counter",
        },
        recoveryRequired: false,
      }),
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    renderActive(controller);

    expect(
      screen.getByText("Old app data could not be cleaned up"),
    ).not.toBeNull();
    expect(
      screen.getByText(/current shopping trip is still available/),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});

describe("RecoveryScreen", () => {
  it("preserves unsupported future data and exposes it only as recovery detail", () => {
    const raw = '{"schemaVersion":99,"data":{"id":"future-trip"}}';
    const persistence = createPersistence({
      ok: false,
      activeTrip: null,
      issue: {
        code: "unsupported-version",
        storageKey: "budget-cart:active-trip",
        schemaVersion: 99,
      },
      recoveryRequired: true,
      recoveryRaw: raw,
    });
    const controller = createShoppingAppController({
      persistence,
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    render(<RecoveryScreen controller={controller} />);

    expect(
      screen.getByRole("heading", {
        name: "Saved trip needs a newer app version",
      }),
    ).not.toBeNull();
    expect(
      screen.getByText(/preserved unchanged\. Update the app to use it/),
    ).not.toBeNull();
    expect(screen.getByText(raw)).not.toBeNull();
    expect(persistence.saveCalls).toHaveLength(0);
  });

  it("says the browser is blocking storage rather than talking about a saved trip", () => {
    const controller = createShoppingAppController({
      persistence: createPersistence({
        ok: false,
        activeTrip: null,
        issue: { code: "storage-unavailable" },
        recoveryRequired: true,
      }),
      clock: createClock(START),
      ids,
    });
    controller.bootstrap();

    render(<RecoveryScreen controller={controller} />);

    expect(screen.getByText("Saving is off")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "This browser isn’t letting the app save" }),
    ).not.toBeNull();
    expect(screen.queryByText(/saved record stays untouched/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Continue without saving" })).not.toBeNull();
  });

  it("retries recovery by reading again and never calls save", async () => {
    const user = userEvent.setup();
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
      clock: createClock(START, NEXT),
      ids,
    });
    controller.bootstrap();

    render(<RecoveryScreen controller={controller} />);

    await user.click(
      screen.getByRole("button", { name: "Try reading again" }),
    );

    expect(
      screen.getByText(
        "The saved trip still cannot be restored safely. Nothing was overwritten.",
      ),
    ).not.toBeNull();
    expect(persistence.saveCalls).toHaveLength(0);
  });

  it("leaves recovery mode when a later read becomes valid", async () => {
    const user = userEvent.setup();
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
      clock: createClock(START, NEXT),
      ids,
    });
    controller.bootstrap();

    render(<RecoveryScreen controller={controller} />);

    persistence.setBootstrapResult({
      ok: true,
      activeTrip: createTrip(),
    });

    await user.click(
      screen.getByRole("button", { name: "Try reading again" }),
    );

    expect(controller.getSnapshot().lifecycle).toBe("active");
    expect(
      screen.queryByText("Saved trip could not be restored safely"),
    ).toBeNull();
    expect(persistence.saveCalls).toHaveLength(0);
  });
});
