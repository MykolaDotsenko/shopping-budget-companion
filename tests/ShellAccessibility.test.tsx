import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bootstrapBrowserShoppingAppController } from "../src/app/composition-root";
import { ShoppingAppShell } from "../src/app/ShoppingAppShell";
import type { ShoppingAppController } from "../src/application/shopping-app-controller";
import { isoTimestamp } from "../src/domain/shopping-trip";
import type { StorageLike } from "../src/infrastructure/storage/shopping-storage";

const boot = (): ShoppingAppController => {
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  let id = 0;
  const now = isoTimestamp("2026-09-26T10:00:00.000Z");

  if (!now.ok) {
    throw new Error("Expected a valid timestamp");
  }

  return bootstrapBrowserShoppingAppController({
    storage,
    clock: { now: () => now.value },
    ids: {
      tripId: () => `trip-${(id += 1)}`,
      itemId: () => `item-${(id += 1)}`,
    },
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shopping shell accessibility", () => {
  it("shows privacy, feedback and the app version at the foot of the start screen", () => {
    render(<ShoppingAppShell controller={boot()} />);

    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe(
      "/privacy/",
    );
    expect(
      screen.getByRole("link", { name: "Feedback" }).getAttribute("href"),
    ).toContain("/issues/new?template=feedback.yml");
    expect(screen.getByText("vtest")).not.toBeNull();
  });

  it("offers installing the app on the start screen and never inside a trip", async () => {
    const user = userEvent.setup();
    const prompt = { install: vi.fn() };

    render(
      <ShoppingAppShell
        controller={boot()}
        installPrompt={{ current: () => prompt, subscribe: () => () => {} }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Install the app" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "€50" }));
    await screen.findByRole("heading", { name: "Know what’s left" });

    expect(screen.queryByRole("heading", { name: "Install the app" })).toBeNull();
  });

  it("says what Undo will undo once the added message is gone", async () => {
    const user = userEvent.setup();

    render(<ShoppingAppShell controller={boot()} />);

    await user.click(screen.getByRole("button", { name: "€50" }));
    await user.click(screen.getByRole("button", { name: "Add price" }));
    await user.type(screen.getByRole("textbox", { name: "Price" }), "4.79");
    await user.click(screen.getByRole("button", { name: "Add · €4.79" }));
    expect(screen.getByRole("button", { name: "Undo" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Finish trip" }));
    await user.click(await screen.findByRole("button", { name: "Keep shopping" }));

    expect(await screen.findByRole("button", { name: "Undo last add" })).not.toBeNull();
  });

  it("opens price entry in the mode the shopper chose last time", async () => {
    const user = userEvent.setup();

    render(<ShoppingAppShell controller={boot()} />);

    await user.click(screen.getByRole("button", { name: "€50" }));
    await user.click(screen.getByRole("button", { name: "Add price" }));
    await user.click(screen.getByRole("button", { name: "Cents mode" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Add price" }));

    expect(
      screen.getByRole("button", { name: "Cents mode" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(window.localStorage.getItem("shopping-budget:price-entry-mode")).toBe("auto-cents");
  });

  it("moves focus to each new screen's heading and back to the top of the page", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    render(<ShoppingAppShell controller={boot()} />);

    await user.click(screen.getByRole("button", { name: "€50" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Know what’s left" }),
      );
    });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    await user.click(screen.getByRole("button", { name: "Add price" }));
    await user.type(screen.getByRole("textbox", { name: "Price" }), "4.79");
    await user.click(screen.getByRole("button", { name: "Add · €4.79" }));
    await user.click(screen.getByRole("button", { name: "Finish trip" }));
    const finish = await screen.findByRole("main", { name: "Ready to finish this trip?" });
    await user.click(within(finish).getByRole("button", { name: "Finish trip" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Your shopping trip is complete" }),
      );
    });

    await user.click(screen.getByRole("button", { name: "View trip history" }));
    const history = await screen.findByRole("heading", { name: "Past shopping trips" });
    await waitFor(() => {
      expect(document.activeElement).toBe(history);
    });
  });

  it("cancels an empty trip back to the start without adding it to history", async () => {
    const user = userEvent.setup();
    const controller = boot();

    render(<ShoppingAppShell controller={controller} />);

    await user.click(screen.getByRole("button", { name: "€50" }));
    await user.click(screen.getByRole("button", { name: "Finish trip" }));
    const finish = await screen.findByRole("main", { name: "Nothing to finish yet" });
    await user.click(within(finish).getByRole("button", { name: "Cancel trip" }));

    const start = await screen.findByRole("heading", {
      name: "How much can you spend today?",
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(start);
    });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Trip cancelled. Nothing was saved.",
      );
    });
    expect(controller.getSnapshot()).toMatchObject({
      lifecycle: "idle",
      activeTrip: null,
      completedTrips: [],
    });

    await user.click(screen.getByRole("button", { name: "€50" }));
    await screen.findByRole("heading", { name: "Know what’s left" });

    expect(screen.queryByText("Trip cancelled. Nothing was saved.")).toBeNull();
  });

  it("announces a change through one live region that outlives the screens", async () => {
    const user = userEvent.setup();

    render(<ShoppingAppShell controller={boot()} />);

    await user.click(screen.getByRole("button", { name: "€50" }));
    await user.click(screen.getByRole("button", { name: "Add price" }));
    await user.type(screen.getByRole("textbox", { name: "Price" }), "4.79");
    await user.click(screen.getByRole("button", { name: "Add · €4.79" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "€4.79 added. €45.21 left.",
      );
    });
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
