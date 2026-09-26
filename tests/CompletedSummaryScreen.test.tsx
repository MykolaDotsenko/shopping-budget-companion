import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  createShoppingAppController,
  type Clock,
  type IdGenerator,
} from "../src/application/shopping-app-controller";
import { mvpMinorUnits, type Result } from "../src/domain/money";
import {
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  reduceTrip,
  type ActiveTrip,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import { CompletedSummaryScreen } from "../src/features/shopping/CompletedSummaryScreen";

const START = "2026-09-21T09:00:00.000Z";
const ADD = "2026-09-21T09:05:00.000Z";
const COMPLETE = "2026-09-21T09:10:00.000Z";
const RECONCILE = "2026-09-21T09:12:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected successful Result");
  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));

const createTrip = (): ActiveTrip => {
  const base = unwrap(
    createActiveTrip({
      id: "summary-trip",
      budgetMinor: money(5_000),
      startedAt: START,
    }),
  );
  const item = unwrap(
    createCartItem({
      id: "summary-item",
      unitPriceMinor: money(479),
      quantity: 1,
      priceSource: { kind: "manual" },
      priceConfidence: {
        kind: "confirmed",
        confirmedAt: time(ADD),
      },
      createdAt: ADD,
    }),
  );
  const result = unwrap(
    reduceTrip(base, { type: "add-item", item }),
  );
  if (result.status !== "active") throw new Error("Expected active");
  return result;
};

const createClock = (): Clock => {
  const values = [time(COMPLETE), time(RECONCILE)];
  let index = 0;
  return {
    now() {
      const value = values[Math.min(index, values.length - 1)];
      if (value === undefined) throw new Error("Missing clock value");
      index += 1;
      return value;
    },
  };
};

const ids: IdGenerator = {
  tripId: () => "unused-trip",
  itemId: () => "unused-item",
};

const createController = (
  completedSaveResult:
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly issue: {
          readonly code: string;
          readonly storageKey?: string;
        };
      } = { ok: true },
) => {
  const controller = createShoppingAppController({
    persistence: {
      bootstrap: () => ({
        ok: true,
        activeTrip: createTrip(),
        completedTrips: [],
        completionCleanupPending: false,
      }),
      save: () => ({ ok: true }),
      complete: () => ({ ok: true }),
      saveCompleted: () => completedSaveResult,
      replaceCompletedHistory: () => ({ ok: true }),
      clearCompletedActive: () => ({ ok: true }),
      readCompletedHistory: () => ({ ok: true, completedTrips: [] }),
      setAsideDamagedHistory: () => ({ ok: true, completedTrips: [] }),
      setAsideUnreadableActiveTrip: () => ({ ok: true }),
    },
    clock: createClock(),
    ids,
  });

  controller.bootstrap();
  const completed = controller.completeTrip();
  expect(completed.ok).toBe(true);

  const trip = controller.getSnapshot().completedSummary;
  if (trip === null) throw new Error("Expected completed summary");

  return { controller, trip };
};

