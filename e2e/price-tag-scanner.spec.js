import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test as base } from "@playwright/test";

const priceTagCamera = fileURLToPath(
  new URL("./fixtures/price-tag-1-29.mjpeg", import.meta.url),
);
const priceReaderSwitchedOff = process.env.VITE_SHOPPING_PRICE_OCR === "0";

const test = base.extend({
  launchOptions: [
    async ({ browserName, launchOptions }, use) => {
      await use(
        browserName === "chromium"
          ? {
              ...launchOptions,
              args: [
                ...(launchOptions.args ?? []),
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
                `--use-file-for-fake-video-capture=${priceTagCamera}`,
              ],
            }
          : launchOptions,
      );
    },
    { scope: "worker" },
  ],
});

const scan = (page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

test("reads a price tag with the self-hosted engine and adds it only after confirmation", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(browserName !== "chromium", "Fake camera capture from a file is Chromium-only.");
  test.skip(priceReaderSwitchedOff, "This build switches price tag reading off.");
  test.setTimeout(120_000);

  await context.grantPermissions(["camera"]);
  const requests = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: /^(Scan barcode or price tag|Scan barcode, product or price tag|Recognize product or read price tag|Read price tag)$/ }).click();

  await expect(
    page.getByRole("heading", { name: /^(Find the product|Read the price tag)$/ }),
  ).toBeVisible();

  const priceMode = page.getByRole("button", { name: "Price tag" });

  if ((await priceMode.count()) > 0) {
    await priceMode.click();
  }

  await expect(page.getByRole("heading", { name: "Read the price tag" })).toBeVisible();
  await expect(page.getByText(/Fit the price tag inside the frame/)).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Read price" }).click();

  await expect(page.getByRole("heading", { name: "Choose the price" })).toBeVisible({
    timeout: 60_000,
  });
  expect((await scan(page)).violations).toEqual([]);

  await page.getByRole("button", { name: "€1.29" }).click();
  await expect(page.getByRole("textbox", { name: "Price" })).toHaveValue("1.29");
  await expect(page.getByText(/Read from the price tag/)).toBeVisible();
  await page.getByRole("button", { name: "Add · €1.29" }).click();

  await expect(
    page.getByRole("button", { name: /^(Scan barcode or price tag|Scan barcode, product or price tag|Recognize product or read price tag|Read price tag)$/ }),
  ).toBeFocused();

  const origin = new URL(page.url()).origin;
  const external = requests.filter(
    (url) => !url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:"),
  );

  expect(external).toEqual([]);
  expect(requests.some((url) => /\/assets\/ocr\/.+\/lang\/fin\.traineddata\.gz$/.test(url))).toBe(true);
  expect(requests.some((url) => /\/assets\/ocr\/.+\/tesseract-core-(simd-)?lstm\.wasm$/.test(url))).toBe(true);
});

test("offers no price tag reading when the build switches it off", async ({ page }) => {
  test.skip(!priceReaderSwitchedOff, "This build ships price tag reading.");

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();

  await expect(page.getByRole("textbox", { name: "Price" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Read price tag" })).toHaveCount(0);
});
