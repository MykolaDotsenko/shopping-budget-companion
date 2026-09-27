import AxeBuilder from "@axe-core/playwright";
import { expect, test as base } from "@playwright/test";

import { writeFakeBarcodeCamera } from "./support/fake-barcode-camera.js";

const MILK = "6414893386303";
const cameraFile = writeFakeBarcodeCamera(MILK);
const scannerSwitchedOff = process.env.VITE_SHOPPING_BARCODE_SCANNER === "0";

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
                `--use-file-for-fake-video-capture=${cameraFile}`,
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

test("scans a product from the camera, names it once and recognises it next time", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(browserName !== "chromium", "Fake camera capture from a video file is Chromium-only.");
  test.skip(scannerSwitchedOff, "This build switches the barcode scanner off.");

  await context.grantPermissions(["camera"]);
  const requests = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();

  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: /^(Scan barcode|Scan barcode or product|Scan barcode or price tag|Scan barcode, product or price tag)$/ }).click();

  await expect(page.getByRole("heading", { name: "New product" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(`Barcode ${MILK}`)).toBeVisible();
  expect((await scan(page)).violations).toEqual([]);

  await page.getByLabel("Name for next time (optional)").fill("Milk 1L");
  await page.getByRole("button", { name: /^(Type price|Continue to price)$/ }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("1.29");
  await page.getByRole("button", { name: "Add · €1.29" }).click();

  await expect(page.getByRole("button", { name: /^(Scan barcode|Scan barcode or product|Scan barcode or price tag|Scan barcode, product or price tag)$/ })).toBeFocused();
  await expect(page.getByText("Milk 1L").first()).toBeVisible();

  await page.getByRole("button", { name: /^(Scan barcode|Scan barcode or product|Scan barcode or price tag|Scan barcode, product or price tag)$/ }).click();
  await expect(page.getByRole("heading", { name: "Milk 1L" })).toBeVisible({
    timeout: 20_000,
  });

  const origin = new URL(page.url()).origin;
  const external = requests.filter((url) => !url.startsWith(origin) && !url.startsWith("data:"));

  expect(external).toEqual([]);
  expect(requests.some((url) => url.endsWith(".wasm"))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^(Scan barcode|Scan barcode or product|Scan barcode or price tag|Scan barcode, product or price tag)$/ })).toBeFocused();
});

test("offers no barcode scanning when the build switches the scanner off", async ({ page }) => {
  test.skip(!scannerSwitchedOff, "This build ships the barcode scanner.");

  await page.goto("/");
  await page.getByRole("button", { name: "€50", exact: true }).click();

  await expect(page.getByRole("button", { name: "Add price" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Scan barcode|Scan barcode or product|Scan barcode or price tag|Scan barcode, product or price tag)$/ })).toHaveCount(0);
});
