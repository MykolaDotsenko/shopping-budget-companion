import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { mvpMinorUnits, type Result } from "../src/domain/money";
import {
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  reduceTrip,
  type ActiveTrip,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import { BudgetSettingsSurface } from "../src/features/shopping/BudgetSettingsSurface";

const START = "2026-09-21T09:00:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected successful Result");
  }

  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));

const createTrip = (): ActiveTrip => {
  const active = unwrap(
    createActiveTrip({
      id: "trip-budget-settings",
      budgetMinor: money(5_000),
      safetyBufferMinor: money(200),
      startedAt: START,
    }),
  );
  const item = unwrap(
    createCartItem({
      id: "item-budget-settings",
      unitPriceMinor: money(479),
      quantity: 1,
      priceSource: { kind: "manual" },
      priceConfidence: { kind: "confirmed", confirmedAt: time(START) },
      createdAt: START,
    }),
  );
  const withItem = unwrap(
    reduceTrip(active, {
      type: "add-item",
      item,
    }),
  );

  if (withItem.status !== "active") {
    throw new Error("Expected active trip");
  }

  return withItem;
};

describe("BudgetSettingsSurface", () => {
  it("previews and emits budget and buffer as one spending-plan intent", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const trip = createTrip();

    render(
      <BudgetSettingsSurface
        trip={trip}
        locale="en-IE"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    const budget = screen.getByLabelText(/^Budget/);
    const buffer = screen.getByLabelText(/Safety buffer/);

    expect((budget as HTMLInputElement).value).toBe("50.00");
    expect((buffer as HTMLInputElement).value).toBe("2.00");
    expect(screen.getByText(/Cart total:/).textContent).toContain(
      "€4.79",
    );

    await user.clear(budget);
    await user.type(budget, "40");
    await user.clear(buffer);
    await user.type(buffer, "5");

    expect(
      screen.getByText("€30.21 safe to spend after saving"),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Save budget" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      budgetMinor: 4_000,
      safetyBufferMinor: 500,
    });
  });

  it("allows an intentional budget below the current cart and explains the result", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <BudgetSettingsSurface
        trip={createTrip()}
        locale="en-IE"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    const budget = screen.getByLabelText(/^Budget/);
    const buffer = screen.getByLabelText(/Safety buffer/);

    await user.clear(budget);
    await user.type(budget, "4");
    await user.clear(buffer);

    expect(
      screen.getByText("Current cart will be €0.79 over this budget."),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Save budget" }));

    expect(onSave).toHaveBeenCalledWith({
      budgetMinor: 400,
      safetyBufferMinor: 0,
    });
  });

  it("rejects a buffer larger than the final budget before dispatch", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <BudgetSettingsSurface
        trip={createTrip()}
        locale="en-IE"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    const budget = screen.getByLabelText(/^Budget/);
    const buffer = screen.getByLabelText(/Safety buffer/);

    await user.clear(budget);
    await user.type(budget, "3");
    await user.clear(buffer);
    await user.type(buffer, "4");
    await user.click(screen.getByRole("button", { name: "Save budget" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Safety buffer: Safety buffer cannot be larger than the budget.",
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});
