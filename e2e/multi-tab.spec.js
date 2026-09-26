import { expect, test } from "@playwright/test";

const ACTIVE_TRIP_KEY = "budget-cart:active-trip";
const HISTORY_KEY = "budget-cart:history";

const addNamedPrice = async (page, price, name) => {
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill(price);
  await page.getByText("Name for next time", { exact: false }).click();
  await page.getByRole("textbox", { name: "Item name" }).fill(name);
  await page.getByRole("button", { name: `Add · €${price}` }).click();
};

const storedLabels = (page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null
      ? []
      : JSON.parse(raw).data.items.map((item) => item.label);
  }, ACTIVE_TRIP_KEY);

test("a second tab follows the first and never overwrites its trip", async ({
  context,
}) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto("/");
  await second.goto("/");

  await first.getByRole("button", { name: "€75", exact: true }).click();
  await expect(
    second.getByRole("heading", { name: "Know what’s left" }),
  ).toBeVisible();
  await expect(second.getByText("€75.00", { exact: true }).first()).toBeVisible();

  await addNamedPrice(first, "2.50", "Bread");
  await addNamedPrice(second, "3.20", "Eggs");

  expect(await storedLabels(first)).toEqual(["Bread", "Eggs"]);
  await expect(first.getByText("Eggs", { exact: true })).toBeVisible();

  await first.getByRole("button", { name: "Finish trip" }).click();
  await first.getByRole("button", { name: "Finish trip" }).last().click();
  await expect(
    first.getByRole("heading", { name: "Your shopping trip is complete" }),
  ).toBeVisible();
  await expect(
    second.getByRole("heading", { name: "How much can you spend today?" }),
  ).toBeVisible();

  const stored = await first.evaluate(
    ([activeKey, historyKey]) => ({
      active: localStorage.getItem(activeKey),
      trips: JSON.parse(localStorage.getItem(historyKey)).data.trips.length,
    }),
    [ACTIVE_TRIP_KEY, HISTORY_KEY],
  );

  expect(stored).toEqual({ active: null, trips: 1 });
});
