import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { mvpMinorUnits, type Result } from "../src/domain/money";
import {
  createPriceMemoryRecord,
  type PriceMemoryRecord,
} from "../src/domain/price-memory";
import {
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  reduceTrip,
  type ActiveTrip,
  type CompletedTrip,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import { RecentItemsSection } from "../src/features/shopping/RecentItemsSection";

const NOW = "2026-09-22T08:00:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected successful Result");
  }

  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));

const createTrip = (budget = 5_000): ActiveTrip =>
  unwrap(
    createActiveTrip({
      id: "recent-items-trip",
      budgetMinor: money(budget),
      startedAt: "2026-09-22T07:00:00.000Z",
    }),
  );

const memory = ({
  label = "Milk 1L",
  price = 139,
  observedAt = "2026-09-20T08:00:00.000Z",
  storeId,
}: {
  label?: string;
  price?: number;
  observedAt?: string;
  storeId?: string;
} = {}): PriceMemoryRecord =>
  unwrap(
    createPriceMemoryRecord({
      label,
      unitPriceMinor: money(price),
      observedAt,
      ...(storeId === undefined ? {} : { storeId }),
      source: { kind: "manual" },
    }),
  );

const withItem = (trip: ActiveTrip, label: string, at: string): ActiveTrip => {
  const item = unwrap(
    createCartItem({
      id: `${trip.id}-${label}`,
      unitPriceMinor: money(139),
      quantity: 1,
      label,
      priceSource: { kind: "manual" },
      priceConfidence: { kind: "confirmed", confirmedAt: time(at) },
      createdAt: at,
    }),
  );
  const next = unwrap(reduceTrip(trip, { type: "add-item", item }));

  if (next.status !== "active") {
    throw new Error("Expected active trip");
  }

  return next;
};

const boughtOn = (completedAt: string, labels: readonly string[]): CompletedTrip => {
  const started = unwrap(
    createActiveTrip({
      id: `trip-${completedAt}`,
      budgetMinor: money(5_000),
      startedAt: completedAt,
    }),
  );
  const filled = labels.reduce((trip, label) => withItem(trip, label, completedAt), started);
  const completed = unwrap(
    reduceTrip(filled, { type: "complete-trip", completedAt: time(completedAt) }),
  );

  if (completed.status !== "completed") {
    throw new Error("Expected completed trip");
  }

  return completed;
};

