import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ACTIVE_TRIP_KEY = "budget-cart:active-trip";
const HISTORY_KEY = "budget-cart:history";
const SET_ASIDE_PREFIX = "budget-cart:set-aside:";
const T = "2026-09-21T09:00:00.000Z";

const completedTrip = (id) => ({
  id,
  status: "completed",
  currency: "EUR",
  budgetMinor: 5000,
  safetyBufferMinor: 0,
  startedAt: T,
  completedAt: T,
  items: [],
});

const partlyDamagedHistory = JSON.stringify({
  schemaVersion: 1,
  savedAt: T,
  data: {
    trips: [completedTrip("trip-kept"), { ...completedTrip("trip-bad"), note: 1 }],
  },
});

const seed = async (page, entries) => {
  await page.goto("/");
  await page.evaluate((values) => {
    localStorage.clear();

    for (const [key, value] of Object.entries(values)) {
      localStorage.setItem(key, value);
    }
  }, entries);
  await page.reload();
};

const storedEntries = (page) =>
  page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

const scan = (page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

test("keeps shopping and finishes after setting damaged history aside", async ({
  page,
}) => {
  await seed(page, { [HISTORY_KEY]: partlyDamagedHistory });

  await expect(
    page.getByText("Some trip history could not be restored"),
  ).toBeVisible();

  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();

  await expect(page.getByRole("alert")).toContainText("needs attention");
  expect((await storedEntries(page))[HISTORY_KEY]).toBe(partlyDamagedHistory);

  await page.getByRole("button", { name: "Set aside…" }).click();
  await expect(page.getByText(/1 readable trip will be kept/)).toBeVisible();
  await page.getByRole("button", { name: "Set aside now" }).click();

  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Finish trip" }).click();

  await expect(
    page.getByRole("heading", { name: "Your shopping trip is complete" }),
  ).toBeVisible();

  const stored = await storedEntries(page);
  const history = JSON.parse(stored[HISTORY_KEY]);
  const backups = Object.entries(stored).filter(([key]) =>
    key.startsWith(SET_ASIDE_PREFIX),
  );

  expect(history.data.trips.map((trip) => trip.id)).toContain("trip-kept");
  expect(history.data.trips).toHaveLength(2);
  expect(backups).toHaveLength(1);
  expect(JSON.parse(backups[0][1]).raw).toBe(partlyDamagedHistory);
});

test("sets an unreadable saved trip aside and starts a new saved trip", async ({
  page,
}) => {
  await seed(page, { [ACTIVE_TRIP_KEY]: "{broken" });

  await expect(
    page.getByRole("heading", { name: "Saved trip needs recovery" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Set aside and start fresh" }).click();

  await page.getByRole("button", { name: "€25", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();

  const stored = await storedEntries(page);
  const backup = Object.entries(stored).find(([key]) =>
    key.startsWith(SET_ASIDE_PREFIX),
  );

  expect(JSON.parse(stored[ACTIVE_TRIP_KEY]).data.budgetMinor).toBe(2500);
  expect(JSON.parse(backup[1]).raw).toBe("{broken");
});

test("continues without saving when saved data cannot be read", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = function getItem() {
      throw new DOMException("Storage read failed", "UnknownError");
    };
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Saved trip could not be restored safely" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Continue without saving" }).click();
  await expect(
    page.getByRole("heading", { name: "How much can you spend today?" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "€25", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("2.50");
  await page.getByRole("button", { name: "Add · €2.50" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();

  await expect(
    page.getByRole("heading", { name: "Your shopping trip is complete" }),
  ).toBeVisible();
  await expect(page.getByText("Not saving on this device")).toBeVisible();
});

test("continues without saving when browser storage is blocked", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "replacing window.localStorage is only portable in Chromium; the read-failure case covers every engine",
  );

  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "This browser isn’t letting the app save" }),
  ).toBeVisible();
  await expect(page.getByText("The saved record stays untouched", { exact: false })).toHaveCount(0);

  await expect(
    page.getByRole("button", { name: "Set aside and start fresh" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Continue without saving" }).click();

  await page.getByRole("button", { name: "€25", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("2.50");
  await page.getByRole("button", { name: "Add · €2.50" }).click();

  await expect(page.getByText("Not saving on this device")).toBeVisible();
  await expect(page.getByText("€22.50", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Trip history can't be read right now")).toHaveCount(0);
});

test("finishes a trip whose saved timestamps are ahead of the device clock", async ({
  page,
}) => {
  const ahead = "2099-01-01T00:00:00.000Z";
  const trip = {
    schemaVersion: 1,
    savedAt: ahead,
    data: {
      id: "trip-ahead",
      status: "active",
      currency: "EUR",
      budgetMinor: 5000,
      safetyBufferMinor: 0,
      startedAt: T,
      items: [
        {
          id: "item-ahead",
          unitPriceMinor: 379,
          quantity: 1,
          priceSource: { kind: "manual" },
          priceConfidence: { kind: "confirmed", confirmedAt: ahead },
          createdAt: ahead,
          updatedAt: ahead,
        },
      ],
    },
  };

  await seed(page, { [ACTIVE_TRIP_KEY]: JSON.stringify(trip) });

  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Finish trip" }).click();

  await expect(
    page.getByRole("heading", { name: "Your shopping trip is complete" }),
  ).toBeVisible();

  const history = JSON.parse((await storedEntries(page))[HISTORY_KEY]);
  expect(history.data.trips[0]).toMatchObject({
    id: "trip-ahead",
    completedAt: ahead,
  });
});

test("has no detectable WCAG A/AA violations in recovery and history repair states", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "axe scan runs once in Chromium");

  await seed(page, { [ACTIVE_TRIP_KEY]: "{broken" });
  expect((await scan(page)).violations).toEqual([]);

  for (const appearance of ["light", "dark", "aurora"]) {
    await seed(page, {
      [HISTORY_KEY]: partlyDamagedHistory,
      "shopping-budget:appearance": appearance,
    });
    await page.getByRole("button", { name: "Set aside…" }).click();
    expect((await scan(page)).violations).toEqual([]);
  }
});

test("makes room when browser storage is full and saves the open trip again", async ({
  page,
}) => {
  const at = (minute) => new Date(Date.UTC(2026, 0, 1, 8, minute)).toISOString();
  const trips = Array.from({ length: 30 }, (_, index) => ({
    ...completedTrip(`trip-${index}`),
    startedAt: at(index * 2),
    completedAt: at(index * 2 + 1),
    items: Array.from({ length: 20 }, (_, item) => ({
      id: `item-${index}-${item}`,
      label: `Grocery item ${item}`,
      unitPriceMinor: 199,
      quantity: 1,
      priceSource: { kind: "manual" },
      priceConfidence: { kind: "confirmed", confirmedAt: at(index * 2) },
      createdAt: at(index * 2),
      updatedAt: at(index * 2),
    })),
  }));

  await seed(page, {
    [HISTORY_KEY]: JSON.stringify({ schemaVersion: 1, savedAt: at(100), data: { trips } }),
  });
  await expect(
    page.getByRole("button", { name: "View trip history · 30" }),
  ).toBeVisible();

  await page.evaluate(() => {
    let index = 0;

    for (const size of [1_000_000, 100_000, 10_000, 1_000, 100, 10]) {
      for (;;) {
        try {
          localStorage.setItem(`filler:${index}`, "x".repeat(size));
          index += 1;
        } catch {
          break;
        }
      }
    }
  });

  await page.getByRole("button", { name: "€50", exact: true }).click();

  const notice = page.getByRole("complementary", {
    name: "Storage for this app is full",
  });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Make room…" }).click();
  await notice.getByRole("button", { name: "Remove 3 oldest trips" }).click();

  await expect(page.getByText("Saved on this device")).toBeVisible();

  const stored = await storedEntries(page);
  expect(JSON.parse(stored[HISTORY_KEY]).data.trips).toHaveLength(27);
  expect(JSON.parse(stored[HISTORY_KEY]).data.trips[0].id).toBe("trip-3");
  expect(JSON.parse(stored[ACTIVE_TRIP_KEY]).data.budgetMinor).toBe(5000);
});
