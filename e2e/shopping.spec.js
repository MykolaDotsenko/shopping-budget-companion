import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const expectedEvidenceBuildRevision =
  process.env.EVIDENCE_BUILD_REVISION;

const ACTIVE_TRIP_KEY = "budget-cart:active-trip";
const HISTORY_KEY = "budget-cart:history";
const PRICE_MEMORY_KEY = "budget-cart:price-memory";
const RETENTION_BETA_KEY = "budget-cart:qa:retention-v1";
const APPEARANCE_KEY = "shopping-budget:appearance";

const guardedKey = (key) => `surface:/|${key}`;
const GUARDED_ACTIVE_TRIP_KEY = guardedKey(ACTIVE_TRIP_KEY);
const GUARDED_RETENTION_BETA_KEY = guardedKey(RETENTION_BETA_KEY);

const startQuickBudget = async (page, label = "€50") => {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
};

const hasHorizontalOverflow = (page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );

test("keeps explicit Light appearance durable and independent from shopping state", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Light", exact: true }).click();

  const initialAppearance = await page.evaluate((appearanceKey) => {
    const style = getComputedStyle(document.documentElement);

    return {
      mode: document.documentElement.dataset.appearance,
      theme: document.documentElement.dataset.theme,
      persisted: localStorage.getItem(appearanceKey),
      page: style.getPropertyValue("--shopping-page").trim(),
      panel: style.getPropertyValue("--shopping-panel").trim(),
      accent: style.getPropertyValue("--shopping-accent").trim(),
      themeColor: document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content"),
    };
  }, APPEARANCE_KEY);

  expect(initialAppearance).toEqual({
    mode: "light",
    theme: "light",
    persisted: "light",
    page: "#f4f1eb",
    panel: "#fffefa",
    accent: "#2f604f",
    themeColor: "#f4f1eb",
  });

  await startQuickBudget(page);
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  const shoppingBeforeReload = await page.evaluate(
    ({ activeKey, appearanceKey }) => ({
      active: localStorage.getItem(activeKey),
      appearance: localStorage.getItem(appearanceKey),
    }),
    { activeKey: ACTIVE_TRIP_KEY, appearanceKey: APPEARANCE_KEY },
  );

  expect(shoppingBeforeReload.active).not.toBeNull();
  expect(shoppingBeforeReload.appearance).toBe("light");

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(page.getByText("€45.21", { exact: true }).first()).toBeVisible();

  const afterReload = await page.evaluate((appearanceKey) => ({
    mode: document.documentElement.dataset.appearance,
    theme: document.documentElement.dataset.theme,
    persisted: localStorage.getItem(appearanceKey),
  }), APPEARANCE_KEY);

  expect(afterReload).toEqual({
    mode: "light",
    theme: "light",
    persisted: "light",
  });
});

test("keeps explicit Dark appearance durable and independent from shopping state", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Dark", exact: true }).click();

  const initialAppearance = await page.evaluate((appearanceKey) => {
    const style = getComputedStyle(document.documentElement);

    return {
      mode: document.documentElement.dataset.appearance,
      theme: document.documentElement.dataset.theme,
      persisted: localStorage.getItem(appearanceKey),
      page: style.getPropertyValue("--shopping-page").trim(),
      panel: style.getPropertyValue("--shopping-panel").trim(),
      raised: style.getPropertyValue("--shopping-raised").trim(),
      accent: style.getPropertyValue("--shopping-accent").trim(),
      themeColor: document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content"),
    };
  }, APPEARANCE_KEY);

  expect(initialAppearance).toEqual({
    mode: "dark",
    theme: "dark",
    persisted: "dark",
    page: "#0f1210",
    panel: "#181d19",
    raised: "#262d27",
    accent: "#8fd4b7",
    themeColor: "#0f1210",
  });

  await startQuickBudget(page);
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  const beforeReload = await page.evaluate(
    ({ activeKey, appearanceKey }) => ({
      active: localStorage.getItem(activeKey),
      appearance: localStorage.getItem(appearanceKey),
    }),
    { activeKey: ACTIVE_TRIP_KEY, appearanceKey: APPEARANCE_KEY },
  );

  expect(beforeReload.active).not.toBeNull();
  expect(beforeReload.appearance).toBe("dark");

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(page.getByText("€45.21", { exact: true }).first()).toBeVisible();

  const afterReload = await page.evaluate((appearanceKey) => ({
    mode: document.documentElement.dataset.appearance,
    theme: document.documentElement.dataset.theme,
    persisted: localStorage.getItem(appearanceKey),
  }), APPEARANCE_KEY);

  expect(afterReload).toEqual({
    mode: "dark",
    theme: "dark",
    persisted: "dark",
  });
});

test("keeps explicit Aurora appearance durable and independent from shopping state", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Aurora", exact: true }).click();

  const initialAppearance = await page.evaluate((appearanceKey) => {
    const style = getComputedStyle(document.documentElement);

    return {
      mode: document.documentElement.dataset.appearance,
      theme: document.documentElement.dataset.theme,
      persisted: localStorage.getItem(appearanceKey),
      page: style.getPropertyValue("--shopping-page").trim(),
      panel: style.getPropertyValue("--shopping-panel").trim(),
      raised: style.getPropertyValue("--shopping-raised").trim(),
      accent: style.getPropertyValue("--shopping-accent").trim(),
      themeColor: document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content"),
    };
  }, APPEARANCE_KEY);

  expect(initialAppearance).toEqual({
    mode: "aurora",
    theme: "aurora",
    persisted: "aurora",
    page: "#070912",
    panel: "#101625",
    raised: "#1c2640",
    accent: "#8de8ff",
    themeColor: "#070912",
  });

  await startQuickBudget(page);
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(page.getByText("€45.21", { exact: true }).first()).toBeVisible();

  const afterReload = await page.evaluate((appearanceKey) => ({
    mode: document.documentElement.dataset.appearance,
    theme: document.documentElement.dataset.theme,
    persisted: localStorage.getItem(appearanceKey),
  }), APPEARANCE_KEY);

  expect(afterReload).toEqual({
    mode: "aurora",
    theme: "aurora",
    persisted: "aurora",
  });
});

