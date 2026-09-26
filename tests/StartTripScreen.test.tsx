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
  isoTimestamp,
  reduceTrip,
  type CompletedTrip,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import { StartTripScreen } from "../src/features/shopping/StartTripScreen";

const START = "2026-09-21T09:00:00.000Z";

const clock: Clock = {
  now(): IsoTimestamp {
    const result = isoTimestamp(START);

    if (!result.ok) {
      throw new Error("Invalid test timestamp");
    }

    return result.value;
  },
};

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected successful Result");
  }

  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));

const createCompletedTrip = (): CompletedTrip => {
  const active = unwrap(
    createActiveTrip({
      id: "recent-trip",
      budgetMinor: money(3_750),
      safetyBufferMinor: money(200),
      startedAt: START,
    }),
  );
  const completedAt = isoTimestamp("2026-09-21T10:00:00.000Z");

  if (!completedAt.ok) {
    throw new Error("Invalid completion timestamp");
  }

  const completed = unwrap(
    reduceTrip(active, {
      type: "complete-trip",
      completedAt: completedAt.value,
    }),
  );

  if (completed.status !== "completed") {
    throw new Error("Expected completed trip");
  }

  return completed;
};

const ids: IdGenerator = {
  tripId: () => "trip-start-screen",
  itemId: () => "item-start-screen",
};

