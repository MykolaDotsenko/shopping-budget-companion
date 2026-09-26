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
import { FinishTripSurface } from "../src/features/shopping/FinishTripSurface";

const START = "2026-09-21T09:00:00.000Z";
const ADD = "2026-09-21T09:05:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected successful Result");
  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));

const createEmptyTrip = (): ActiveTrip =>
  unwrap(
    createActiveTrip({
      id: "empty-trip",
      budgetMinor: money(5_000),
      startedAt: START,
    }),
  );

const createTrip = (): ActiveTrip => {
  const base = unwrap(
    createActiveTrip({
      id: "finish-trip",
      budgetMinor: money(5_000),
      startedAt: START,
    }),
  );
  const item = unwrap(
    createCartItem({
      id: "finish-item",
      unitPriceMinor: money(479),
      quantity: 2,
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

  if (result.status !== "active") {
    throw new Error("Expected active trip");
  }

  return result;
};

describe("FinishTripSurface", () => {
  it("reviews canonical trip values and gives Keep shopping initial focus", () => {
    render(
      <FinishTripSurface
        trip={createTrip()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        locale="en-IE"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Ready to finish this trip?",
      }),
    ).not.toBeNull();
    expect(screen.getByText("€9.58")).not.toBeNull();
    expect(screen.getByText("€50.00")).not.toBeNull();
    expect(screen.getByText("2")).not.toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Keep shopping" }),
    );
  });

  it("cancels with Escape without calling completion", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <FinishTripSurface
        trip={createTrip()}
        onCancel={onCancel}
        onConfirm={onConfirm}
        locale="en-IE"
      />,
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps the review open and explains a rejected durable finish", async () => {
    const user = userEvent.setup();

    render(
      <FinishTripSurface
        trip={createTrip()}
        onCancel={vi.fn()}
        onConfirm={() => false}
        locale="en-IE"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Finish trip" }),
    );

    expect(
      screen.getByRole("alert").textContent,
    ).toContain("active trip is still intact");
    expect(
      screen.getByRole("button", { name: "Finish trip" }),
    ).not.toBeNull();
  });

  it("offers to cancel an empty trip instead of saving it to history", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onDiscard = vi.fn(() => true);

    render(
      <FinishTripSurface
        trip={createEmptyTrip()}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onDiscard={onDiscard}
        locale="en-IE"
      />,
    );

    expect(
      screen.getByRole("main", { name: "Nothing to finish yet" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Finish trip" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Keep shopping" }),
    );

    await user.click(screen.getByRole("button", { name: "Cancel trip" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when an empty trip could not be cancelled", async () => {
    const user = userEvent.setup();

    render(
      <FinishTripSurface
        trip={createEmptyTrip()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onDiscard={() => false}
        locale="en-IE"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel trip" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "The trip could not be cancelled. Try again.",
    );
  });

  it("keeps the normal review for a trip with items even when cancelling is offered", () => {
    render(
      <FinishTripSurface
        trip={createTrip()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onDiscard={vi.fn(() => true)}
        locale="en-IE"
      />,
    );

    expect(
      screen.getByRole("main", { name: "Ready to finish this trip?" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel trip" })).toBeNull();
  });
});
