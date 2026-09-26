import { expect, test } from "@playwright/test";

const ACTIVE_TRIP_KEY = "budget-cart:active-trip";
const HISTORY_KEY = "budget-cart:history";
const stagedSite = process.env.PLAYWRIGHT_STAGED_SITE === "1";
const appPath = stagedSite ? "/shopping-budget-companion/" : "/";

const waitForInstalledShell = async (page) => {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not available in this browser.");
    }

    await navigator.serviceWorker.ready;
  });
};

test("exposes an installable shell and precaches the application entry", async ({
  page,
}) => {
  await page.goto(appPath);

  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");

  expect(manifestHref).not.toBeNull();

  const manifest = await page.evaluate(async (href) => {
    const response = await fetch(href);
    return response.json();
  }, manifestHref);

  expect(manifest).toMatchObject({
    name: "Shopping Budget Companion",
    short_name: "Shop Budget",
    display: "standalone",
    start_url: "./",
    scope: "./",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192" }),
      expect.objectContaining({ sizes: "512x512" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );
  expect(manifest.theme_color).toBe(
    await page.locator('meta[name="theme-color"]').getAttribute("content"),
  );
  expect(manifest.screenshots.length).toBeGreaterThan(0);

  for (const screenshot of manifest.screenshots) {
    const served = await page.evaluate(async ({ href, src }) => {
      const response = await fetch(new URL(src, new URL(href, location.href)));
      const image = await createImageBitmap(await response.blob());

      return {
        ok: response.ok,
        type: response.headers.get("content-type"),
        sizes: `${image.width}x${image.height}`,
      };
    }, { href: manifestHref, src: screenshot.src });

    expect(served).toEqual({ ok: true, type: screenshot.type, sizes: screenshot.sizes });
  }

  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  expect(
    await page.locator('meta[property="og:image"]').getAttribute("content"),
  ).toMatch(/^https:\/\/.+\/og-image\.jpg$/);

  await waitForInstalledShell(page);

  const shell = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const cacheNames = await caches.keys();
    const indexUrl = new URL("index.html", location.href).href;
    let cachedIndex = false;

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);

      if ((await cache.match(indexUrl, { ignoreSearch: true })) !== undefined) {
        cachedIndex = true;
        break;
      }
    }

    return {
      scopePath: new URL(registration.scope).pathname,
      cacheCount: cacheNames.length,
      cachedIndex,
    };
  });

  expect(shell.scopePath).toBe(appPath);
  expect(shell.cacheCount).toBeGreaterThan(0);
  expect(shell.cachedIndex).toBe(true);
});

test("sends old camera tools links to the shopping app", async ({ page }) => {
  await page.goto(`${appPath}camera-tools/index.html`);

  await expect(page).toHaveURL(new RegExp(`${appPath}$`));
  await expect(page.getByRole("button", { name: "€50", exact: true })).toBeVisible();
});

test("restores active and completed shopping state with the browser offline", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Playwright WebKit cannot reliably navigate in offline mode; install and precache coverage runs separately.",
  );

  await page.goto(appPath);
  await waitForInstalledShell(page);

  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  if (stagedSite) {
    const studyProbeUrl = new URL(
      "study/nonexistent-baseline/",
      page.url(),
    ).href;
    const studyProbePage = await context.newPage();

    try {
      const response = await studyProbePage.goto(studyProbeUrl, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status()).toBe(404);
    } finally {
      await studyProbePage.close();
    }
  }

  await page.getByRole("button", { name: "€50", exact: true }).click();
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByRole("textbox", { name: "Price" }).fill("4.79");
  await page.getByRole("button", { name: "Add · €4.79" }).click();

  const activeBeforeOffline = await page.evaluate(
    (key) => localStorage.getItem(key),
    ACTIVE_TRIP_KEY,
  );
  expect(activeBeforeOffline).not.toBeNull();

  await context.setOffline(true);

  try {
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Know what’s left" }),
    ).toBeVisible();
    await expect(
      page.getByText("€4.79 of €50.00", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("€45.21", { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Finish trip" }).click();
    await page.getByRole("button", { name: "Finish trip" }).click();

    await expect(
      page.getByRole("heading", {
        name: "Your shopping trip is complete",
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();

    await expect(
      page.getByRole("button", { name: "View trip history · 1" }),
    ).toBeVisible();

    const durableOfflineState = await page.evaluate(
      ({ activeKey, historyKey }) => ({
        active: localStorage.getItem(activeKey),
        history: JSON.parse(localStorage.getItem(historyKey)),
      }),
      { activeKey: ACTIVE_TRIP_KEY, historyKey: HISTORY_KEY },
    );

    expect(durableOfflineState.active).toBeNull();
    expect(durableOfflineState.history.data.trips).toHaveLength(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "View trip history · 1" })
      .click();

    await expect(page.getByText("€4.79 cart total")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("links a readable privacy page from the start screen", async ({ page }) => {
  await page.goto(appPath);

  const privacy = page.getByRole("link", { name: "Privacy" });
  await expect(privacy).toHaveAttribute("href", `${appPath}privacy/`);
  await expect(page.getByRole("link", { name: "Feedback" })).toHaveAttribute(
    "href",
    /github\.com\/MykolaDotsenko\/shopping-budget-companion\/issues\/new/,
  );

  await privacy.click();

  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await expect(
    page.getByText("never sent to us or to anyone else", { exact: false }),
  ).toBeVisible();

  await page.getByRole("link", { name: "← Back to the app" }).click();

  await expect(
    page.getByRole("heading", { name: "How much can you spend today?" }),
  ).toBeVisible();
});

test("offers the browser's install prompt on the start screen and remembers the answer", async ({
  page,
}) => {
  await page.goto(appPath);

  await page.evaluate(() => {
    window.installPromptCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = () => {
      window.installPromptCalls += 1;
      return Promise.resolve();
    };
    window.dispatchEvent(event);
  });

  await expect(page.getByRole("heading", { name: "Install the app" })).toBeVisible();
  await page.getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Install the app" })).toHaveCount(0);
  expect(await page.evaluate(() => window.installPromptCalls)).toBe(1);

  await page.reload();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = () => Promise.resolve();
    window.dispatchEvent(event);
  });

  await expect(
    page.getByRole("heading", { name: "How much can you spend today?" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Install the app" })).toHaveCount(0);
});

test.describe("on Safari for iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  });

  test("suggests Add to Home Screen before the first trip and not once trips are saved", async ({
    page,
  }) => {
    await page.goto(appPath);

    await expect(
      page.getByRole("heading", { name: "Add it to your Home Screen first" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "€50", exact: true }).click();
    await page.getByRole("button", { name: "Add price" }).click();
    await page.getByRole("textbox", { name: "Price" }).fill("4.79");
    await page.getByRole("button", { name: "Add · €4.79" }).click();
    await page.getByRole("button", { name: "Finish trip" }).click();
    await page.getByRole("button", { name: "Finish trip" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    await expect(
      page.getByRole("heading", { name: "How much can you spend today?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Add it to your Home Screen first" }),
    ).toHaveCount(0);
  });
});