test("System appearance follows OS colour scheme without mutating the saved preference", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const darkSystem = await page.evaluate((appearanceKey) => ({
    appearance: document.documentElement.dataset.appearance,
    theme: document.documentElement.dataset.theme,
    persisted: localStorage.getItem(appearanceKey),
    page: getComputedStyle(document.documentElement)
      .getPropertyValue("--shopping-page")
      .trim(),
    themeColor: document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute("content"),
  }), APPEARANCE_KEY);

  expect(darkSystem).toEqual({
    appearance: "system",
    theme: "dark",
    persisted: null,
    page: "#0f1210",
    themeColor: "#0f1210",
  });

  await page.emulateMedia({ colorScheme: "light" });

  await expect.poll(
    () => page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("light");

  const lightSystem = await page.evaluate((appearanceKey) => ({
    appearance: document.documentElement.dataset.appearance,
    theme: document.documentElement.dataset.theme,
    persisted: localStorage.getItem(appearanceKey),
    themeColor: document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute("content"),
  }), APPEARANCE_KEY);

  expect(lightSystem).toEqual({
    appearance: "system",
    theme: "light",
    persisted: null,
    themeColor: "#f4f1eb",
  });
});

test("reduced motion removes decorative shopping transitions without changing the flow", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await startQuickBudget(page);

  const remainingAmount = page
    .getByLabel("Current spending status")
    .locator("p")
    .first();

  expect(
    await remainingAmount.evaluate(
      (element) => element.getAnimations().length,
    ),
  ).toBe(0);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  const updatedRemaining = page
    .getByLabel("Current spending status")
    .getByText("€45.21", { exact: true });

  await expect(updatedRemaining).toBeVisible();
  expect(
    await updatedRemaining.evaluate(
      (element) => element.getAnimations().length,
    ),
  ).toBe(0);
});

test("starts a EUR 50 trip and restores it exactly after reload", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "How much can you spend today?",
    }),
  ).toBeVisible();

  await startQuickBudget(page);

  await expect(
    page.getByText("€50.00", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("left", { exact: true })).toBeVisible();
  await expect(
    page.getByText("€0.00 of €50.00", { exact: true }),
  ).toBeVisible();

  const persistedBeforeReload = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACTIVE_TRIP_KEY,
  );

  expect(persistedBeforeReload).not.toBeNull();

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(page.getByText("left", { exact: true })).toBeVisible();
  await expect(
    page.getByText("€0.00 of €50.00", { exact: true }),
  ).toBeVisible();

  const persistedAfterReload = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACTIVE_TRIP_KEY,
  );

  expect(persistedAfterReload).toBe(persistedBeforeReload);
});

test("starts with a safety buffer and makes safe remaining unambiguous", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByText("Add a safety buffer", { exact: true })
    .click();
  await page.getByLabel("Safety buffer").fill("2");

  await startQuickBudget(page);

  await expect(
    page.getByText("€48.00", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("safe to spend", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("plus a €2.00 safety buffer", { exact: true }),
  ).toBeVisible();

  const capacity = page.getByRole("progressbar", {
    name: "Shopping budget used",
  });

  await expect(capacity).toHaveAttribute(
    "aria-valuetext",
    "€0.00 in cart of €50.00. €48.00 safe to spend, plus a €2.00 safety buffer.",
  );
});

test("adjusts budget and safety buffer as one canonical mutation", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await page.getByRole("button", { name: "Adjust budget" }).click();

  const budget = page.getByRole("textbox", { name: "Budget" });
  const buffer = page.getByRole("textbox", { name: /Safety buffer/ });

  await budget.fill("4.00");
  await buffer.fill("");

  await expect(
    page.getByText("Current cart will be €0.79 over this budget."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save budget" }).click();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(page.getByText("€0.79", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("over your limit", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Budget updated. €0.79 over your limit.", {
      exact: true,
    }),
  ).toBeVisible();

  const persisted = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    ACTIVE_TRIP_KEY,
  );

  expect(persisted.data).toMatchObject({
    budgetMinor: 400,
    safetyBufferMinor: 0,
  });
  expect(persisted.data.items).toHaveLength(1);
});

