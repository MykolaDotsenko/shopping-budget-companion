import { render, screen, waitFor } from "@testing-library/react";
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
  type CartItem,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import { ActiveTripScreen } from "../src/features/shopping/ActiveTripScreen";

const START = "2026-09-21T09:00:00.000Z";
const NEXT = "2026-09-21T09:05:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected successful Result");
  }

  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));

const clock: Clock = {
  now: () => time(NEXT),
};

const ids: IdGenerator = {
  tripId: () => "trip-active-screen",
  itemId: () => "item-active-screen",
};

const createItem = ({
  id,
  price,
  quantity = 1,
  label,
  estimated = false,
}: {
  readonly id: string;
  readonly price: number;
  readonly quantity?: number;
  readonly label?: string;
  readonly estimated?: boolean;
}): CartItem =>
  unwrap(
    createCartItem({
      id,
      unitPriceMinor: money(price),
      quantity,
      ...(label === undefined ? {} : { label }),
      priceSource: { kind: "manual" },
      priceConfidence: estimated
        ? { kind: "estimated", reason: "other" }
        : { kind: "confirmed", confirmedAt: time(START) },
      createdAt: START,
    }),
  );

const createTrip = ({
  budget = 5_000,
  buffer = 0,
  items = [],
}: {
  readonly budget?: number;
  readonly buffer?: number;
  readonly items?: readonly CartItem[];
} = {}): ActiveTrip => {
  let trip: ActiveTrip = unwrap(
    createActiveTrip({
      id: "trip-active-screen",
      budgetMinor: money(budget),
      safetyBufferMinor: money(buffer),
      startedAt: START,
    }),
  );

  for (const item of items) {
    const result = reduceTrip(trip, {
      type: "add-item",
      item,
    });

    expect(result.ok).toBe(true);

    if (!result.ok || result.value.status !== "active") {
      throw new Error("Expected active trip after adding fixture item");
    }

    trip = result.value;
  }

  return trip;
};

const createController = (trip: ActiveTrip) => {
  const controller = createShoppingAppController({
    persistence: {
      bootstrap: () => ({
        ok: true,
        activeTrip: trip,
        completedTrips: [],
        completionCleanupPending: false,
      }),
      save: () => ({ ok: true }),
      complete: () => ({ ok: true }),
      saveCompleted: () => ({ ok: true }),
      replaceCompletedHistory: () => ({ ok: true }),
      clearCompletedActive: () => ({ ok: true }),
      readCompletedHistory: () => ({ ok: true, completedTrips: [] }),
      setAsideDamagedHistory: () => ({ ok: true, completedTrips: [] }),
      setAsideUnreadableActiveTrip: () => ({ ok: true }),
    },
    clock,
    ids,
  });

  controller.bootstrap();
  return controller;
};

const renderScreen = (
  trip: ActiveTrip,
  onAddPrice = vi.fn(),
) => {
  render(
    <ActiveTripScreen
      controller={createController(trip)}
      onAddPrice={onAddPrice}
      locale="en-IE"
    />,
  );

  return { onAddPrice };
};

