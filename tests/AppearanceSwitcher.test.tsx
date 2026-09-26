import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppearanceSwitcher } from "../src/app/AppearanceSwitcher";
import { APPEARANCE_STORAGE_KEY } from "../src/app/appearance";

const withMotion = (reduced: boolean): void => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" ? reduced : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
};

const withViewTransitions = (pending?: { update?: () => void }) => {
  const startViewTransition = vi.fn((update: () => void) => {
    if (pending === undefined) {
      update();
    } else {
      pending.update = update;
    }

    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: () => undefined,
    };
  });

  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: startViewTransition,
  });
  Object.defineProperty(document.documentElement, "animate", {
    configurable: true,
    value: vi.fn(() => ({
      effect: { getComputedTiming: () => ({ progress: 0.5 }) },
    })),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

  return startViewTransition;
};

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  Reflect.deleteProperty(document.documentElement, "animate");
  Reflect.deleteProperty(window, "matchMedia");
  delete document.documentElement.dataset.neonIgnition;
});

describe("AppearanceSwitcher", () => {
  it("offers all appearance modes as explicit accessible choices", () => {
    render(<AppearanceSwitcher />);

    expect(
      screen.getByRole("group", { name: "Appearance theme" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "System" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Light" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Dark" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Aurora" })).not.toBeNull();
  });

  it("keeps camera features inside the trip instead of linking out to separate tools", () => {
    render(<AppearanceSwitcher />);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("switches immediately and persists the preference without touching shopping state", async () => {
    const user = userEvent.setup();

    render(<AppearanceSwitcher />);

    const aurora = screen.getByRole("button", { name: "Aurora" });
    await user.click(aurora);

    expect(aurora.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.appearance).toBe("aurora");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("aurora");
  });

  it("saves Aurora at once and switches without the effect when it is slow to load", async () => {
    withMotion(false);
    const startViewTransition = withViewTransitions();
    vi.useFakeTimers();

    render(<AppearanceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Aurora" }));

    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("aurora");
    expect(document.documentElement.dataset.appearance).toBe("system");

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(document.documentElement.dataset.appearance).toBe("aurora");
    expect(screen.getByRole("button", { name: "Aurora" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    vi.useRealTimers();
    await import("../src/app/neon-ignition");
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(document.querySelector("canvas.neon-burst")).toBeNull();
  });

  it("lights Aurora up with a short neon ignition where the browser can animate it", async () => {
    withMotion(false);
    const startViewTransition = withViewTransitions();
    const timers = vi.spyOn(window, "setTimeout");

    render(<AppearanceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Aurora" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.appearance).toBe("aurora");
    });
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Aurora" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    const burst = document.querySelector("canvas.neon-burst");
    expect(burst?.getAttribute("aria-hidden")).toBe("true");
    expect(document.documentElement.dataset.neonIgnition).toBe("");

    const settle = timers.mock.calls.find(([, delay]) => delay === 2000)?.[0];
    expect(typeof settle).toBe("function");
    (settle as () => void)();

    expect(document.querySelector("canvas.neon-burst")).toBeNull();
    expect(document.documentElement.dataset.neonIgnition).toBeUndefined();
  });

  it("switches instantly without the ignition when reduced motion is on", () => {
    withMotion(true);
    const startViewTransition = withViewTransitions();

    render(<AppearanceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Aurora" }));

    expect(document.documentElement.dataset.appearance).toBe("aurora");
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(document.querySelector("canvas.neon-burst")).toBeNull();
  });

  it("keeps a choice made before the ignition could switch the look", () => {
    withMotion(false);
    const pending: { update?: () => void } = {};
    withViewTransitions(pending);

    render(<AppearanceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Aurora" }));
    fireEvent.click(screen.getByRole("button", { name: "Light" }));

    expect(document.documentElement.dataset.appearance).toBe("light");

    act(() => {
      pending.update?.();
    });

    expect(document.documentElement.dataset.appearance).toBe("light");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("light");
    expect(screen.getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});