test("keeps an added item in memory when its persistence write fails", async ({
  page,
}) => {
  await page.addInitScript((storageKey) => {
    const original = Storage.prototype.setItem;
    let activeTripWrites = 0;

    Storage.prototype.setItem = function setItem(key, value) {
      if (key === storageKey) {
        activeTripWrites += 1;

        if (activeTripWrites === 2) {
          throw new DOMException(
            "Simulated add persistence failure",
            "UnknownError",
          );
        }
      }

      return original.call(this, key, value);
    };
  }, ACTIVE_TRIP_KEY);

  await page.goto("/");
  await startQuickBudget(page);

  await expect(
    page.getByText("This trip is not being saved right now"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(
    page.getByText("€4.79 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("€45.21", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("This trip is not being saved right now"),
  ).toBeVisible();
  await expect(
    page.getByText(/Keep this page open until checkout/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry" }),
  ).toBeVisible();

  const persisted = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    ACTIVE_TRIP_KEY,
  );

  expect(persisted.data.items).toHaveLength(0);
});

test("commits exact price and quantity, persists them, and restores the same cart", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("1.29");
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "Increase quantity" }).click();

  await expect(page.getByText("€1.29 × 3 = €3.87")).toBeVisible();
  await expect(
    page.getByText("After adding: €46.13 left"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add · €3.87" }).click();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(page.getByText("3 items", { exact: true })).toBeVisible();
  await expect(
    page.getByText("€3.87 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("€46.13", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("€1.29 × 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("€3.87 added. €46.13 left.", { exact: true })).toBeVisible();

  const persistedBeforeReload = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    ACTIVE_TRIP_KEY,
  );

  expect(persistedBeforeReload.data.items).toHaveLength(1);
  expect(persistedBeforeReload.data.items[0]).toMatchObject({
    unitPriceMinor: 129,
    quantity: 3,
    priceSource: { kind: "manual" },
  });
  expect(persistedBeforeReload.data.items[0].priceConfidence.kind).toBe(
    "confirmed",
  );

  await page.reload();

  await expect(
    page.getByText("€3.87 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("€1.29 × 3", { exact: true })).toBeVisible();
  await expect(page.getByText("3 items", { exact: true })).toBeVisible();
});

test("edits price and quantity, removes the item, undoes removal, and restores the correction", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await expect(page.getByText("Confirmed · Manual")).toHaveCount(0);

  await page.getByRole("button", { name: "Edit" }).click();

  const editedPrice = page.getByRole("textbox", { name: "Price" });
  await expect(editedPrice).toHaveValue("4.79");
  await editedPrice.fill("5.29");
  await page
    .getByRole("button", { name: "Increase edited quantity" })
    .click();

  await expect(
    page.getByText("After saving: €39.42 left"),
  ).toBeVisible();
  await expect(
    page.getByText("Cart would be €10.58 of €50.00."),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Save changes" })
    .click();

  await expect(
    page.getByText("€10.58 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("€5.29 × 2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Item updated. €39.42 left.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit" }),
  ).toBeFocused();

  const persistedAfterEdit = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    ACTIVE_TRIP_KEY,
  );

  expect(persistedAfterEdit.data.items).toHaveLength(1);
  expect(persistedAfterEdit.data.items[0]).toMatchObject({
    unitPriceMinor: 529,
    quantity: 2,
    priceSource: { kind: "manual" },
  });
  expect(persistedAfterEdit.data.items[0].priceConfidence.kind).toBe(
    "confirmed",
  );

  await page.getByRole("button", { name: "Remove" }).click();

  await expect(
    page.getByText("€0.00 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Item removed. €50.00 left.", {
      exact: true,
    }),
  ).toBeVisible();

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible();
  await undo.click();

  await expect(
    page.getByText("€10.58 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("€5.29 × 2", { exact: true }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByText("€10.58 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("€5.29 × 2", { exact: true }),
  ).toBeVisible();
});

test("offers one-action Undo, persists the restored cart, and survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await expect(
    page.getByRole("main").getByText("€4.79 added. €45.21 left.", { exact: true }),
  ).toBeVisible();

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible();
  await undo.click();

  await expect(
    page.getByRole("main").getByText("Last change undone. €50.00 left.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("€0.00 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);

  const persisted = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    ACTIVE_TRIP_KEY,
  );
  expect(persisted.data.items).toHaveLength(0);

  await page.reload();

  await expect(
    page.getByText("€0.00 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
});

test("keeps the complete price-entry fast path inside compact phone viewports", async ({
  page,
}) => {
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 414, height: 896 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await startQuickBudget(page);

    await page.getByRole("button", { name: "Add price" }).click();
    await page.getByRole("textbox", { name: "Price" }).fill("4.79");

    const zeroKey = page.getByRole("button", { name: "Digit 0" });
    const zeroBox = await zeroKey.boundingBox();
    expect(zeroBox).not.toBeNull();

    if (zeroBox !== null) {
      expect(zeroBox.y + zeroBox.height).toBeLessThanOrEqual(viewport.height);
    }

    expect(await hasHorizontalOverflow(page)).toBe(false);

    const add = page.getByRole("button", { name: "Add · €4.79" });
    const addBox = await add.boundingBox();
    expect(addBox).not.toBeNull();

    if (addBox !== null) {
      expect(addBox.y + addBox.height).toBeLessThanOrEqual(viewport.height);
    }

    const sheetFitsWithoutInternalScroll = await page
      .getByRole("main")
      .evaluate((main) => {
        const sheet = main.firstElementChild;

        if (!(sheet instanceof HTMLElement)) {
          return false;
        }

        return sheet.scrollHeight <= sheet.clientHeight + 1;
      });

    expect(sheetFitsWithoutInternalScroll).toBe(true);
  }
});

test("never hides a keypad key behind the Add bar, even with a buffer and a quantity", async ({
  page,
}) => {
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 412, height: 915 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText("Add a safety buffer", { exact: true }).click();
    await page.getByLabel("Safety buffer").fill("5");
    await page.getByRole("button", { name: "€25", exact: true }).click();
    await page.getByRole("button", { name: "Add price" }).click();
    await page.getByRole("button", { name: "Increase quantity" }).click();

    for (const key of ["Digit 1", "Digit 2", "Decimal separator", "Digit 4", "Digit 9"]) {
      await page.getByRole("button", { name: key, exact: true }).click();
    }

    await expect(page.getByRole("textbox", { name: "Price" })).toHaveValue("12.49");
    await expect(page.getByRole("button", { name: "Add · €24.98" })).toBeVisible();

    const coveredKeys = await page.getByLabel("Price keypad").evaluate((keypad) =>
      [...keypad.querySelectorAll("button")]
        .filter((key) => {
          const box = key.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

          return !(hit === key || key.contains(hit)) || box.bottom > window.innerHeight;
        })
        .map((key) => key.getAttribute("aria-label")),
    );

    expect(coveredKeys).toEqual([]);
  }
});

test("keeps price entry and over-budget correction usable at 200 percent text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  await startQuickBudget(page);
  await page.getByRole("button", { name: "Add price" }).click();

  const input = page.getByRole("textbox", { name: "Price" });
  await input.fill("53.41");

  expect(await hasHorizontalOverflow(page)).toBe(false);
  await expect(
    page.getByText("This puts you €3.41 over your limit."),
  ).toBeVisible();

  const add = page.getByRole("button", { name: "Add · €53.41" });
  await add.scrollIntoViewIfNeeded();
  await add.click();

  await expect(
    page.getByRole("heading", { name: "Add this price anyway?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Change price" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add €53.41 anyway" }),
  ).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test("reduced motion preserves a complete add and undo path", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await expect(
    page.getByText("€4.79 of €50.00", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText("€0.00 of €50.00", { exact: true }),
  ).toBeVisible();
});

test("core manual shopping remains functional after the page goes offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await context.setOffline(true);

  try {
    await startQuickBudget(page);
    await page.getByRole("button", { name: "Add price" }).click();
    await page.getByRole("textbox", { name: "Price" }).fill("1.29");
    await page.getByRole("button", { name: "Add · €1.29" }).click();

    await expect(
      page.getByText("€1.29 of €50.00", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("€48.71", { exact: true }).first(),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("completes the Sprint B flagship exact-money shopping journey", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByText("Add a safety buffer", { exact: true }).click();
  await page.getByLabel("Safety buffer").fill("2");
  await startQuickBudget(page);

  const addPrice = async (price, expectedButton) => {
    await page.getByRole("button", { name: "Add price" }).click();
    await page.getByRole("textbox", { name: "Price" }).fill(price);
    await page.getByRole("button", { name: expectedButton }).click();
  };

  await addPrice("3.79", "Add · €3.79");
  await addPrice("12.50", "Add · €12.50");

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("1.29");
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.getByText("€1.29 × 3 = €3.87")).toBeVisible();
  await page.getByRole("button", { name: "Add · €3.87" }).click();

  await expect(
    page.getByText("€20.16 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("€27.84", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add price" }).click();
  const typoInput = page.getByRole("textbox", { name: "Price" });
  await typoInput.fill("89.00");
  await expect(
    page.getByText("This puts you €59.16 over your limit."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await typoInput.fill("8.90");
  await expect(
    page.getByText("After adding: €18.94 safe to spend"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add · €8.90" }).click();

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("19.50");
  await expect(
    page.getByText("This item uses €0.56 of your safety buffer."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add · €19.50" }).click();

  await expect(
    page.getByText("€48.56 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("safe to spend", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "€1.44 of your €2.00 safety buffer left",
      { exact: true },
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("2.00");
  await expect(
    page.getByText("This puts you €0.56 over your limit."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add · €2.00" }).click();

  await expect(
    page.getByRole("heading", { name: "Add this price anyway?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change price" }).click();

  await expect(page.getByRole("textbox", { name: "Price" })).toHaveValue("2.00");
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("1.00");
  await page.getByRole("button", { name: "Add · €1.00" }).click();

  await expect(
    page.getByText("€49.56 of €50.00", { exact: true }),
  ).toBeVisible();

  const beforeReload = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    ACTIVE_TRIP_KEY,
  );
  expect(beforeReload.data.items).toHaveLength(6);

  await page.reload();

  await expect(
    page.getByText("€49.56 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("8 items", { exact: true })).toBeVisible();

  await addPrice("0.20", "Add · €0.20");

  await expect(
    page.getByText("€49.76 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("€0.24 of your €2.00 safety buffer left", {
      exact: true,
    }),
  ).toBeVisible();
});

test("finishes a trip loss-safely, reconciles checkout, persists history, and restores history after reload", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

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

  await page.getByRole("button", { name: "Finish trip" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Your shopping trip is complete",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Receipt total" }),
  ).toHaveValue("");

  const persistedAfterFinish = await page.evaluate(
    ({ activeKey, historyKey }) => ({
      active: localStorage.getItem(activeKey),
      history: JSON.parse(localStorage.getItem(historyKey)),
    }),
    { activeKey: ACTIVE_TRIP_KEY, historyKey: HISTORY_KEY },
  );

  expect(persistedAfterFinish.active).toBeNull();
  expect(persistedAfterFinish.history.schemaVersion).toBe(1);
  expect(persistedAfterFinish.history.data.trips).toHaveLength(1);
  expect(persistedAfterFinish.history.data.trips[0]).toMatchObject({
    status: "completed",
    budgetMinor: 5000,
  });
  expect(persistedAfterFinish.history.data.trips[0].items).toHaveLength(1);
  expect(persistedAfterFinish.history.data.trips[0].items[0]).toMatchObject({
    unitPriceMinor: 479,
    quantity: 1,
  });

  await page
    .getByRole("textbox", { name: "Receipt total" })
    .fill("5.00");
  await page
    .getByRole("button", { name: "Save receipt total" })
    .click();

  await expect(
    page.getByText("You paid €0.21 more than your cart total."),
  ).toBeVisible();

  const persistedAfterCheckout = await page.evaluate(
    (historyKey) => JSON.parse(localStorage.getItem(historyKey)),
    HISTORY_KEY,
  );
  expect(
    persistedAfterCheckout.data.trips[0].actualCheckoutMinor,
  ).toBe(500);

  await page
    .getByRole("button", { name: "View trip history" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Past shopping trips" }),
  ).toBeVisible();
  await expect(page.getByText("€4.79 cart total")).toBeVisible();
  await expect(page.getByText("€5.00")).toBeVisible();
  await expect(
    page.getByText("Paid €0.21 more"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await expect(
    page.getByRole("heading", {
      name: "How much can you spend today?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View trip history · 1" }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("button", { name: "View trip history · 1" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View trip history · 1" })
    .click();
  await expect(page.getByText("€4.79 cart total")).toBeVisible();
  await expect(
    page.getByText("Paid €0.21 more"),
  ).toBeVisible();
});

test("adds a forgotten receipt total from trip history and keeps it after reload", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: /View trip history/ }).click();
  await expect(page.getByText("Not added", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add receipt total" }).click();
  await page.getByRole("textbox", { name: "Receipt total" }).fill("4.99");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "Receipt total saved.",
  );
  await expect(page.getByText("Paid €0.20 more", { exact: true })).toBeVisible();

  await page.reload();

  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    HISTORY_KEY,
  );
  expect(saved.data.trips[0].actualCheckoutMinor).toBe(499);

  await page.getByRole("button", { name: /View trip history/ }).click();
  await expect(page.getByText("€4.99", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change receipt total" }),
  ).toBeVisible();
});

test("keeps trip-history deletion independent from remembered prices", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("1.39");
  await page.getByText("Name for next time", { exact: false }).click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Milk 1L");
  await page.getByRole("button", { name: "Add · €1.39" }).click();

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page
    .getByRole("button", { name: "View trip history" })
    .click();

  const clearHistory = page.getByRole("button", {
    name: /Clear trip history/,
  });
  await clearHistory.click();

  const historyConfirmation = page.getByRole("region", {
    name: "Confirm clearing trip history",
  });
  await historyConfirmation
    .getByRole("button", { name: "Clear trip history" })
    .click();

  await expect(
    page.getByText("Trip history cleared from this device."),
  ).toBeVisible();
  await expect(
    page.getByText("No completed trips yet."),
  ).toBeVisible();

  const afterHistoryClear = await page.evaluate(
    ({ historyKey, memoryKey }) => ({
      history: JSON.parse(localStorage.getItem(historyKey)),
      memory: JSON.parse(localStorage.getItem(memoryKey)),
    }),
    { historyKey: HISTORY_KEY, memoryKey: PRICE_MEMORY_KEY },
  );

  expect(afterHistoryClear.history.data.trips).toHaveLength(0);
  expect(afterHistoryClear.memory.data.records).toHaveLength(1);
  expect(afterHistoryClear.memory.data.records[0]).toMatchObject({
    label: "Milk 1L",
    unitPriceMinor: 139,
  });

  await page.getByRole("button", { name: "Back" }).click();

  await expect(
    page.getByRole("heading", {
      name: "How much can you spend today?",
    }),
  ).toBeVisible();

  const rememberedDataEntry = page.getByRole("button", {
    name: "Manage remembered prices · 1",
  });
  await expect(rememberedDataEntry).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Manage remembered prices · 1",
    }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Manage remembered prices · 1" })
    .click();
  await page
    .getByRole("button", { name: /Clear remembered prices/ })
    .click();

  const memoryConfirmation = page.getByRole("region", {
    name: "Confirm clearing remembered prices",
  });
  await memoryConfirmation
    .getByRole("button", { name: "Clear remembered prices" })
    .click();

  await expect(
    page.getByText("Remembered item prices cleared from this device."),
  ).toBeVisible();

  const afterMemoryClear = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PRICE_MEMORY_KEY,
  );
  expect(afterMemoryClear.data.records).toHaveLength(0);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("button", { name: /remembered prices/i }),
  ).toHaveCount(0);
});

test("repeats the last spending plan immediately and after a later reload", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByText("Add a safety buffer", { exact: true }).click();
  await page.getByLabel("Safety buffer").fill("2");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Your shopping trip is complete",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Shop again" }).click();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(
    page.getByText("€48.00", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("€0.00 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Nothing in your cart yet.", { exact: true }),
  ).toBeVisible();

  const repeated = await page.evaluate(
    ({ activeKey, historyKey }) => ({
      active: JSON.parse(localStorage.getItem(activeKey)),
      history: JSON.parse(localStorage.getItem(historyKey)),
    }),
    { activeKey: ACTIVE_TRIP_KEY, historyKey: HISTORY_KEY },
  );

  expect(repeated.active.data).toMatchObject({
    budgetMinor: 5000,
    safetyBufferMinor: 200,
    items: [],
  });
  expect(repeated.history.data.trips).toHaveLength(1);

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Cancel trip" }).click();

  await page.reload();

  const cancelled = await page.evaluate(
    ({ activeKey, historyKey }) => ({
      active: localStorage.getItem(activeKey),
      history: JSON.parse(localStorage.getItem(historyKey)),
    }),
    { activeKey: ACTIVE_TRIP_KEY, historyKey: HISTORY_KEY },
  );

  expect(cancelled.active).toBeNull();
  expect(cancelled.history.data.trips).toHaveLength(1);

  const repeatShortcut = page.getByRole("button", { name: /Shop again/i });
  await expect(repeatShortcut).toContainText("€50.00 budget");
  await expect(repeatShortcut).toContainText("€2.00 safety buffer");

  await repeatShortcut.click();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(
    page.getByText("€48.00", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("€0.00 of €50.00", { exact: true }),
  ).toBeVisible();

  const laterRepeat = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    ACTIVE_TRIP_KEY,
  );

  expect(laterRepeat.data).toMatchObject({
    budgetMinor: 5000,
    safetyBufferMinor: 200,
    items: [],
  });
});

test("learns named completed items, reuses remembered prices, and keeps current-price override explicit", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("1.39");
  await page.getByText("Name for next time", { exact: false }).click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Milk 1L");
  await page.getByRole("button", { name: "Add · €1.39" }).click();

  await expect(
    page.getByText("€1.39 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Milk 1L", { exact: true })).toBeVisible();

  const memoryBeforeCompletion = await page.evaluate(
    (key) => localStorage.getItem(key),
    PRICE_MEMORY_KEY,
  );
  expect(memoryBeforeCompletion).toBeNull();

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();

  const learnedMemory = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PRICE_MEMORY_KEY,
  );

  expect(learnedMemory).toMatchObject({
    schemaVersion: 1,
    data: {
      records: [
        {
          label: "Milk 1L",
          productId: "label:milk 1l",
          currency: "EUR",
          unitPriceMinor: 139,
          source: { kind: "manual" },
        },
      ],
    },
  });

  await page.getByRole("button", { name: "Shop again" }).click();

  await expect(
    page.getByRole("heading", { name: "Recent Items" }),
  ).toBeVisible();
  await expect(page.getByText("Milk 1L", { exact: true })).toBeVisible();
  await expect(page.getByText(/Remembered · Seen/)).toBeVisible();

  await page
    .getByRole("button", { name: "Use remembered price for Milk 1L" })
    .click();

  await expect(
    page.getByText("€1.39 of €50.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Remembered price", { exact: true }),
  ).toBeVisible();

  const memoryAfterReuse = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PRICE_MEMORY_KEY,
  );
  expect(memoryAfterReuse.data.records[0].observedAt).toBe(
    learnedMemory.data.records[0].observedAt,
  );

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(
    page.getByText("€0.00 of €50.00", { exact: true }),
  ).toBeVisible();

  const currentPriceTrigger = page.getByRole("button", {
    name: "Enter current price for Milk 1L",
  });
  await currentPriceTrigger.click();

  await expect(
    page.getByText("Current price for", { exact: false }),
  ).toContainText("Milk 1L");

  const priceInput = page.getByRole("textbox", { name: "Price" });
  await expect(priceInput).toHaveValue("");

  await priceInput.fill("1.49");
  await page.getByRole("button", { name: "Add · €1.49" }).click();

  await expect(
    page.getByText("€1.49 of €50.00", { exact: true }),
  ).toBeVisible();
  const cartRegion = page.getByRole("region", {
    name: "What you have added",
  });
  await expect(
    cartRegion.getByText("Milk 1L", { exact: true }),
  ).toBeVisible();
  await expect(
    cartRegion.getByText("Remembered price", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();

  const updatedMemory = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PRICE_MEMORY_KEY,
  );

  expect(updatedMemory.data.records).toHaveLength(1);
  expect(updatedMemory.data.records[0]).toMatchObject({
    label: "Milk 1L",
    productId: "label:milk 1l",
    unitPriceMinor: 149,
    source: { kind: "manual" },
  });
  expect(updatedMemory.data.records[0].observedAt).not.toBe(
    learnedMemory.data.records[0].observedAt,
  );
});

test("@beta records privacy-safe retention evidence across a repeated trip", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("1.39");
  await page.getByText("Name for next time", { exact: false }).click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Milk 1L");
  await page.getByRole("button", { name: "Add · €1.39" }).click();

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Shop again" }).click();

  await page
    .getByRole("button", { name: "Use remembered price for Milk 1L" })
    .click();

  const evidence = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);

    if (raw === null) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const forbiddenKeys = new Set([
      "budgetMinor",
      "safetyBufferMinor",
      "unitPriceMinor",
      "lineTotalMinor",
      "label",
      "productId",
      "memoryId",
      "storeId",
      "actualCheckoutMinor",
    ]);
    const foundForbidden = [];

    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      if (value === null || typeof value !== "object") {
        return;
      }

      for (const [entryKey, entryValue] of Object.entries(value)) {
        if (forbiddenKeys.has(entryKey)) {
          foundForbidden.push(entryKey);
        }
        visit(entryValue);
      }
    };

    visit(parsed);

    return {
      parsed,
      foundForbidden,
    };
  }, GUARDED_RETENTION_BETA_KEY);

  expect(evidence).not.toBeNull();
  expect(evidence.foundForbidden).toEqual([]);
  expect(evidence.parsed).toMatchObject({
    version: 1,
    variant: "repeat-acceleration",
  });

  expect(evidence.parsed.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "trip_started",
        tripOrdinal: 1,
        source: "new",
      }),
      expect.objectContaining({
        type: "manual_entry_completed",
        tripOrdinal: 1,
      }),
      expect.objectContaining({
        type: "item_milestone",
        tripOrdinal: 1,
        itemCount: 1,
      }),
      expect.objectContaining({
        type: "trip_finished",
        tripOrdinal: 1,
      }),
      expect.objectContaining({
        type: "trip_started",
        tripOrdinal: 2,
        source: "repeat",
      }),
      expect.objectContaining({
        type: "remembered_item_used",
        tripOrdinal: 2,
      }),
      expect.objectContaining({
        type: "item_milestone",
        tripOrdinal: 2,
        itemCount: 1,
      }),
    ]),
  );
});

test("@beta downloads a privacy-safe retention export locally", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Beta evidence" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", {
      name: "Download JSON evidence",
    }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(
    /^retention-beta-\d{8}T\d{9}Z\.json$/,
  );

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const report = JSON.parse(
    await readFile(downloadPath, "utf8"),
  );

  expect(expectedEvidenceBuildRevision).toMatch(/^[0-9a-f]{40}$/);
  expect(report).toMatchObject({
    schemaVersion: 2,
    buildRevision: expectedEvidenceBuildRevision,
    privacy: {
      networkTransmission: false,
      containsMoney: false,
      containsItemNames: false,
      containsStoreHistory: false,
    },
    session: {
      version: 1,
      variant: "repeat-acceleration",
    },
  });
  expect(report.session.events).toEqual([]);
});

test("@beta freezes invalid retained evidence without overwriting it", async ({
  page,
}) => {
  const malformed = "{broken";

  await page.addInitScript(
    ({ key, raw }) => {
      localStorage.setItem(key, raw);
    },
    { key: GUARDED_RETENTION_BETA_KEY, raw: malformed },
  );

  await page.goto("/");

  await page.getByRole("button", { name: "Beta evidence" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "Retained beta evidence failed validation",
  );

  await expect(
    page.getByRole("button", { name: "Download JSON evidence" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Copy privacy-safe evidence" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Beta evidence" }).click();
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await expect(
    page.getByText("€4.79 of €50.00", { exact: true }),
  ).toBeVisible();

  const retained = await page.evaluate(
    (key) => localStorage.getItem(key),
    GUARDED_RETENTION_BETA_KEY,
  );

  expect(retained).toBe(malformed);
});

test("@beta keeps shopping usable when retention evidence storage fails", async ({
  page,
}) => {
  await page.addInitScript((retentionKey) => {
    const original = Storage.prototype.setItem;

    Storage.prototype.setItem = function setItem(key, value) {
      if (key === retentionKey) {
        throw new DOMException(
          "Simulated retention evidence write failure",
          "QuotaExceededError",
        );
      }

      return original.call(this, key, value);
    };
  }, GUARDED_RETENTION_BETA_KEY);

  await page.goto("/");

  await page.getByRole("button", { name: "Beta evidence" }).click();
  await page.getByRole("button", { name: "Reset evidence" }).click();
  await page.getByRole("button", { name: "Confirm reset" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "Evidence storage is unavailable",
  );
  await expect(page.getByRole("alert")).toContainText(
    "memory-only",
  );

  await page.getByRole("button", { name: "Beta evidence" }).click();
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await expect(
    page.getByText("€4.79 of €50.00", { exact: true }),
  ).toBeVisible();

  const persisted = await page.evaluate(
    ({ retentionKey, activeKey }) => ({
      retention: localStorage.getItem(retentionKey),
      active: localStorage.getItem(activeKey),
    }),
    {
      retentionKey: GUARDED_RETENTION_BETA_KEY,
      activeKey: GUARDED_ACTIVE_TRIP_KEY,
    },
  );

  expect(persisted.retention).toBeNull();
  expect(persisted.active).not.toBeNull();
});

test("@beta records an active-trip restore without placing beta UI over the trip", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

  await expect(
    page.getByRole("button", { name: "Beta evidence" }),
  ).toHaveCount(0);

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Beta evidence" }),
  ).toHaveCount(0);

  const evidence = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, GUARDED_RETENTION_BETA_KEY);

  expect(evidence).not.toBeNull();
  expect(evidence.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "trip_started",
        tripOrdinal: 1,
        source: "new",
      }),
      expect.objectContaining({
        type: "trip_restored",
        tripOrdinal: 1,
      }),
    ]),
  );
});

