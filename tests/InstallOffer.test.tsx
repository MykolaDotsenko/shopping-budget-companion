import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { INSTALL_OFFER_STORAGE_KEY, InstallOffer } from "../src/app/InstallOffer";
import type {
  InstallPrompt,
  InstallPromptSource,
} from "../src/infrastructure/runtime/install-prompt";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

const sourceWith = (prompt: InstallPrompt | null): InstallPromptSource => ({
  current: () => prompt,
  subscribe: () => () => {},
});

const onIphoneSafari = (): void => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE_SAFARI);
};

describe("install offer", () => {
  it("offers the browser's install prompt and does not come back once used", async () => {
    const user = userEvent.setup();
    const install = vi.fn();

    const { unmount } = render(
      <InstallOffer source={sourceWith({ install })} hasSavedShopping />,
    );

    expect(screen.getByRole("heading", { name: "Install the app" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Install" }));

    expect(install).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Install the app" })).toBeNull();
    expect(window.localStorage.getItem(INSTALL_OFFER_STORAGE_KEY)).toBe("dismissed");

    unmount();
    render(<InstallOffer source={sourceWith({ install })} hasSavedShopping />);

    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("can be put off without installing", async () => {
    const user = userEvent.setup();
    const install = vi.fn();

    render(<InstallOffer source={sourceWith({ install })} hasSavedShopping={false} />);
    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(install).not.toHaveBeenCalled();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("shows nothing when the browser has no prompt and this is not Safari on iPhone", () => {
    render(<InstallOffer source={sourceWith(null)} hasSavedShopping={false} />);

    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("explains Add to Home Screen on iPhone before anything is saved in Safari", async () => {
    const user = userEvent.setup();
    onIphoneSafari();

    render(<InstallOffer source={sourceWith(null)} hasSavedShopping={false} />);

    expect(
      screen.getByRole("heading", { name: "Add it to your Home Screen first" }),
    ).not.toBeNull();
    expect(screen.getByText(/choose Add to Home Screen/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("keeps quiet on iPhone once trips are saved in Safari, since the Home Screen app starts empty", () => {
    onIphoneSafari();

    render(<InstallOffer source={sourceWith(null)} hasSavedShopping />);

    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("stays hidden after it was dismissed, even if storage cannot be written", async () => {
    const user = userEvent.setup();
    onIphoneSafari();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    render(<InstallOffer source={sourceWith(null)} hasSavedShopping={false} />);
    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("still explains the steps when an earlier dismissal cannot be read", () => {
    onIphoneSafari();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    render(<InstallOffer source={sourceWith(null)} hasSavedShopping={false} />);

    expect(
      screen.getByRole("heading", { name: "Add it to your Home Screen first" }),
    ).not.toBeNull();
  });
});
