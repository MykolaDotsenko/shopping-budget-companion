import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { I18nContext, type I18nContextValue } from "../src/app/i18n-context";
import { LanguageSwitcher } from "../src/app/LanguageSwitcher";

const valueFor = (
  overrides: Partial<I18nContextValue> = {},
): I18nContextValue => ({
  language: "en",
  locale: "en-FI",
  changing: false,
  saveFailed: false,
  changeFailed: false,
  t: (source) => source,
  tp: (oneSource, otherSource, count) =>
    (count === 1 ? oneSource : otherSource).replace("{count}", String(count)),
  setLanguage: async () => undefined,
  ...overrides,
});

describe("LanguageSwitcher", () => {
  it("uses one compact segmented group with short visible codes and full accessible names", async () => {
    const user = userEvent.setup();
    const setLanguage = vi.fn(async () => undefined);

    render(
      <I18nContext.Provider value={valueFor({ setLanguage })}>
        <LanguageSwitcher />
      </I18nContext.Provider>,
    );

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();

    const group = screen.getByRole("group", { name: "App language" });
    const english = screen.getByRole("button", { name: "English" });
    const finnish = screen.getByRole("button", { name: "Suomi" });
    const ukrainian = screen.getByRole("button", { name: "Українська" });

    expect(group).toContainElement(english);
    expect(group).toContainElement(finnish);
    expect(group).toContainElement(ukrainian);
    expect(screen.getByText("EN")).toBeInTheDocument();
    expect(screen.getByText("FI")).toBeInTheDocument();
    expect(screen.getByText("UA")).toBeInTheDocument();
    expect(english).toHaveAttribute("aria-pressed", "true");
    expect(finnish).toHaveAttribute("aria-pressed", "false");

    await user.click(finnish);
    expect(setLanguage).toHaveBeenCalledWith("fi");
  });

  it("keeps the current native-language name accessible while a locale is selected", () => {
    render(
      <I18nContext.Provider value={valueFor({ language: "uk", locale: "uk-UA" })}>
        <LanguageSwitcher />
      </I18nContext.Provider>,
    );

    expect(screen.getByRole("button", { name: "Українська" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("surfaces load and persistence warnings without expanding the normal control", () => {
    const { rerender } = render(
      <I18nContext.Provider value={valueFor({ changeFailed: true })}>
        <LanguageSwitcher />
      </I18nContext.Provider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "That language could not be loaded. Try again when you are online.",
    );

    rerender(
      <I18nContext.Provider value={valueFor({ saveFailed: true })}>
        <LanguageSwitcher />
      </I18nContext.Provider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Language changed for this session but could not be saved.",
    );
  });
});