test("never clears the active trip when completed-history persistence fails", async ({
  page,
}) => {
  await page.addInitScript((historyKey) => {
    const original = Storage.prototype.setItem;

    Storage.prototype.setItem = function setItem(key, value) {
      if (key === historyKey) {
        throw new DOMException(
          "Simulated history write failure",
          "QuotaExceededError",
        );
      }

      return original.call(this, key, value);
    };
  }, HISTORY_KEY);

  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  const activeBeforeFinish = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACTIVE_TRIP_KEY,
  );
  expect(activeBeforeFinish).not.toBeNull();

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Storage for this app is full, so the trip was not saved to History. It is still open: choose Keep shopping to make room, then finish again.",
  );

  const persistedAfterFailure = await page.evaluate(
    ({ activeKey, historyKey }) => ({
      active: localStorage.getItem(activeKey),
      history: localStorage.getItem(historyKey),
    }),
    { activeKey: ACTIVE_TRIP_KEY, historyKey: HISTORY_KEY },
  );

  expect(persistedAfterFailure.active).toBe(activeBeforeFinish);
  expect(persistedAfterFailure.history).toBeNull();

  await page.getByRole("button", { name: "Keep shopping" }).click();
  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(
    page.getByText("€4.79 of €50.00", { exact: true }),
  ).toBeVisible();
});

