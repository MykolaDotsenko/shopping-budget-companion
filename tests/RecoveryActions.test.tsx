import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { bootstrapBrowserShoppingAppController } from "../src/app/composition-root";
import { ShoppingAppShell } from "../src/app/ShoppingAppShell";
import { useShoppingAppState } from "../src/application/react/use-shopping-app-state";
import type { ShoppingAppController } from "../src/application/shopping-app-controller";
import { mvpMinorUnits, type MinorUnits } from "../src/domain/money";
import { createPriceMemoryRecord } from "../src/domain/price-memory";
import {
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  reduceTrip,
  type ActiveTrip,
  type CompletedTrip,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import { FinishTripSurface } from "../src/features/shopping/FinishTripSurface";
import { HistoryIntegrityNotice } from "../src/features/shopping/HistoryIntegrityNotice";
import { PersistenceHealthNotice } from "../src/features/shopping/PersistenceHealthNotice";
import { RecoveryScreen } from "../src/features/shopping/RecoveryScreen";
import {
  SET_ASIDE_STORAGE_KEY_PREFIX,
  encodeActiveTripSnapshot,
  encodeHistorySnapshot,
  type StorageLike,
} from "../src/infrastructure/storage/shopping-storage";
import { encodePriceMemorySnapshot } from "../src/infrastructure/storage/price-memory-storage";
import { PRICE_MEMORY_STORAGE_KEY } from "../src/infrastructure/storage/price-memory-storage-schema";
import {
  ACTIVE_TRIP_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
} from "../src/infrastructure/storage/shopping-storage-schema";

const START = "2026-09-21T09:00:00.000Z";
const NOW = "2026-09-22T10:00:00.000Z";

const must = <T,>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) {
    throw new Error("Expected success");
  }

  return result.value;
};

const money = (value: number): MinorUnits => must(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => must(isoTimestamp(value));

const withItem = (trip: ActiveTrip): ActiveTrip => {
  const item = must(
    createCartItem({
      id: `${trip.id}-item`,
      unitPriceMinor: money(250),
      quantity: 1,
      priceSource: { kind: "manual" },
      priceConfidence: { kind: "confirmed", confirmedAt: time(START) },
      createdAt: START,
    }),
  );
  const next = must(reduceTrip(trip, { type: "add-item", item }));

  if (next.status !== "active") {
    throw new Error("Expected active trip");
  }

  return next;
};

const completedTrip = (id: string): CompletedTrip => {
  const trip: ActiveTrip = must(
    createActiveTrip({ id, budgetMinor: money(3_000), startedAt: START }),
  );
  const completed = must(
    reduceTrip(trip, { type: "complete-trip", completedAt: time(START) }),
  );

  if (completed.status !== "completed") {
    throw new Error("Expected completed trip");
  }

  return completed;
};

const partlyDamagedHistory = (): string => {
  const encoded = encodeHistorySnapshot([completedTrip("trip-kept")], START);

  if (!encoded.ok) {
    throw new Error("Expected history");
  }

  const envelope = JSON.parse(encoded.raw) as {
    data: { trips: Record<string, unknown>[] };
  };
  envelope.data.trips.push({ ...envelope.data.trips[0], id: "bad", extra: 1 });
  return JSON.stringify(envelope);
};

const memoryStorage = (entries: Record<string, string>) => {
  const values = new Map(Object.entries(entries));
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  return { values, storage };
};

const boot = (storage: StorageLike | null): ShoppingAppController => {
  let id = 0;
  return bootstrapBrowserShoppingAppController({
    storage,
    clock: { now: () => time(NOW) },
    ids: {
      tripId: () => `trip-${(id += 1)}`,
      itemId: () => `item-${(id += 1)}`,
    },
  });
};

describe("RecoveryScreen exits", () => {
  it("offers continue and set-aside for an unreadable saved trip", async () => {
    const user = userEvent.setup();
    const { values, storage } = memoryStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: "{broken",
    });
    const controller = boot(storage);

    render(<RecoveryScreen controller={controller} />);

    expect(
      screen.getByRole("button", { name: "Continue without saving" }),
    ).not.toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Set aside and start fresh" }),
    );

    expect(controller.getSnapshot().lifecycle).toBe("idle");
    expect(values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(false);
    expect(
      [...values.keys()].some((key) =>
        key.startsWith(SET_ASIDE_STORAGE_KEY_PREFIX),
      ),
    ).toBe(true);
  });

  it("offers only continue without saving when storage is unavailable", async () => {
    const user = userEvent.setup();
    const controller = boot(null);

    render(<RecoveryScreen controller={controller} />);


    expect(
      screen.queryByRole("button", { name: "Set aside and start fresh" }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Continue without saving" }),
    );

    expect(controller.getSnapshot()).toMatchObject({
      lifecycle: "idle",
      persistence: { issue: { code: "session-only" } },
    });
  });

  it("moves focus to the next screen's heading after leaving recovery", async () => {
    const user = userEvent.setup();
    const controller = boot(null);

    render(<ShoppingAppShell controller={controller} />);

    await screen.findByRole("button", { name: "Continue without saving" });
    await user.click(
      screen.getByRole("button", { name: "Continue without saving" }),
    );

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "How much can you spend today?" }),
    );
  });
});

