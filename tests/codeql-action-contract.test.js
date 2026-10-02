import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const codeqlWorkflow = await readFile(".github/workflows/codeql.yml", "utf8");
const dependabotConfig = await readFile(".github/dependabot.yml", "utf8");

describe("CodeQL action supply-chain contract", () => {
  it("pins init and analyze to the same immutable CodeQL Action release", () => {
    const uses = [
      ...codeqlWorkflow.matchAll(
        /github\/codeql-action\/(init|analyze)@([0-9a-f]{40}) # v([0-9.]+)/gu,
      ),
    ];

    expect(uses).toHaveLength(2);
    expect(new Set(uses.map((match) => match[2])).size).toBe(1);
    expect(new Set(uses.map((match) => match[3])).size).toBe(1);
  });

  it("groups future CodeQL action updates so init and analyze cannot drift independently", () => {
    expect(dependabotConfig).toContain("codeql-action:");
    expect(dependabotConfig).toContain('- "github/codeql-action/*"');
  });
});
