import { describe, expect, it } from "vitest";

import {
  releaseTag,
  validateReleaseContract,
} from "../scripts/validate-release-contract.mjs";

const valid = (overrides = {}) => ({
  version: "2.0.0",
  sourceSha: "a".repeat(40),
  qualityRunId: "123456",
  packageVersion: "2.0.0",
  ...overrides,
});

describe("release contract", () => {
  it("accepts a stable package-matching release", () => {
    expect(validateReleaseContract(valid())).toEqual({
      version: "2.0.0",
      tag: "v2.0.0",
      sourceSha: "a".repeat(40),
      qualityRunId: "123456",
    });
    expect(releaseTag("2.0.0")).toBe("v2.0.0");
  });

  it.each(["2", "2.0", "v2.0.0", "2.0.0-beta.1", "02.0.0", "2.0.0+build"])(
    "rejects non-canonical stable version %s",
    (version) => {
      expect(() =>
        validateReleaseContract(valid({ version, packageVersion: version })),
      ).toThrow(/exact stable semver/);
    },
  );

  it("rejects a version that differs from package.json", () => {
    expect(() =>
      validateReleaseContract(valid({ version: "2.0.1" })),
    ).toThrow(/does not match requested release/);
  });

  it.each([
    "",
    "abc",
    "A".repeat(40),
    "a".repeat(39),
    `${"a".repeat(39)}g`,
  ])("rejects invalid source SHA %s", (sourceSha) => {
    expect(() =>
      validateReleaseContract(valid({ sourceSha })),
    ).toThrow(/40-character Git SHA/);
  });

  it.each(["", "0", "-1", "1.2", "abc"])(
    "rejects invalid Quality run id %s",
    (qualityRunId) => {
      expect(() =>
        validateReleaseContract(valid({ qualityRunId })),
      ).toThrow(/positive integer/);
    },
  );
});
