import { render, screen, within } from "@testing-library/react";
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
  isoTimestamp,
  reduceTrip,
  type CompletedTrip,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import { HistoryScreen } from "../src/features/shopping/HistoryScreen";

const START = "2026-09-20T09:00:00.000Z";
const FIRST_COMPLETE = "2026-09-20T10:00:00.000Z";
const SECOND_COMPLETE = "2026-09-21T10:00:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected successful Result");
  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));

const completedTrip = (
  id: string,
  completedAt: string,
  budget: number,
  actual?: number,
): CompletedTrip => {
  const active = unwrap(
    createActiveTrip({
      id,
      budgetMinor: money(budget),
      startedAt: START,
    }),
  );
  const completed = unwrap(
    reduceTrip(active, {
      type: "complete-trip",
      completedAt: time(completedAt),
    }),
  );
  if (completed.status !== "completed") throw new Error("Expected completed");
  if (actual === undefined) return completed;
  const reconciled = unwrap(
    reduceTrip(completed, {
      type: "set-actual-checkout",
      actualCheckoutMinor: money(actual),
    }),
  );
  if (reconciled.status !== "completed") throw new Error("Expected completed");
  return reconciled;
};

const clock: Clock = { now: () => time(SECOND_COMPLETE) };
const ids: IdGenerator = {
  tripId: () => "unused",
  itemId: () => "unused",
};

const createController = (trips: readonly CompletedTrip[]) => {
  const controller = createShoppingAppController({
    persistence: {
      bootstrap: () => ({
        ok: true,
        activeTrip: null,
        completedTrips: trips,
        completionCleanupPending: false,
      }),
      save: () => ({ ok: true }),
      complete: () => ({ ok: true }),
      saveCompleted: () => ({ ok: true }),
      replaceCompletedHistory: () => ({ ok: true }),
      clearCompletedActive: () => ({ ok: true }),
      readCompletedHistory: () => ({ ok: true, completedTrips: trips }),
      setAsideDamagedHistory: () => ({ ok: true, completedTrips: [] }),
      setAsideUnreadableActiveTrip: () => ({ ok: true }),
    },
    clock,
    ids,
  });
  controller.bootstrap();
  return controller;
};