describe("ActiveTripScreen", () => {
  it("makes remaining money and Add price dominant for an empty trip", async () => {
    const user = userEvent.setup();
    const { onAddPrice } = renderScreen(createTrip());

    expect(screen.getByText("€50.00")).not.toBeNull();
    expect(screen.getByText("left")).not.toBeNull();
    expect(
      screen.getByText("€0.00 of €50.00"),
    ).not.toBeNull();
    expect(
      screen.getByText("Nothing in your cart yet."),
    ).not.toBeNull();

    const addPrice = screen.getByRole("button", { name: "Add price" });
    expect(addPrice).not.toBeNull();

    await user.click(addPrice);
    expect(onAddPrice).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared appearance and camera utility surface visible during an active trip", () => {
    render(
      <ActiveTripScreen
        controller={createController(createTrip())}
        onAddPrice={vi.fn()}
        utilityControl={<div data-testid="shopping-utilities">Utilities</div>}
        locale="en-IE"
      />,
    );

    expect(screen.getByTestId("shopping-utilities")).not.toBeNull();
  });

  it("uses safe remaining as the hero when a safety buffer is active", () => {
    const trip = createTrip({
      buffer: 200,
      items: [
        createItem({
          id: "basket",
          price: 3_142,
          label: "Current basket",
        }),
      ],
    });

    renderScreen(trip);

    expect(screen.getByText("€16.58")).not.toBeNull();
    expect(screen.getByText("safe to spend")).not.toBeNull();
    expect(
      screen.getByText("€31.42 of €50.00"),
    ).not.toBeNull();
    expect(screen.getByText("plus a €2.00 safety buffer")).not.toBeNull();

    const progress = screen.getByRole("progressbar", {
      name: "Shopping budget used",
    });

    expect(progress.getAttribute("aria-valuetext")).toBe(
      "€31.42 in cart of €50.00. €16.58 safe to spend, plus a €2.00 safety buffer.",
    );
    expect(progress.getAttribute("data-status")).toBe("within");
    expect(screen.getByText("Safe limit €48.00")).not.toBeNull();
    expect(screen.getByText("Safety buffer €2.00")).not.toBeNull();
  });

  it("distinguishes using the reserve from exceeding the nominal budget", () => {
    const trip = createTrip({
      buffer: 200,
      items: [
        createItem({
          id: "near-limit",
          price: 4_900,
        }),
      ],
    });

    renderScreen(trip);

    expect(screen.getByText("€0.00")).not.toBeNull();
    expect(screen.getByText("safe to spend")).not.toBeNull();
    expect(
      screen.getByText("€1.00 of your €2.00 safety buffer left"),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("progressbar", { name: "Shopping budget used" })
        .getAttribute("data-status"),
    ).toBe("reserve");
  });

  it("shows exact nominal overage instead of a misleading negative remaining label", () => {
    const trip = createTrip({
      buffer: 200,
      items: [
        createItem({
          id: "over-budget",
          price: 5_341,
        }),
      ],
    });

    renderScreen(trip);

    expect(screen.getByText("€3.41")).not.toBeNull();
    expect(screen.getByText("over your limit")).not.toBeNull();
    expect(screen.queryByText(/safety buffer/)).toBeNull();

    const progress = screen.getByRole("progressbar", {
      name: "Shopping budget used",
    });

    expect(progress.getAttribute("data-status")).toBe("over");
    expect(progress.getAttribute("aria-valuetext")).toBe(
      "€53.41 in cart of €50.00. €3.41 over your limit.",
    );
  });

  it("shows the remaining amount once, without repeating it or the budget labels", () => {
    renderScreen(
      createTrip({
        items: [createItem({ id: "bread", price: 2_363 })],
      }),
    );

    expect(screen.getAllByText("€26.37")).toHaveLength(1);
    expect(screen.getByText("left")).not.toBeNull();
    expect(screen.getByText("€23.63 of €50.00")).not.toBeNull();
    expect(screen.queryByText(/available before/)).toBeNull();
    expect(screen.queryByText(/^Budget €/)).toBeNull();
  });

  it("renders cart lines from canonical item data without requiring labels", () => {
    const trip = createTrip({
      items: [
        createItem({
          id: "milk",
          price: 129,
          quantity: 3,
          label: "Milk",
        }),
        createItem({
          id: "unlabelled",
          price: 450,
          estimated: true,
        }),
      ],
    });

    renderScreen(trip);

    expect(screen.getByText("Milk")).not.toBeNull();
    expect(screen.getByText("€1.29 × 3")).not.toBeNull();
    expect(screen.getByText("€3.87")).not.toBeNull();
    expect(screen.getByText("Item 2")).not.toBeNull();
    expect(screen.getByText("Estimated · Manual")).not.toBeNull();
    expect(screen.getByText("4 items")).not.toBeNull();
  });

  it("keeps budget adjustment secondary to Add price and emits an explicit intent", async () => {
    const user = userEvent.setup();
    const onAdjustBudget = vi.fn();

    render(
      <ActiveTripScreen
        controller={createController(createTrip())}
        onAddPrice={vi.fn()}
        onAdjustBudget={onAdjustBudget}
        locale="en-IE"
      />,
    );

    const addPrice = screen.getByRole("button", { name: "Add price" });
    const adjustBudget = screen.getByRole("button", { name: "Adjust budget" });

    expect(addPrice.className).not.toBe(adjustBudget.className);

    await user.click(adjustBudget);
    expect(onAdjustBudget).toHaveBeenCalledTimes(1);
  });

  it("keeps Finish trip secondary to Add price and emits an explicit finish intent", async () => {
    const user = userEvent.setup();
    const onAddPrice = vi.fn();
    const onFinishTrip = vi.fn();

    render(
      <ActiveTripScreen
        controller={createController(createTrip())}
        onAddPrice={onAddPrice}
        onFinishTrip={onFinishTrip}
        locale="en-IE"
      />,
    );

    const addPrice = screen.getByRole("button", { name: "Add price" });
    const finishTrip = screen.getByRole("button", {
      name: "Finish trip",
    });

    expect(addPrice.className).not.toBe(finishTrip.className);

    await user.click(finishTrip);

    expect(onFinishTrip).toHaveBeenCalledTimes(1);
    expect(onAddPrice).not.toHaveBeenCalled();
  });

  it("exposes edit and remove as secondary correction actions", async () => {
    const user = userEvent.setup();
    const item = createItem({
      id: "correctable",
      price: 479,
    });
    const onEditItem = vi.fn();
    const onRemoveItem = vi.fn();

    render(
      <ActiveTripScreen
        controller={createController(createTrip({ items: [item] }))}
        onAddPrice={vi.fn()}
        onEditItem={onEditItem}
        onRemoveItem={onRemoveItem}
        locale="en-IE"
      />,
    );

    expect(screen.queryByText("Confirmed · Manual")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit Item 1" }));
    expect(onEditItem).toHaveBeenCalledWith(item);

    await user.click(screen.getByRole("button", { name: "Remove Item 1" }));
    expect(onRemoveItem).toHaveBeenCalledWith(item);
  });

  it("keeps one-action Undo beside committed feedback", async () => {
    const user = userEvent.setup();
    const controller = createController(createTrip());
    const added = controller.addManualItem({
      unitPriceMinor: money(479),
      quantity: 1,
    });

    expect(added.ok).toBe(true);

    const onUndo = vi.fn();

    render(
      <ActiveTripScreen
        controller={controller}
        onAddPrice={vi.fn()}
        onUndo={onUndo}
        feedbackMessage="€4.79 added. €45.21 remaining."
        locale="en-IE"
      />,
    );

    expect(
      screen.getByText("€4.79 added. €45.21 remaining."),
    ).not.toBeNull();

    const undo = screen.getByRole("button", { name: "Undo" });
    await user.click(undo);

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("reacts to controller state changes through the canonical external-store bridge", async () => {
    const controller = createController(createTrip());
    const onAddPrice = vi.fn();

    render(
      <ActiveTripScreen
        controller={controller}
        onAddPrice={onAddPrice}
        locale="en-IE"
      />,
    );

    expect(screen.getByText("€50.00")).not.toBeNull();

    const result = controller.dispatch({
      type: "set-buffer",
      safetyBufferMinor: money(500),
    });

    expect(result.ok).toBe(true);

    await waitFor(() => {
      expect(screen.getByText("€45.00")).not.toBeNull();
      expect(screen.getByText("safe to spend")).not.toBeNull();
    });
  });
});