test("enters recovery mode for malformed saved data without overwriting it", async ({
  page,
}) => {
  const malformed = "{broken";

  await page.addInitScript(
    ({ key, raw }) => {
      localStorage.setItem(key, raw);
    },
    { key: ACTIVE_TRIP_KEY, raw: malformed },
  );

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Saved trip needs recovery" }),
  ).toBeVisible();

  const preserved = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACTIVE_TRIP_KEY,
  );

  expect(preserved).toBe(malformed);

  await page
    .getByRole("button", { name: "Try reading again" })
    .click();

  await expect(
    page.getByText(
      "The saved trip still cannot be restored safely. Nothing was overwritten.",
    ),
  ).toBeVisible();

  const afterRetry = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACTIVE_TRIP_KEY,
  );

  expect(afterRetry).toBe(malformed);
});

test("preserves future-version data and explains the compatibility problem", async ({
  page,
}) => {
  const future = JSON.stringify({
    schemaVersion: 99,
    futurePayload: true,
  });

  await page.addInitScript(
    ({ key, raw }) => {
      localStorage.setItem(key, raw);
    },
    { key: ACTIVE_TRIP_KEY, raw: future },
  );

  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Saved trip needs a newer app version",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/preserved unchanged\. Update the app to use it/),
  ).toBeVisible();

  const preserved = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACTIVE_TRIP_KEY,
  );

  expect(preserved).toBe(future);
});

