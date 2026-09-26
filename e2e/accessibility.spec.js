import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const scan = async (page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

test("has no detectable WCAG A/AA violations on the start screen", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("has no detectable WCAG A/AA violations with the install offer on the start screen", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = () => Promise.resolve();
    window.dispatchEvent(event);
  });
  await expect(page.getByRole("heading", { name: "Install the app" })).toBeVisible();

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("has no detectable WCAG A/AA violations through the explicit Dark core flow", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.getByRole("button", { name: "Dark", exact: true }).click();

  let results = await scan(page);
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "€50", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();

  results = await scan(page);
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Add price" }).click();
  await expect(
    page.getByRole("heading", { name: "What does this item cost?" }),
  ).toBeVisible();

  results = await scan(page);
  expect(results.violations).toEqual([]);

  await page.getByRole("textbox", { name: "Price" }).fill("53.41");
  await page.getByRole("button", { name: "Add · €53.41" }).click();
  await expect(
    page.getByRole("heading", { name: "Add this price anyway?" }),
  ).toBeVisible();

  results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("has no detectable WCAG A/AA violations through the explicit Aurora core flow", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.getByRole("button", { name: "Aurora", exact: true }).click();

  let results = await scan(page);
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "€50", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();

  results = await scan(page);
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Add price" }).click();
  await expect(
    page.getByRole("heading", { name: "What does this item cost?" }),
  ).toBeVisible();

  results = await scan(page);
  expect(results.violations).toEqual([]);

  await page.getByRole("textbox", { name: "Price" }).fill("53.41");
  await page.getByRole("button", { name: "Add · €53.41" }).click();
  await expect(
    page.getByRole("heading", { name: "Add this price anyway?" }),
  ).toBeVisible();

  results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("has no detectable WCAG A/AA violations with the recent-budget shortcut", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await expect(
    page.getByRole("button", { name: /Shop again/i }),
  ).toBeVisible();

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("@beta has no detectable WCAG A/AA violations in the expanded retention beta panel", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");

  await page.getByRole("button", { name: "Beta evidence" }).click();
  await expect(
    page.getByRole("heading", { name: "Local beta evidence" }),
  ).toBeVisible();

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("has no detectable WCAG A/AA violations on the active-trip screen", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("has no detectable WCAG A/AA violations on the price-entry surface", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();

  await expect(
    page.getByRole("heading", { name: "What does this item cost?" }),
  ).toBeVisible();

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("has no detectable WCAG A/AA violations on Recent Items and restores current-price trigger focus", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("1.39");
  await page.getByText("Name for next time", { exact: false }).click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Milk 1L");
  await page.getByRole("button", { name: "Add · €1.39" }).click();

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Shop again" }).click();

  await expect(
    page.getByRole("heading", { name: "Recent Items" }),
  ).toBeVisible();

  if (browserName === "chromium") {
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  }

  const currentPrice = page.getByRole("button", {
    name: "Enter current price for Milk 1L",
  });
  await currentPrice.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "What does this item cost?" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Price" })).toHaveValue("");

  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("button", { name: "Enter current price for Milk 1L" }),
  ).toBeFocused();
});

test("has no detectable WCAG A/AA violations on budget adjustment and restores focus", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();

  const adjustBudget = page.getByRole("button", { name: "Adjust budget" });
  await adjustBudget.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Adjust budget" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Budget" }),
  ).toBeFocused();

  if (browserName === "chromium") {
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  }

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Adjust budget" }),
  ).toBeFocused();
});

test("has no detectable WCAG A/AA violations on the item-correction surface", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();
  await page.getByRole("button", { name: "Edit" }).click();

  await expect(
    page.getByRole("heading", { name: "Edit price and quantity" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Price" }),
  ).toBeFocused();

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("has no detectable WCAG A/AA violations on finish, completed-summary, and history surfaces", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await page.getByRole("button", { name: "Finish trip" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Ready to finish this trip?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Keep shopping" }),
  ).toBeFocused();

  let results = await scan(page);
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Finish trip" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your shopping trip is complete",
    }),
  ).toBeVisible();

  results = await scan(page);
  expect(results.violations).toEqual([]);

  await page
    .getByRole("button", { name: "View trip history" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Past shopping trips" }),
  ).toBeVisible();

  results = await scan(page);
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Add receipt total" }).click();
  await expect(page.getByRole("textbox", { name: "Receipt total" })).toBeFocused();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter the receipt total first.");

  results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("keeps history data confirmations accessible and restores trigger focus", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page
    .getByRole("button", { name: "View trip history" })
    .click();

  const clearHistory = page.getByRole("button", {
    name: /Clear trip history/,
  });
  await clearHistory.focus();
  await page.keyboard.press("Enter");

  const confirmation = page.getByRole("region", {
    name: "Confirm clearing trip history",
  });
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();

  if (browserName === "chromium") {
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  }

  await page.keyboard.press("Escape");
  await expect(clearHistory).toBeFocused();
});

test("has no detectable WCAG A/AA violations when cancelling an empty trip", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();

  await expect(
    page.getByRole("heading", { name: "Nothing to finish yet" }),
  ).toBeVisible();
  const results = await scan(page);
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Cancel trip" }).click();
  await expect(
    page.getByRole("heading", { name: "How much can you spend today?" }),
  ).toBeFocused();
});

test("returns focus to Finish trip when finish review is cancelled with Escape", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();

  const finish = page.getByRole("button", { name: "Finish trip" });
  await finish.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("button", { name: "Keep shopping" }),
  ).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("button", { name: "Finish trip" }),
  ).toBeFocused();
});

test("has no detectable WCAG A/AA violations on nominal over-budget review", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("53.41");
  await page.getByRole("button", { name: "Add · €53.41" }).click();

  const cancel = page.getByRole("button", { name: "Change price" });
  await expect(cancel).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Add this price anyway?" }),
  ).toBeVisible();

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("keeps the core shopping semantics visible in forced-colours mode", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "forced-colours gate runs in Chromium");

  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();

  await expect(
    page.getByLabel("Current spending status"),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Shopping budget used" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add price" }),
  ).toBeVisible();
});

test("returns keyboard focus to the edited item after cancel and save", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  const edit = page.getByRole("button", { name: "Edit" });
  await edit.focus();
  await page.keyboard.press("Enter");

  const price = page.getByRole("textbox", { name: "Price" });
  await expect(price).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Edit" })).toBeFocused();

  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Price" }).fill("5.29");
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("main").getByText("Item updated. €44.71 left.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeFocused();
});

test("retains visible focus across the core keyboard path", async ({
  page,
}) => {
  await page.goto("/");

  const quickBudget = page.getByRole("button", {
    name: "€50",
    exact: true,
  });

  await quickBudget.focus();
  await expect(quickBudget).toBeFocused();

  const focusOutline = await quickBudget.evaluate(
    (element) => getComputedStyle(element).outlineStyle,
  );

  expect(focusOutline).not.toBe("none");

  await page.keyboard.press("Enter");

  const addPrice = page.getByRole("button", { name: "Add price" });
  await addPrice.focus();
  await expect(addPrice).toBeFocused();

  const activeOutline = await addPrice.evaluate(
    (element) => getComputedStyle(element).outlineStyle,
  );

  expect(activeOutline).not.toBe("none");
});
