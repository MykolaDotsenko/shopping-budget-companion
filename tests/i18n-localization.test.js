import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { messages as fiMessages } from "../src/app/locales/locale-fi.ts";
import { messages as ukMessages } from "../src/app/locales/locale-uk.ts";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scanRoots = [
  path.join(rootDir, "src", "app"),
  path.join(rootDir, "src", "features", "shopping"),
];

const ignoredFiles = new Set([
  path.join(rootDir, "src", "app", "i18n-context.ts"),
  path.join(rootDir, "src", "app", "i18n-core.ts"),
  path.join(rootDir, "src", "app", "i18n.tsx"),
  path.join(rootDir, "src", "features", "shopping", "translation.ts"),
]);

const dynamicKeys = [
  "Undo last add",
  "Undo last edit",
  "Undo last removal",
  "System",
  "Light",
  "Dark",
  "Aurora",
];

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "locales") {
        return [];
      }
      return sourceFiles(fullPath);
    }

    if (!entry.isFile() || !/\.(?:ts|tsx)$/u.test(entry.name) || ignoredFiles.has(fullPath)) {
      return [];
    }

    return [fullPath];
  });

const decodeLiteral = (value) =>
  value
    .replace(/\\(["'\\])/gu, "$1")
    .replace(/\\n/gu, "\n")
    .replace(/\\t/gu, "\t");

const placeholders = (value) =>
  [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)]
    .map((match) => match[1])
    .sort();

const collectSourceMessages = () => {
  const messages = new Set(dynamicKeys);
  const pluralKeys = new Set();

  for (const file of scanRoots.flatMap(sourceFiles)) {
    const source = fs.readFileSync(file, "utf8");

    for (const match of source.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/gu)) {
      messages.add(decodeLiteral(match[1]));
    }

    for (const match of source.matchAll(
      /\btp\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"/gu,
    )) {
      const one = decodeLiteral(match[1]);
      messages.add(one);
      pluralKeys.add(one);
    }
  }

  return { messages, pluralKeys };
};

const validateCatalog = (catalog, locale, sourceMessages, pluralKeys) => {
  const missing = [...sourceMessages].filter((key) => !(key in catalog)).sort();
  expect(missing, `missing ${locale} translations`).toEqual([]);

  for (const key of sourceMessages) {
    const translated = catalog[key];
    const expectedPlaceholders = placeholders(key);

    if (typeof translated === "string") {
      expect(
        placeholders(translated),
        `${locale} placeholders differ for "${key}"`,
      ).toEqual(expectedPlaceholders);
      continue;
    }

    expect(translated, `${locale} translation missing for "${key}"`).toBeTruthy();

    for (const [category, variant] of Object.entries(translated ?? {})) {
      expect(typeof variant, `${locale} ${category} variant missing for "${key}"`).toBe(
        "string",
      );
      expect(
        placeholders(variant),
        `${locale} ${category} placeholders differ for "${key}"`,
      ).toEqual(expectedPlaceholders);
    }
  }

  const requiredPluralCategories = new Intl.PluralRules(locale).resolvedOptions()
    .pluralCategories;

  for (const key of pluralKeys) {
    const translated = catalog[key];
    expect(
      typeof translated,
      `${locale} plural "${key}" must use category variants`,
    ).toBe("object");

    for (const category of requiredPluralCategories) {
      expect(
        translated?.[category],
        `${locale} plural "${key}" is missing category "${category}"`,
      ).toBeTruthy();
    }
  }
};

describe("localization catalogs", () => {
  const { messages, pluralKeys } = collectSourceMessages();

  it("covers every public Finnish UI message with matching placeholders and plurals", () => {
    validateCatalog(fiMessages, "fi-FI", messages, pluralKeys);
  });

  it("covers every public Ukrainian UI message with matching placeholders and plurals", () => {
    validateCatalog(ukMessages, "uk-UA", messages, pluralKeys);
  });

  it("keeps the localization surface substantial", () => {
    expect(messages.size).toBeGreaterThan(500);
  });
});
