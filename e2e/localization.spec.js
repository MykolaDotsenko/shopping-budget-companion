import { expect, test } from "@playwright/test";

const assertCompactLanguageControl = async (page) => {
  const group = page.getByRole("group", { name: "App language" });
  await expect(group).toBeVisible();

  const box = await group.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeLessThanOrEqual(50);
  expect(box.width).toBeLessThanOrEqual(150);

  for (const name of ["English", "Suomi", "Українська"]) {
    const button = page.getByRole("button", { name });
    const buttonBox = await button.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox.width).toBeGreaterThanOrEqual(44);
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox.width).toBeLessThanOrEqual(48);
    expect(buttonBox.height).toBeLessThanOrEqual(48);
  }
};

test("Finnish localization survives the full core shopping flow and reload", async ({
  page,
}) => {
  await page.goto("/");

  await assertCompactLanguageControl(page);
  await page.getByRole("button", { name: "Suomi" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "fi");
  await expect(
    page.getByRole("heading", { name: "Kuinka paljon voit käyttää tänään?" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "fi");
  await expect(
    page.getByRole("heading", { name: "Kuinka paljon voit käyttää tänään?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Suomi" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "€50", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tiedä, paljonko on jäljellä" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Lisää hinta" }).click();
  await expect(
    page.getByRole("heading", { name: "Mitä tämä tuote maksaa?" }),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Hinta" }).fill("4,79");
  await page.getByRole("textbox", { name: "Tuotteen nimi" }).fill("Maito 1 l");
  await page.getByRole("button", { name: /Lisää ·/u }).click();

  await expect(page.getByText("Maito 1 l", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Päätä ostosreissu" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Oletko valmis päättämään tämän ostosreissun?",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Päätä ostosreissu" }).click();
  await expect(
    page.getByRole("heading", { name: "Ostosreissusi on valmis" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Näytä ostoshistoria" }).click();
  await expect(
    page.getByRole("heading", { name: "Aiemmat ostosreissut" }),
  ).toBeVisible();
});

test("Ukrainian localization survives the full core shopping flow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Українська" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(
    page.getByRole("heading", {
      name: "Скільки ви можете витратити сьогодні?",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "€50", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Знайте, скільки залишилось" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Додати ціну" }).click();
  await expect(
    page.getByRole("heading", { name: "Скільки коштує цей товар?" }),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Ціна" }).fill("4,79");
  await page.getByRole("textbox", { name: "Назва товару" }).fill("Молоко 1 л");
  await page.getByRole("button", { name: /Додати ·/u }).click();

  await expect(page.getByText("Молоко 1 л", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Завершити похід" }).click();
  await expect(
    page.getByRole("heading", { name: "Готові завершити цей похід?" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Завершити похід" }).click();
  await expect(
    page.getByRole("heading", { name: "Ваш похід за покупками завершено" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Переглянути історію покупок" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Попередні походи за покупками" }),
  ).toBeVisible();
});


test("privacy page follows, persists and returns the selected language", async ({
  page,
}) => {
  await page.goto("/privacy/");

  await page.getByRole("button", { name: "Українська" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(
    page.getByRole("heading", { name: "Конфіденційність", level: 1 }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Конфіденційність", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Українська" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("link", { name: "← Назад до застосунку" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Скільки ви можете витратити сьогодні?",
    }),
  ).toBeVisible();
});