const createController = (
  completedTrips: readonly CompletedTrip[] = [],
) => {
  const controller = createShoppingAppController({
    persistence: {
      bootstrap: () => ({
        ok: true,
        activeTrip: null,
        completedTrips,
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

describe("StartTripScreen", () => {
  it("presents the hard-budget job without an account wall", () => {
    const controller = createController();

    render(<StartTripScreen controller={controller} />);

    expect(
      screen.getByRole("heading", {
        name: "How much can you spend today?",
      }),
    ).not.toBeNull();
    expect(
      screen.getByText(
        "Set your limit. Add prices. Always know what's left.",
      ),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "€25" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "€50" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "€75" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "€100" })).not.toBeNull();
    expect(screen.getByText("Add a safety buffer")).not.toBeNull();
    expect(
      screen.getByText(
        "No account. Your shopping data stays on this device.",
      ),
    ).not.toBeNull();
  });

  it("offers completed history as a secondary action when trips exist", async () => {
    const user = userEvent.setup();
    const controller = createController();
    const onOpenHistory = vi.fn();

    render(
      <StartTripScreen
        controller={controller}
        completedTripCount={2}
        onOpenHistory={onOpenHistory}
      />,
    );

    const history = screen.getByRole("button", {
      name: "View trip history · 2",
    });
    await user.click(history);

    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("keeps degraded Price Memory recovery reachable with zero valid records", async () => {
    const user = userEvent.setup();
    const controller = createController();
    const onOpenHistory = vi.fn();

    render(
      <StartTripScreen
        controller={controller}
        completedTripCount={0}
        rememberedPriceCount={0}
        priceMemoryNeedsAttention
        onOpenHistory={onOpenHistory}
      />,
    );

    const repair = screen.getByRole("button", {
      name: "Repair remembered prices",
    });
    await user.click(repair);

    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("keeps remembered-price controls reachable when trip history is empty", async () => {
    const user = userEvent.setup();
    const controller = createController();
    const onOpenHistory = vi.fn();

    render(
      <StartTripScreen
        controller={controller}
        completedTripCount={0}
        rememberedPriceCount={3}
        onOpenHistory={onOpenHistory}
      />,
    );

    const dataControl = screen.getByRole("button", {
      name: "Manage remembered prices · 3",
    });
    await user.click(dataControl);

    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("offers the most recent spending plan as a one-action repeat shortcut", async () => {
    const user = userEvent.setup();
    const recentTrip = createCompletedTrip();
    const controller = createController([recentTrip]);

    render(
      <StartTripScreen
        controller={controller}
        recentTrip={recentTrip}
        completedTripCount={1}
        locale="en-IE"
      />,
    );

    const repeat = screen.getByRole("button", { name: /Shop again/i });
    expect(repeat.textContent).toContain("€37.50 budget");
    expect(repeat.textContent).toContain("€2.00 safety buffer");

    await user.click(repeat);

    expect(controller.getSnapshot()).toMatchObject({
      lifecycle: "active",
      activeTrip: {
        budgetMinor: 3_750,
        safetyBufferMinor: 200,
        items: [],
      },
    });
    expect(controller.getSnapshot().completedTrips).toEqual([recentTrip]);
  });

  it("starts a €50 trip in one action", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<StartTripScreen controller={controller} />);

    await user.click(screen.getByRole("button", { name: "€50" }));

    expect(controller.getSnapshot()).toMatchObject({
      lifecycle: "active",
      activeTrip: {
        budgetMinor: 5_000,
        safetyBufferMinor: 0,
      },
      persistence: {
        status: "healthy",
      },
    });
  });

  it("reports successful new and repeated trip starts without exposing budget values", async () => {
    const user = userEvent.setup();
    const recentTrip = createCompletedTrip();
    const controller = createController([recentTrip]);
    const onTripStarted = vi.fn();

    const { rerender } = render(
      <StartTripScreen
        controller={controller}
        recentTrip={recentTrip}
        completedTripCount={1}
        onTripStarted={onTripStarted}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Shop again/i }));
    expect(onTripStarted).toHaveBeenCalledWith("repeat");

    const freshController = createController();
    onTripStarted.mockClear();

    rerender(
      <StartTripScreen
        controller={freshController}
        onTripStarted={onTripStarted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "€50" }));
    expect(onTripStarted).toHaveBeenCalledWith("new");
  });

  it("applies an optional safety buffer to a quick budget", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<StartTripScreen controller={controller} />);

    await user.click(screen.getByText("Add a safety buffer"));
    await user.type(
      screen.getByRole("textbox", { name: /Safety buffer/i }),
      "2",
    );
    await user.click(screen.getByRole("button", { name: "€50" }));

    expect(controller.getSnapshot().activeTrip).toMatchObject({
      budgetMinor: 5_000,
      safetyBufferMinor: 200,
    });
  });

  it("keeps a collapsed safety buffer visible and reopens it when it is invalid", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<StartTripScreen controller={controller} />);

    const summary = screen.getByText("Add a safety buffer");
    await user.click(summary);
    await user.type(screen.getByRole("textbox", { name: /Safety buffer/i }), "7");
    await user.click(summary);

    expect(screen.getByText("Safety buffer €7.00")).not.toBeNull();

    await user.click(screen.getByText("Safety buffer €7.00"));
    const input = screen.getByRole("textbox", { name: /Safety buffer/i });
    await user.clear(input);
    await user.type(input, "7.555");
    await user.click(screen.getByText("Add a safety buffer"));

    expect(screen.getByText("Safety buffer needs a valid amount")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "€50" }));

    expect(controller.getSnapshot().lifecycle).toBe("idle");
    expect(
      (screen.getByText("Add a safety buffer").closest("details") as HTMLDetailsElement)
        .open,
    ).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: /Safety buffer/i }),
    );
  });

  it("keeps the trip idle when the buffer exceeds the selected budget", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<StartTripScreen controller={controller} />);

    await user.click(screen.getByText("Add a safety buffer"));
    await user.type(
      screen.getByRole("textbox", { name: /Safety buffer/i }),
      "60",
    );
    await user.click(screen.getByRole("button", { name: "€50" }));

    expect(controller.getSnapshot().lifecycle).toBe("idle");
    expect(screen.getByRole("alert").textContent).toContain(
      "Keep the safety buffer within your budget.",
    );
  });

  it("accepts a locale-friendly custom decimal budget", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<StartTripScreen controller={controller} />);

    await user.click(
      screen.getByRole("button", { name: "Custom amount" }),
    );

    const customInput = screen.getByRole("textbox", {
      name: "Custom budget",
    });

    expect(document.activeElement).toBe(customInput);

    await user.type(customInput, "37,50");
    await user.click(
      screen.getByRole("button", { name: "Start shopping" }),
    );

    expect(controller.getSnapshot().activeTrip?.budgetMinor).toBe(3_750);
  });

  it("explains invalid custom money input inline", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<StartTripScreen controller={controller} />);

    await user.click(
      screen.getByRole("button", { name: "Custom amount" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Custom budget" }),
      "37.500",
    );
    await user.click(
      screen.getByRole("button", { name: "Start shopping" }),
    );

    expect(controller.getSnapshot().lifecycle).toBe("idle");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Use no more than two decimal places.");
    expect(alert.closest("form")).not.toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Custom budget" }).getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("lets the domain reject a zero custom budget without duplicating the rule", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<StartTripScreen controller={controller} />);

    await user.click(
      screen.getByRole("button", { name: "Custom amount" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Custom budget" }),
      "0",
    );
    await user.click(
      screen.getByRole("button", { name: "Start shopping" }),
    );

    expect(controller.getSnapshot().lifecycle).toBe("idle");
    expect(screen.getByRole("alert").textContent).toContain(
      "Set a budget above €0.",
    );
  });

  it("allows keyboard submit for the custom budget form", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<StartTripScreen controller={controller} />);

    await user.click(
      screen.getByRole("button", { name: "Custom amount" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Custom budget" }),
      "42{Enter}",
    );

    expect(controller.getSnapshot().activeTrip?.budgetMinor).toBe(4_200);
  });
});