describe("CompletedSummaryScreen", () => {
  it("keeps the receipt total optional without pre-filling or nagging", () => {
    const { controller, trip } = createController();

    render(
      <CompletedSummaryScreen
        controller={controller}
        trip={trip}
        onDone={vi.fn()}
        onShopAgain={vi.fn()}
        onViewHistory={vi.fn()}
        locale="en-IE"
      />,
    );

    expect(screen.getByText("€4.79")).not.toBeNull();
    const receipt = screen.getByRole("textbox", { name: "Receipt total" });
    expect((receipt as HTMLInputElement).value).toBe("");
    expect(receipt.getAttribute("placeholder")).toBe("0.00");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("states how the finished trip ended against its budget", () => {
    const { controller, trip } = createController();

    render(
      <CompletedSummaryScreen
        controller={controller}
        trip={trip}
        onDone={vi.fn()}
        onShopAgain={vi.fn()}
        onViewHistory={vi.fn()}
        locale="en-IE"
      />,
    );

    const outcome = screen.getByText("€45.21 under budget");

    expect(outcome.getAttribute("data-outcome")).toBe("under");
  });

  it("judges the budget on what was paid once the receipt total is in", async () => {
    const user = userEvent.setup();
    const { controller, trip } = createController();

    render(
      <CompletedSummaryScreen
        controller={controller}
        trip={trip}
        onDone={vi.fn()}
        onShopAgain={vi.fn()}
        onViewHistory={vi.fn()}
        locale="en-IE"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Receipt total" }), "53.17");
    await user.click(screen.getByRole("button", { name: "Save receipt total" }));

    const outcome = screen.getByText("Paid €3.17 over budget");
    expect(outcome.getAttribute("data-outcome")).toBe("over");
  });

  it("starts a fresh trip from the completed budget in one action", async () => {
    const user = userEvent.setup();
    const { controller, trip } = createController();
    const onShopAgain = vi.fn();

    render(
      <CompletedSummaryScreen
        controller={controller}
        trip={trip}
        onDone={vi.fn()}
        onShopAgain={onShopAgain}
        onViewHistory={vi.fn()}
        locale="en-IE"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Shop again" }));

    expect(onShopAgain).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      lifecycle: "active",
      completedSummary: null,
      activeTrip: {
        id: "unused-trip",
        budgetMinor: 5_000,
        safetyBufferMinor: 0,
        items: [],
        startedAt: RECONCILE,
      },
    });
    expect(controller.getSnapshot().completedTrips).toHaveLength(1);
  });

  it("persists actual checkout and derives the exact reconciliation difference", async () => {
    const user = userEvent.setup();
    const { controller, trip } = createController();

    render(
      <CompletedSummaryScreen
        controller={controller}
        trip={trip}
        onDone={vi.fn()}
        onShopAgain={vi.fn()}
        onViewHistory={vi.fn()}
        locale="en-IE"
      />,
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Receipt total",
      }),
      "5.00",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save receipt total",
      }),
    );

    expect(
      screen.getByText("You paid €0.21 more than your cart total."),
    ).not.toBeNull();
    expect(screen.getByText("Receipt total saved.")).not.toBeNull();
    expect(
      controller.getSnapshot().completedSummary?.actualCheckoutMinor,
    ).toBe(500);
    expect(
      controller.getSnapshot().completedTrips[0]?.actualCheckoutMinor,
    ).toBe(500);
  });

  it("blocks Shop again while completed history has unsaved changes", async () => {
    const user = userEvent.setup();
    const { controller, trip } = createController({
      ok: false,
      issue: {
        code: "write-failed",
        storageKey: "budget-cart:history",
      },
    });
    const onShopAgain = vi.fn();

    render(
      <CompletedSummaryScreen
        controller={controller}
        trip={trip}
        onDone={vi.fn()}
        onShopAgain={onShopAgain}
        onViewHistory={vi.fn()}
        locale="en-IE"
      />,
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Receipt total",
      }),
      "5.00",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save receipt total",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Shop again" }));

    expect(onShopAgain).not.toHaveBeenCalled();
    expect(controller.getSnapshot().lifecycle).toBe("completed-summary");
    expect(
      screen.getByText(
        "Retry saving before starting another trip from this budget.",
      ),
    ).not.toBeNull();
  });

  it("never calls Done navigation when persistence is still degraded", async () => {
    const user = userEvent.setup();
    const { controller, trip } = createController({
      ok: false,
      issue: {
        code: "write-failed",
        storageKey: "budget-cart:history",
      },
    });
    const onDone = vi.fn();

    render(
      <CompletedSummaryScreen
        controller={controller}
        trip={trip}
        onDone={onDone}
        onShopAgain={vi.fn()}
        onViewHistory={vi.fn()}
        locale="en-IE"
      />,
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Receipt total",
      }),
      "5.00",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save receipt total",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onDone).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Retry saving before leaving this completed-trip summary.",
      ),
    ).not.toBeNull();
  });
});