describe("HistoryScreen", () => {
  it("shows shopping-focused history without mutating source order", () => {
    const older = completedTrip(
      "older",
      FIRST_COMPLETE,
      2_500,
      2_400,
    );
    const newer = completedTrip(
      "newer",
      SECOND_COMPLETE,
      5_000,
    );
    const trips = [older, newer] as const;
    const controller = createController(trips);

    render(
      <HistoryScreen
        controller={controller}
        onBack={vi.fn()}
        locale="en-IE"
      />,
    );

    const tracked = screen.getAllByText("€0.00 cart total");
    expect(tracked).toHaveLength(2);
    expect(screen.getByText("€25.00")).not.toBeNull();
    expect(screen.getByText("€50.00")).not.toBeNull();
    expect(screen.getByText("€24.00")).not.toBeNull();
    expect(screen.getByText("Paid €1.00 under budget")).not.toBeNull();
    expect(screen.getByText("€50.00 under budget")).not.toBeNull();
    expect(
      screen.getByText("Paid €24.00 more"),
    ).not.toBeNull();
    expect(trips[0]).toBe(older);
    expect(trips[1]).toBe(newer);
  });

  it("starts a similar trip directly from history", async () => {
    const user = userEvent.setup();
    const source = completedTrip("source", SECOND_COMPLETE, 5_000);
    const controller = createController([source]);
    const onTripStarted = vi.fn();

    render(
      <HistoryScreen
        controller={controller}
        onBack={vi.fn()}
        onTripStarted={onTripStarted}
        locale="en-IE"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Shop again" }),
    );

    expect(controller.getSnapshot().lifecycle).toBe("active");
    expect(controller.getSnapshot().activeTrip).toMatchObject({
      budgetMinor: 5_000,
      safetyBufferMinor: 0,
    });
    expect(onTripStarted).toHaveBeenCalledTimes(1);
  });

  it("requires explicit confirmation before deleting a trip", async () => {
    const user = userEvent.setup();
    const older = completedTrip("older", FIRST_COMPLETE, 2_500);
    const newer = completedTrip("newer", SECOND_COMPLETE, 5_000);
    const controller = createController([older, newer]);

    render(
      <HistoryScreen
        controller={controller}
        onBack={vi.fn()}
        locale="en-IE"
      />,
    );

    const deleteButtons = screen.getAllByRole("button", {
      name: "Delete trip",
    });
    expect(deleteButtons).toHaveLength(2);

    await user.click(deleteButtons[1]!);
    expect(
      screen.getByText(/Remembered item prices are stored separately/),
    ).not.toBeNull();

    const confirmation = screen.getByRole("region", {
      name: "Confirm trip deletion",
    });
    expect(deleteButtons[1]!.getAttribute("aria-expanded")).toBe("true");
    await user.click(
      within(confirmation).getByRole("button", { name: "Yes, delete" }),
    );

    expect(controller.getSnapshot().completedTrips).toEqual([newer]);
    expect(
      screen.getByText("Trip deleted from this device."),
    ).not.toBeNull();
  });

  it("returns focus to the data control after cancelling confirmation", async () => {
    const user = userEvent.setup();
    const controller = createController([
      completedTrip("one", FIRST_COMPLETE, 2_500),
    ]);

    render(
      <HistoryScreen
        controller={controller}
        onBack={vi.fn()}
        locale="en-IE"
      />,
    );

    const clearHistoryButton = screen.getByRole("button", {
      name: /Clear trip history/,
    });

    await user.click(clearHistoryButton);
    const confirmation = screen.getByRole("region", {
      name: "Confirm clearing trip history",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /Clear trip history/ }),
    );
  });

  it("provides a single explicit Back action", async () => {
    const user = userEvent.setup();
    const trips = [
      completedTrip("one", FIRST_COMPLETE, 2_500),
    ];
    const controller = createController(trips);
    const onBack = vi.fn();

    render(
      <HistoryScreen
        controller={controller}
        onBack={onBack}
        locale="en-IE"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("adds a receipt total to a past trip from its card", async () => {
    const user = userEvent.setup();
    const controller = createController([
      completedTrip("one", FIRST_COMPLETE, 5_000),
    ]);

    render(
      <HistoryScreen controller={controller} onBack={vi.fn()} locale="en-IE" />,
    );

    expect(screen.getByText("Not added")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Add receipt total" }));

    const input = screen.getByRole("textbox", { name: "Receipt total" });
    expect(document.activeElement).toBe(input);

    await user.type(input, "4.72{Enter}");

    expect(screen.getByRole("status").textContent).toBe("Receipt total saved.");
    expect(screen.getByText("€4.72")).not.toBeNull();
    expect(screen.getByText("Paid €4.72 more")).not.toBeNull();
    expect(controller.getSnapshot().completedTrips[0]?.actualCheckoutMinor).toBe(472);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Change receipt total" }),
    );
  });

  it("keeps the receipt form open and explains an amount it cannot read", async () => {
    const user = userEvent.setup();
    const controller = createController([
      completedTrip("one", FIRST_COMPLETE, 5_000),
    ]);

    render(
      <HistoryScreen controller={controller} onBack={vi.fn()} locale="en-IE" />,
    );

    await user.click(screen.getByRole("button", { name: "Add receipt total" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toBe("Enter the receipt total first.");

    const input = screen.getByRole("textbox", { name: "Receipt total" });
    await user.type(input, "4.725");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Use no more than two decimal places.",
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(controller.getSnapshot().completedTrips[0]?.actualCheckoutMinor).toBeUndefined();
  });

  it("closes the receipt form with Escape and returns to its button", async () => {
    const user = userEvent.setup();
    const controller = createController([
      completedTrip("one", FIRST_COMPLETE, 5_000, 4_800),
    ]);

    render(
      <HistoryScreen controller={controller} onBack={vi.fn()} locale="en-IE" />,
    );

    await user.click(screen.getByRole("button", { name: "Change receipt total" }));
    const input = screen.getByRole("textbox", { name: "Receipt total" });
    expect((input as HTMLInputElement).value).toBe("48.00");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "Receipt total" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Change receipt total" }),
    );
  });

  it("says so when the receipt total cannot be saved", async () => {
    const user = userEvent.setup();
    const trips = [completedTrip("one", FIRST_COMPLETE, 5_000)];
    const controller = createShoppingAppController({
      persistence: {
        bootstrap: () => ({
          ok: true,
          activeTrip: null,
          completedTrips: trips,
          completionCleanupPending: false,
        }),
        save: () => ({ ok: true }),
        complete: () => ({ ok: true }),
        saveCompleted: () => ({ ok: true }),
        replaceCompletedHistory: () => ({
          ok: false,
          issue: { code: "write-failed", storageKey: "budget-cart:history" },
        }),
        clearCompletedActive: () => ({ ok: true }),
        readCompletedHistory: () => ({ ok: true, completedTrips: trips }),
        setAsideDamagedHistory: () => ({ ok: true, completedTrips: [] }),
        setAsideUnreadableActiveTrip: () => ({ ok: true }),
      },
      clock,
      ids,
    });
    controller.bootstrap();

    render(
      <HistoryScreen controller={controller} onBack={vi.fn()} locale="en-IE" />,
    );

    await user.click(screen.getByRole("button", { name: "Add receipt total" }));
    await user.type(screen.getByRole("textbox", { name: "Receipt total" }), "47.20");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "The receipt total could not be saved. Nothing was changed.",
    );
    expect(screen.getByText("Not added")).not.toBeNull();
  });
});