describe("RecentItemsSection", () => {
  it("keeps the items bought on the latest trip at the top, however old their price is", () => {
    const records = [
      memory({ label: "Milk 1L", observedAt: "2026-08-01T08:00:00.000Z" }),
      memory({ label: "Rye bread", observedAt: "2026-09-10T08:00:00.000Z" }),
      memory({ label: "Coffee", observedAt: "2026-09-11T08:00:00.000Z" }),
      memory({ label: "Butter", observedAt: "2026-09-12T08:00:00.000Z" }),
      memory({ label: "Bananas", observedAt: "2026-09-13T08:00:00.000Z" }),
    ];

    render(
      <RecentItemsSection
        trip={createTrip()}
        records={records}
        completedTrips={[boughtOn("2026-09-20T08:00:00.000Z", ["milk 1l"])]}
        now={time(NOW)}
        onUseRemembered={vi.fn()}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    const names = within(screen.getByRole("list"))
      .getAllByRole("listitem")
      .map((item) => item.querySelector("strong")?.textContent);

    expect(names).toEqual(["Milk 1L", "Bananas", "Butter", "Coffee"]);
    expect(screen.getByText("Remembered · Seen 52 days ago")).not.toBeNull();
    expect(screen.getByText("5 remembered")).not.toBeNull();
  });

  it("shows every remembered item on request and marks the ones already in this cart", async () => {
    const user = userEvent.setup();
    const records = ["Milk 1L", "Rye bread", "Coffee", "Butter", "Bananas"].map(
      (label, index) =>
        memory({ label, observedAt: `2026-09-1${index}T08:00:00.000Z` }),
    );

    render(
      <RecentItemsSection
        trip={withItem(createTrip(), "Milk 1L", "2026-09-22T07:30:00.000Z")}
        records={records}
        now={time(NOW)}
        onUseRemembered={vi.fn()}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(4);
    const showAll = screen.getByRole("button", { name: "Show all 5" });
    expect(showAll.getAttribute("aria-expanded")).toBe("false");

    await user.click(showAll);

    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show fewer" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByText(/Seen 12 days ago · In this cart/)).not.toBeNull();
  });

  it("adds a remembered price once for an accidental double tap, and again on a later tap", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));

    try {
      const onUseRemembered = vi.fn(() => true);

      render(
        <RecentItemsSection
          trip={createTrip()}
          records={[memory()]}
          now={time(NOW)}
          onUseRemembered={onUseRemembered}
          onEnterCurrentPrice={vi.fn()}
          locale="en-IE"
        />,
      );

      const use = screen.getByRole("button", {
        name: "Use remembered price for Milk 1L",
      });

      fireEvent.click(use);
      fireEvent.click(use);
      expect(onUseRemembered).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date(Date.parse(NOW) + 1_000));
      fireEvent.click(use);
      expect(onUseRemembered).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts a price's age in calendar days, not 24-hour blocks", () => {
    render(
      <RecentItemsSection
        trip={createTrip()}
        records={[memory({ observedAt: "2026-09-21T20:00:00.000Z" })]}
        now={time("2026-09-22T09:30:00.000Z")}
        onUseRemembered={vi.fn()}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    expect(screen.getByText("Remembered · Seen 1 day ago")).not.toBeNull();
  });

  it("labels remembered prices as stale context with visible age", () => {
    render(
      <RecentItemsSection
        trip={createTrip()}
        records={[memory()]}
        now={time(NOW)}
        onUseRemembered={vi.fn()}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    expect(screen.getByRole("heading", { name: "Recent Items" })).not.toBeNull();
    expect(screen.getByText("Milk 1L")).not.toBeNull();
    expect(screen.getByText("€1.39")).not.toBeNull();
    expect(
      screen.getByText("Remembered · Seen 2 days ago"),
    ).not.toBeNull();
    expect(
      screen.getByText(/Prices from past trips\. Check the shelf/i),
    ).not.toBeNull();
  });

  it("reuses a remembered price in one action when it stays within budget", async () => {
    const user = userEvent.setup();
    const record = memory();
    const onUseRemembered = vi.fn(() => true);

    render(
      <RecentItemsSection
        trip={createTrip()}
        records={[record]}
        now={time(NOW)}
        onUseRemembered={onUseRemembered}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Use remembered price for Milk 1L" }),
    );

    expect(onUseRemembered).toHaveBeenCalledTimes(1);
    expect(onUseRemembered).toHaveBeenCalledWith(record);
  });

  it("always offers current-price entry instead of forcing remembered value", async () => {
    const user = userEvent.setup();
    const record = memory();
    const onEnterCurrentPrice = vi.fn();

    render(
      <RecentItemsSection
        trip={createTrip()}
        records={[record]}
        now={time(NOW)}
        onUseRemembered={vi.fn()}
        onEnterCurrentPrice={onEnterCurrentPrice}
        locale="en-IE"
      />,
    );

    const currentPrice = screen.getByRole("button", {
      name: /Enter current price/,
    });
    expect(currentPrice.dataset.currentPriceMemoryId).toBe(record.id);

    await user.click(currentPrice);

    expect(onEnterCurrentPrice).toHaveBeenCalledWith(record);
  });

  it("requires explicit second confirmation when a remembered price crosses the nominal budget", async () => {
    const user = userEvent.setup();
    const record = memory({ price: 600 });
    const onUseRemembered = vi.fn(() => true);

    render(
      <RecentItemsSection
        trip={createTrip(500)}
        records={[record]}
        now={time(NOW)}
        onUseRemembered={onUseRemembered}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Use remembered price for Milk 1L" }),
    );

    expect(onUseRemembered).not.toHaveBeenCalled();

    const confirmation = screen.getByLabelText(
      "Confirm remembered price for Milk 1L",
    );
    expect(
      within(confirmation).getByText(/€1.00/),
    ).not.toBeNull();

    await user.click(
      within(confirmation).getByRole("button", { name: "Add anyway" }),
    );

    expect(onUseRemembered).toHaveBeenCalledTimes(1);
    expect(onUseRemembered).toHaveBeenCalledWith(record);
  });

  it("focuses the safe cancel action and lets Escape close remembered over-budget confirmation", async () => {
    const user = userEvent.setup();
    const record = memory({ price: 600 });
    const onUseRemembered = vi.fn(() => true);

    render(
      <RecentItemsSection
        trip={createTrip(500)}
        records={[record]}
        now={time(NOW)}
        onUseRemembered={onUseRemembered}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Use remembered price for Milk 1L" }),
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );

    await user.keyboard("{Escape}");

    expect(
      screen.queryByLabelText("Confirm remembered price for Milk 1L"),
    ).toBeNull();
    expect(onUseRemembered).not.toHaveBeenCalled();
  });

  it("restores focus to the remembered trigger after Escape from over-budget confirmation", async () => {
    const user = userEvent.setup();
    const record = memory({ price: 600 });

    render(
      <RecentItemsSection
        trip={createTrip(500)}
        records={[record]}
        now={time(NOW)}
        onUseRemembered={vi.fn()}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Use remembered price for Milk 1L",
    });
    await user.click(trigger);

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);

    await user.keyboard("{Escape}");

    const restored = screen.getByRole("button", {
      name: "Use remembered price for Milk 1L",
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(restored);
    });
  });

  it("keeps advisory persistence failure separate and explicit", () => {
    render(
      <RecentItemsSection
        trip={createTrip()}
        records={[memory()]}
        now={time(NOW)}
        persistenceDegraded
        onUseRemembered={vi.fn()}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    expect(
      screen.getByText(/price-memory changes are not safely saving/i),
    ).not.toBeNull();
    expect(
      screen.getByText(/active cart is still saved independently/i),
    ).not.toBeNull();
  });

  it("does not claim the cart is saved while cart saves are failing too", () => {
    render(
      <RecentItemsSection
        trip={createTrip()}
        records={[memory()]}
        now={time(NOW)}
        persistenceDegraded
        activeTripSaving={false}
        onUseRemembered={vi.fn()}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    expect(
      screen.getByText(/price-memory changes are not safely saving/i),
    ).not.toBeNull();
    expect(screen.queryByText(/still saved independently/i)).toBeNull();
  });

  it("keeps only the newest four recent product identities", () => {
    const records = [
      memory({ label: "A", observedAt: "2026-09-17T08:00:00.000Z" }),
      memory({ label: "B", observedAt: "2026-09-18T08:00:00.000Z" }),
      memory({ label: "C", observedAt: "2026-09-19T08:00:00.000Z" }),
      memory({ label: "D", observedAt: "2026-09-20T08:00:00.000Z" }),
      memory({ label: "E", observedAt: "2026-09-21T08:00:00.000Z" }),
    ];

    render(
      <RecentItemsSection
        trip={createTrip()}
        records={records}
        now={time(NOW)}
        onUseRemembered={vi.fn()}
        onEnterCurrentPrice={vi.fn()}
        locale="en-IE"
      />,
    );

    expect(screen.queryByText("A")).toBeNull();
    expect(screen.getByText("B")).not.toBeNull();
    expect(screen.getByText("C")).not.toBeNull();
    expect(screen.getByText("D")).not.toBeNull();
    expect(screen.getByText("E")).not.toBeNull();
  });
});