describe("HistoryIntegrityNotice", () => {
  it("sets damaged history aside only after a second, explicit confirmation", async () => {
    const user = userEvent.setup();
    const damaged = partlyDamagedHistory();
    const { values, storage } = memoryStorage({
      [HISTORY_STORAGE_KEY]: damaged,
    });
    const controller = boot(storage);

    render(<HistoryIntegrityNotice controller={controller} />);

    expect(
      screen.getByText("Some trip history could not be restored"),
    ).not.toBeNull();
    expect(screen.getByText(/1 completed trip is still available/)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Set aside…" }));

    expect(values.get(HISTORY_STORAGE_KEY)).toBe(damaged);
    expect(
      screen.getByText(/1 readable trip will be kept/),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Keep as is" }));

    expect(screen.queryByRole("button", { name: "Set aside now" })).toBeNull();

    await user.dblClick(screen.getByRole("button", { name: "Set aside…" }));

    expect(screen.queryByRole("button", { name: "Set aside now" })).toBeNull();
    expect(values.get(HISTORY_STORAGE_KEY)).toBe(damaged);

    await user.click(screen.getByRole("button", { name: "Set aside…" }));
    await user.click(screen.getByRole("button", { name: "Set aside now" }));

    expect(controller.getSnapshot().historyIntegrity.status).toBe("healthy");
    expect(
      screen.queryByText("Some trip history could not be restored"),
    ).toBeNull();
    expect(values.get(HISTORY_STORAGE_KEY)).not.toBe(damaged);

    const resolved = screen.getByRole("status");
    expect(resolved.textContent).toBe(
      "Any unreadable record was kept as a backup copy on this device.",
    );
    expect(document.activeElement).toBe(resolved);
  });

  it("announces the confirmation from an existing live region without moving focus", async () => {
    const user = userEvent.setup();
    const { storage } = memoryStorage({
      [HISTORY_STORAGE_KEY]: partlyDamagedHistory(),
    });
    const controller = boot(storage);

    const { container } = render(
      <HistoryIntegrityNotice controller={controller} />,
    );

    const toggle = screen.getByRole("button", { name: "Set aside…" });
    const live = container.querySelector('[aria-live="polite"]');

    expect(toggle.hasAttribute("aria-expanded")).toBe(false);
    expect(toggle.hasAttribute("aria-controls")).toBe(false);
    expect(live?.textContent).toBe("");

    await user.click(toggle);

    expect(container.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live?.textContent).toMatch(/1 readable trip will be kept/);
    expect(live?.textContent).toMatch(/Choose Set aside now to confirm/);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Keep as is" }),
    );

    await user.click(screen.getByRole("button", { name: "Keep as is" }));

    expect(live?.textContent).toBe("");
  });

  it("repairs history from the summary and saves the finished trip again", async () => {
    const user = userEvent.setup();
    const { storage, values } = memoryStorage({});
    const controller = boot(storage);
    controller.startTrip({ budgetMinor: money(1_000) });
    controller.completeTrip();
    values.set(HISTORY_STORAGE_KEY, "{broken later");
    controller.setActualCheckout(money(900));

    const { container } = render(
      <HistoryIntegrityNotice controller={controller} />,
    );

    expect(screen.queryByText(/after closing this summary/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Set aside…" }));

    expect(container.querySelector('[aria-live="polite"]')?.textContent).toMatch(
      /history will start empty\. The trip you just finished will then be saved to history again\./,
    );

    await user.click(screen.getByRole("button", { name: "Set aside now" }));

    expect(controller.getSnapshot()).toMatchObject({
      lifecycle: "completed-summary",
      historyIntegrity: { status: "healthy" },
      completedTrips: [{ id: "trip-1", actualCheckoutMinor: 900 }],
    });
    expect(document.activeElement).toBe(screen.getByRole("status"));
    expect(controller.dismissCompletedSummary().ok).toBe(true);
  });

  it("offers a retry from the summary when history could not be read", async () => {
    const user = userEvent.setup();
    const values = new Map<string, string>();
    const control = { failHistoryRead: false };
    const controller = boot({
      getItem: (key) => {
        if (key === HISTORY_STORAGE_KEY && control.failHistoryRead) {
          throw new Error("read failed");
        }

        return values.get(key) ?? null;
      },
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });
    controller.startTrip({ budgetMinor: money(1_000) });
    controller.completeTrip();
    control.failHistoryRead = true;
    controller.setActualCheckout(money(900));

    render(<HistoryIntegrityNotice controller={controller} />);

    expect(screen.queryByRole("button", { name: "Set aside…" })).toBeNull();

    control.failHistoryRead = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(controller.getSnapshot()).toMatchObject({
      lifecycle: "completed-summary",
      historyIntegrity: { status: "healthy" },
      completedTrips: [{ id: "trip-1" }],
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Saved trip history was read successfully.",
    );
  });

  it("forgets an earlier confirmation when history breaks again", async () => {
    const user = userEvent.setup();
    const { storage, values } = memoryStorage({
      [HISTORY_STORAGE_KEY]: partlyDamagedHistory(),
    });
    const controller = boot(storage);

    render(<HistoryIntegrityNotice controller={controller} />);

    await user.click(screen.getByRole("button", { name: "Set aside…" }));
    await user.click(screen.getByRole("button", { name: "Set aside now" }));

    expect(screen.getByRole("status").textContent).toMatch(/backup copy/);

    values.set(HISTORY_STORAGE_KEY, partlyDamagedHistory());
    act(() => {
      controller.deleteCompletedTrip("trip-kept" as never);
    });

    expect(controller.getSnapshot().historyIntegrity.status).toBe("degraded");
    expect(screen.queryByRole("button", { name: "Set aside now" })).toBeNull();
    expect(screen.getByRole("button", { name: "Set aside…" })).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("returns focus to the arming control when a set-aside fails", async () => {
    const user = userEvent.setup();
    const values = new Map([[HISTORY_STORAGE_KEY, partlyDamagedHistory()]]);
    const controller = boot({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key.startsWith(SET_ASIDE_STORAGE_KEY_PREFIX)) {
          throw new Error("quota");
        }

        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });

    render(<HistoryIntegrityNotice controller={controller} />);

    await user.click(screen.getByRole("button", { name: "Set aside…" }));
    await user.click(screen.getByRole("button", { name: "Set aside now" }));

    expect(screen.getByRole("status").textContent).toBe(
      "History could not be set aside safely, so it was left unchanged.",
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Set aside…" }),
    );
  });

  it("renders nothing while history is readable", () => {
    const controller = boot(memoryStorage({}).storage);
    const { container } = render(
      <HistoryIntegrityNotice controller={controller} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("offers a retry instead of a set-aside when history could not be read", async () => {
    const user = userEvent.setup();
    let fail = true;
    const values = new Map([[HISTORY_STORAGE_KEY, partlyDamagedHistory()]]);
    const controller = boot({
      getItem: (key) => {
        if (key === HISTORY_STORAGE_KEY && fail) {
          throw new Error("read failed");
        }

        return values.get(key) ?? null;
      },
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });

    render(<HistoryIntegrityNotice controller={controller} />);

    expect(screen.queryByRole("button", { name: "Set aside…" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      screen.getByText("History still can't be read. Nothing was changed."),
    ).not.toBeNull();

    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(controller.getSnapshot().historyIntegrity).toMatchObject({
      status: "degraded",
      issue: { code: "invalid-history-entry" },
    });
    expect(screen.getByRole("button", { name: "Set aside…" })).not.toBeNull();
  });
});

describe("FinishTripSurface failure copy", () => {
  const trip = must(
    createActiveTrip({ id: "t", budgetMinor: money(1_000), startedAt: START }),
  );

  it.each([
    ["history-unreadable", /needs attention before this trip can be added/],
    ["not-saved", /Trip history could not be saved/],
  ] as const)("explains %s accurately", async (failure, message) => {
    const user = userEvent.setup();

    render(
      <FinishTripSurface
        trip={trip}
        onCancel={vi.fn()}
        onConfirm={() => failure}
        historyNotice={<p>history notice</p>}
        historyNeedsAttention
      />,
    );

    await user.click(screen.getByRole("button", { name: "Finish trip" }));

    expect(screen.getByRole("alert").textContent).toMatch(message);
  });

  it("drops the history failure once the history notice is resolved", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FinishTripSurface
        trip={trip}
        onCancel={vi.fn()}
        onConfirm={() => "history-unreadable"}
        historyNotice={<p>history notice</p>}
        historyNeedsAttention
      />,
    );

    await user.click(screen.getByRole("button", { name: "Finish trip" }));
    expect(screen.queryByRole("alert")).not.toBeNull();

    rerender(
      <FinishTripSurface
        trip={trip}
        onCancel={vi.fn()}
        onConfirm={() => "history-unreadable"}
        historyNotice={<p>history notice</p>}
        historyNeedsAttention={false}
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("session-only mode keeps a single honest notice", () => {
  it("does not repeat a history warning the shopper cannot act on", () => {
    const controller = boot(null);
    controller.continueWithoutSaving();

    const { container } = render(
      <HistoryIntegrityNotice controller={controller} />,
    );

    expect(controller.getSnapshot().historyIntegrity.status).toBe("degraded");
    expect(container.innerHTML).toBe("");
  });
});

describe("session-only mode never asks to repair what it chose not to save", () => {
  it("offers no price-memory repair when storage itself is unavailable", async () => {
    const user = userEvent.setup();
    const controller = boot(null);

    render(<ShoppingAppShell controller={controller} />);

    await screen.findByRole("button", { name: "Continue without saving" });
    await user.click(
      screen.getByRole("button", { name: "Continue without saving" }),
    );

    expect(
      screen.getByRole("heading", { name: "How much can you spend today?" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Repair remembered prices" }),
    ).toBeNull();
  });

  it("keeps price-memory repair and history changes out of a session-only run", async () => {
    const user = userEvent.setup();
    const remembered = must(
      createPriceMemoryRecord({
        label: "Bread",
        unitPriceMinor: money(199),
        observedAt: START,
        source: { kind: "manual" },
      }),
    );
    const memory = encodePriceMemorySnapshot([remembered], START);
    const history = encodeHistorySnapshot([completedTrip("trip-kept")], START);

    if (!memory.ok || !history.ok) {
      throw new Error("Expected encodable records");
    }

    const { values, storage } = memoryStorage({
      [ACTIVE_TRIP_STORAGE_KEY]: "{broken",
      [HISTORY_STORAGE_KEY]: history.raw,
      [PRICE_MEMORY_STORAGE_KEY]: memory.raw,
    });
    const before = new Map(values);
    const controller = boot(storage);

    render(<ShoppingAppShell controller={controller} />);

    await screen.findByRole("button", { name: "Continue without saving" });
    await user.click(
      screen.getByRole("button", { name: "Continue without saving" }),
    );

    expect(
      screen.queryByRole("button", { name: "Repair remembered prices" }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "View trip history · 1" }),
    );

    expect(
      (await screen.findByText(/This session is not saving/)).textContent,
    ).toMatch(/stay as they are/);
    expect(
      screen.queryByText("Fix the local-save warning before changing trip history."),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Clear remembered prices/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: /Clear trip history/ })
        .hasAttribute("disabled"),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Back" }));
    controller.startTrip({ budgetMinor: money(2_000) });

    expect(await screen.findByText("Bread")).not.toBeNull();
    expect(screen.queryByText(/not safely saving/)).toBeNull();
    expect(screen.queryByText(/still saved independently/)).toBeNull();
    expect(values).toEqual(before);
  });
});

describe("PersistenceHealthNotice session-only copy", () => {
  it("explains session-only mode without a pointless retry", () => {
    const controller = boot(null);
    controller.continueWithoutSaving();

    render(
      <PersistenceHealthNotice
        controller={controller}
        health={controller.getSnapshot().persistence}
        context="idle"
      />,
    );

    expect(screen.getByText("Not saving on this device")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});

describe("trip overlays belong to their trip", () => {
  it("never reopens a finish surface over the next trip once its trip is gone", async () => {
    const user = userEvent.setup();
    const open = withItem(
      must(createActiveTrip({ id: "trip-open", budgetMinor: money(3_000), startedAt: START })),
    );
    const completed = must(
      reduceTrip(open, { type: "complete-trip", completedAt: time(START) }),
    );

    if (completed.status !== "completed") {
      throw new Error("Expected completed trip");
    }

    const history = encodeHistorySnapshot([completed], START);
    const active = encodeActiveTripSnapshot(open, START);

    if (!history.ok || !active.ok) {
      throw new Error("Expected encodable records");
    }

    const values = new Map([
      [ACTIVE_TRIP_STORAGE_KEY, active.raw],
      [HISTORY_STORAGE_KEY, history.raw],
    ]);
    const control = { failHistoryRead: true };
    const storage: StorageLike = {
      getItem(key) {
        if (key === HISTORY_STORAGE_KEY && control.failHistoryRead) {
          throw new Error("read failed");
        }

        return values.get(key) ?? null;
      },
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    const controller = boot(storage);

    render(<ShoppingAppShell controller={controller} />);

    await user.click(screen.getByRole("button", { name: /Finish trip/ }));
    const finish = await screen.findByRole("main", { name: "Ready to finish this trip?" });

    control.failHistoryRead = false;
    await user.click(within(finish).getByRole("button", { name: "Retry" }));

    expect(controller.getSnapshot().lifecycle).toBe("idle");
    const heading = screen.getByRole("heading", {
      name: "How much can you spend today?",
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(heading);
    });

    act(() => {
      controller.startTrip({ budgetMinor: money(2_000) });
    });

    expect(
      screen.queryByRole("main", { name: "Ready to finish this trip?" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /Finish trip/ })).not.toBeNull();
  });
});

describe("finishing a trip edited after its completion was recorded", () => {
  it("keeps the finish surface and its failure in view when the new id cannot be recorded", async () => {
    const user = userEvent.setup();
    const recorded = withItem(
      must(createActiveTrip({ id: "trip-open", budgetMinor: money(3_000), startedAt: START })),
    );
    const completed = must(
      reduceTrip(recorded, { type: "complete-trip", completedAt: time(START) }),
    );

    if (completed.status !== "completed") {
      throw new Error("Expected completed trip");
    }

    const edited = must(
      reduceTrip(recorded, { type: "set-budget", budgetMinor: money(3_500) }),
    );

    if (edited.status !== "active") {
      throw new Error("Expected active trip");
    }

    const history = encodeHistorySnapshot([completed], START);
    const active = encodeActiveTripSnapshot(edited, START);

    if (!history.ok || !active.ok) {
      throw new Error("Expected encodable records");
    }

    const values = new Map([
      [ACTIVE_TRIP_STORAGE_KEY, active.raw],
      [HISTORY_STORAGE_KEY, history.raw],
    ]);
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key === HISTORY_STORAGE_KEY) {
          throw new Error("quota");
        }

        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    const controller = boot(storage);

    render(<ShoppingAppShell controller={controller} />);

    await user.click(screen.getByRole("button", { name: /Finish trip/ }));
    const finish = await screen.findByRole("main", { name: "Ready to finish this trip?" });
    const confirm = within(finish).getByRole("button", { name: "Finish trip" });
    await user.click(confirm);

    expect(controller.getSnapshot()).toMatchObject({
      lifecycle: "active",
      activeTrip: { id: "trip-1", budgetMinor: 3_500 },
    });
    expect(
      await screen.findByRole("main", { name: "Ready to finish this trip?" }),
    ).toBe(finish);
    expect(within(finish).getByRole("alert")).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe("PersistenceHealthNotice after a successful retry", () => {
  it("shows and focuses the saved outcome instead of dropping focus", async () => {
    const user = userEvent.setup();
    const values = new Map<string, string>();
    const control = { failActiveWrite: true };
    const controller = boot({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key === ACTIVE_TRIP_STORAGE_KEY && control.failActiveWrite) {
          throw new Error("quota");
        }

        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });
    controller.startTrip({ budgetMinor: money(1_000) });

    const Harness = () => {
      const state = useShoppingAppState(controller);
      return (
        <PersistenceHealthNotice
          controller={controller}
          health={state.persistence}
          context="active"
        />
      );
    };

    render(<Harness />);

    control.failActiveWrite = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    const saved = screen.getByRole("status");
    expect(saved.textContent).toBe("Saving works again.");
    expect(document.activeElement).toBe(saved);
    expect(values.has(ACTIVE_TRIP_STORAGE_KEY)).toBe(true);
  });
});

describe("history with a damaged entry", () => {
  it("still lets the shopper shop again from a readable trip", async () => {
    const user = userEvent.setup();
    const { storage } = memoryStorage({
      [HISTORY_STORAGE_KEY]: partlyDamagedHistory(),
    });
    const controller = boot(storage);

    render(<ShoppingAppShell controller={controller} />);

    await user.click(screen.getByRole("button", { name: /View trip history/ }));
    const shopAgain = await screen.findByRole("button", { name: "Shop again" });

    expect((shopAgain as HTMLButtonElement).disabled).toBe(false);

    await user.click(shopAgain);

    expect(controller.getSnapshot()).toMatchObject({
      lifecycle: "active",
      historyIntegrity: { status: "degraded" },
    });
  });
});

describe("shell flow with damaged history", () => {
  it("lets the shopper set history aside from the finish surface and finish", async () => {
    const user = userEvent.setup();
    const { storage } = memoryStorage({
      [HISTORY_STORAGE_KEY]: partlyDamagedHistory(),
    });
    const controller = boot(storage);
    controller.startTrip({ budgetMinor: money(2_000) });
    controller.addManualItem({ unitPriceMinor: money(399), quantity: 1 });

    render(<ShoppingAppShell controller={controller} />);

    await user.click(screen.getByRole("button", { name: /Finish trip/ }));
    const finish = await screen.findByRole("main", { name: "Ready to finish this trip?" });
    await user.click(within(finish).getByRole("button", { name: "Finish trip" }));

    expect(within(finish).getByRole("alert").textContent).toMatch(
      /needs attention/,
    );

    await user.click(within(finish).getByRole("button", { name: "Set aside…" }));
    await user.click(
      within(finish).getByRole("button", { name: "Set aside now" }),
    );

    expect(within(finish).queryByRole("alert")).toBeNull();

    await user.click(within(finish).getByRole("button", { name: "Finish trip" }));

    expect(controller.getSnapshot().lifecycle).toBe("completed-summary");
    expect(controller.getSnapshot().completedTrips).toHaveLength(2);
  });
});
