import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { applyGuardedBuildBrandingHtml } from "../scripts/guarded-build-branding.mjs";

const publicHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="theme-color" content="#f4f1eb" />
    <meta name="application-name" content="Shopping Budget Companion" />
    <meta
      name="description"
      content="Set a shopping limit, add prices as you go and always see what’s left before checkout. No account, no bank connection, works offline once opened."
    />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>Shopping Budget Companion — know what’s left before checkout</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("internal shopping build metadata", () => {
  it("specializes QA/beta metadata without changing unrelated document content", () => {
    const branded = applyGuardedBuildBrandingHtml(publicHtml, {
      title: "Shopping Budget Companion — Retention Beta",
      description:
        "Internal Shopping Budget Companion real-store retention beta with privacy-safe local evidence.",
    });

    expect(branded).toContain(
      "<title>Shopping Budget Companion — Retention Beta</title>",
    );
    expect(branded).toContain(
      'content="Internal Shopping Budget Companion real-store retention beta with privacy-safe local evidence."',
    );
    expect(branded).toContain(
      '<meta name="theme-color" content="#f4f1eb" />',
    );
    expect(branded).toContain(
      '<meta name="robots" content="noindex,nofollow,noarchive" />',
    );
    expect(branded).toContain(
      '<meta name="application-name" content="Shopping Budget Companion" />',
    );
    expect(branded).toContain('href="/favicon.svg"');
    expect(branded).toContain('<div id="root"></div>');
  });

  it("fails closed when the expected public metadata changes unexpectedly", () => {
    expect(() =>
      applyGuardedBuildBrandingHtml("<html></html>", {
        title: "Shopping Budget Companion — QA",
        description: "Internal QA.",
      }),
    ).toThrow(/could not find expected title/i);
  });

  it("keeps the public source metadata on the shopping product", async () => {
    const sourceIndex = await readFile(
      resolve(process.cwd(), "index.html"),
      "utf8",
    );

    expect(sourceIndex).toContain(
      "<title>Shopping Budget Companion — know what’s left before checkout</title>",
    );
    expect(sourceIndex).toContain('property="og:image"');
    expect(sourceIndex).toContain('rel="apple-touch-icon"');
    expect(sourceIndex).toContain(
      'name="application-name" content="Shopping Budget Companion"',
    );
    expect(sourceIndex).toContain('href="/favicon.svg"');
    expect(sourceIndex).not.toContain("noindex,nofollow,noarchive");
  });

  it("keeps the favicon aligned with the remaining-room identity", async () => {
    const mark = await readFile(
      resolve(process.cwd(), "public/favicon.svg"),
      "utf8",
    );

    expect(mark).toContain('viewBox="0 0 64 64"');
    expect(mark).toContain('fill="#315f4f"');
    expect(mark).toContain('stroke="#fffdf9"');
    expect(mark).not.toMatch(/linearGradient|radialGradient/i);
    expect(mark).not.toContain("€");
    expect(mark).not.toContain(">+<");
  });
});