test("keeps the core active-trip controls inside compact phone viewports", async ({
  page,
}) => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await startQuickBudget(page);

    expect(await hasHorizontalOverflow(page)).toBe(false);

    const hero = page.getByLabel("Current spending status");
    const capacity = page.getByRole("progressbar", {
      name: "Shopping budget used",
    });
    const addPrice = page.getByRole("button", { name: "Add price" });

    await expect(hero).toBeVisible();
    await expect(capacity).toBeVisible();
    await expect(addPrice).toBeVisible();

    const addBox = await addPrice.boundingBox();
    expect(addBox).not.toBeNull();

    if (addBox !== null) {
      expect(addBox.y + addBox.height).toBeLessThanOrEqual(viewport.height);
    }
  }
});

test("supports keyboard add and returns focus to the canonical Add price action", async ({
  page,
}) => {
  await page.goto("/");

  const fifty = page.getByRole("button", {
    name: "€50",
    exact: true,
  });

  await fifty.focus();
  await expect(fifty).toBeFocused();
  await page.keyboard.press("Enter");

  const addPrice = page.getByRole("button", { name: "Add price" });
  await addPrice.focus();
  await expect(addPrice).toBeFocused();
  await page.keyboard.press("Enter");

  const price = page.getByRole("textbox", { name: "Price" });
  await expect(price).toBeFocused();
  await price.fill("4.79");
  await page.keyboard.press("Enter");

  const returnedAddPrice = page.getByRole("button", { name: "Add price" });
  await expect(returnedAddPrice).toBeFocused();
  await expect(page.getByRole("main").getByText("€4.79 added")).toBeVisible();
  await expect(
    page.getByText("€4.79 of €50.00", { exact: true }),
  ).toBeVisible();
});

