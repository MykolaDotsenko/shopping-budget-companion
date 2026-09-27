import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../src/app/i18n";
import { useI18n } from "../src/app/i18n-context";
import { messages as fiMessages } from "../src/app/locales/locale-fi";
import { messages as ukMessages } from "../src/app/locales/locale-uk";

function Probe() {
  const { language, locale, saveFailed, t, tp, setLanguage } = useI18n();

  return (
    <>
      <output data-testid="language">{language}</output>
      <output data-testid="locale">{locale}</output>
      <output data-testid="start">{t("Start shopping")}</output>
      <output data-testid="one">
        {tp("{count} item", "{count} items", 1)}
      </output>
      <output data-testid="two">
        {tp("{count} item", "{count} items", 2)}
      </output>
      <output data-testid="five">
        {tp("{count} item", "{count} items", 5)}
      </output>
      <output data-testid="twenty-one">
        {tp("{count} item", "{count} items", 21)}
      </output>
      <output data-testid="save-failed">{String(saveFailed)}</output>
      <button type="button" onClick={() => void setLanguage("fi")}>
        switch-fi
      </button>
      <button type="button" onClick={() => void setLanguage("uk")}>
        switch-uk
      </button>
      <button type="button" onClick={() => void setLanguage("en")}>
        switch-en
      </button>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.lang = "en";
});

describe("I18nProvider", () => {
  it("renders Finnish copy and Finnish plural behavior from the initial catalog", async () => {
    render(
      <I18nProvider initialLanguage="fi" initialCatalog={fiMessages}>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("language").textContent).toContain("fi");
    expect(screen.getByTestId("locale").textContent).toContain("fi-FI");
    expect(screen.getByTestId("start").textContent).toContain("Aloita ostokset");
    expect(screen.getByTestId("one").textContent).toContain("1 tuote");
    expect(screen.getByTestId("two").textContent).toContain("2 tuotetta");

    await waitFor(() => {
      expect(document.title).toContain("tiedä paljonko on jäljellä");
    });
  });

  it("switches to Ukrainian, persists it, updates document language and applies all plural categories", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider initialLanguage="en" initialCatalog={{}}>
        <Probe />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "switch-uk" }));

    await waitFor(() => {
      expect(screen.getByTestId("language").textContent).toContain("uk");
    });

    expect(screen.getByTestId("locale").textContent).toContain("uk-UA");
    expect(screen.getByTestId("start").textContent).toContain("Почати покупки");
    expect(screen.getByTestId("one").textContent).toContain("1 товар");
    expect(screen.getByTestId("two").textContent).toContain("2 товари");
    expect(screen.getByTestId("five").textContent).toContain("5 товарів");
    expect(screen.getByTestId("twenty-one").textContent).toContain("21 товар");
    expect(document.documentElement.getAttribute("lang")).toBe("uk");
    expect(window.localStorage.getItem("shopping-budget:language")).toBe("uk");
  });

  it("returns cleanly to English fallback copy", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider initialLanguage="uk" initialCatalog={ukMessages}>
        <Probe />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "switch-en" }));

    await waitFor(() => {
      expect(screen.getByTestId("language").textContent).toContain("en");
    });

    expect(screen.getByTestId("locale").textContent).toContain("en-FI");
    expect(screen.getByTestId("start").textContent).toContain("Start shopping");
    expect(screen.getByTestId("one").textContent).toContain("1 item");
    expect(screen.getByTestId("two").textContent).toContain("2 items");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("keeps the selected language active for the session when preference persistence fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    render(
      <I18nProvider initialLanguage="en" initialCatalog={{}}>
        <Probe />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "switch-fi" }));

    await waitFor(() => {
      expect(screen.getByTestId("language").textContent).toContain("fi");
    });

    expect(screen.getByTestId("start").textContent).toContain("Aloita ostokset");
    expect(screen.getByTestId("save-failed").textContent).toContain("true");
    expect(document.documentElement.getAttribute("lang")).toBe("fi");
  });
});