test("remains usable at 200 percent text sizing without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  expect(await hasHorizontalOverflow(page)).toBe(false);
  await expect(
    page.getByRole("heading", {
      name: "How much can you spend today?",
    }),
  ).toBeVisible();

  await startQuickBudget(page);

  expect(await hasHorizontalOverflow(page)).toBe(false);
  await expect(
    page.getByRole("button", { name: "Add price" }),
  ).toBeVisible();
});

test("reduced motion keeps the shopping flow functional and removes capacity transition", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await startQuickBudget(page);

  const capacityFill = page
    .getByRole("progressbar", {
      name: "Shopping budget used",
    })
    .locator("span");

  const durationMs = await capacityFill.evaluate((element) => {
    const duration = getComputedStyle(element).transitionDuration;
    const numeric = Number.parseFloat(duration);

    return duration.endsWith("ms") ? numeric : numeric * 1000;
  });

  expect(durationMs).toBeLessThan(1);
  await expect(
    page.getByRole("button", { name: "Add price" }),
  ).toBeVisible();
});

test("keeps what is left in view while scrolling a long cart", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await startQuickBudget(page);

  for (const price of ["1.29", "2.49", "7.95", "5.49", "3.30", "4.10"]) {
    await page.getByRole("button", { name: "Add price" }).click();
    await page.getByRole("textbox", { name: "Price" }).fill(price);
    await page.getByRole("button", { name: `Add · €${price}` }).click();
  }

  const pinned = page.locator("main > p[aria-hidden='true']");
  await expect(pinned).toHaveCount(0);

  await page.getByRole("button", { name: "Remove" }).last().scrollIntoViewIfNeeded();

  await expect(pinned).toHaveText("€25.38 left");
});

test("removes only one item when Remove is double-tapped", async ({ page }) => {
  await page.goto("/");
  await startQuickBudget(page);

  for (const price of ["1.29", "2.49", "7.95"]) {
    await page.getByRole("button", { name: "Add price" }).click();
    await page.getByRole("textbox", { name: "Price" }).fill(price);
    await page.getByRole("button", { name: `Add · €${price}` }).click();
  }

  await page.getByRole("button", { name: "Remove" }).first().dblclick();

  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(2);
});

test("closes an open sheet with the browser's Back instead of leaving the app", async ({
  page,
}) => {
  await page.goto("/");
  await startQuickBudget(page);

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4");
  await page.goBack();

  await expect(page.getByRole("heading", { name: "Know what’s left" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Price" })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/");

  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Know what’s left" })).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => window.history.state?.shoppingSheet === true))
    .toBe(false);
});

test("returns from trip history to the start screen with Back", async ({ page }) => {
  await page.goto("/");
  await startQuickBudget(page);
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: /View trip history/ }).click();
  await expect(page.getByRole("heading", { name: "Past shopping trips" })).toBeVisible();

  await page.goBack();

  await expect(
    page.getByRole("heading", { name: "How much can you spend today?" }),
  ).toBeVisible();
});
