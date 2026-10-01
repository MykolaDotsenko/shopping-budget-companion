import { describe, expect, it } from "vitest";

import { validateReleaseContract } from "../scripts/validate-release-contract.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";

const valid = (overrides = {}) => ({
  version: "2.0.0",
  sourceSha: SHA,
  mainSha: SHA,
  qualityRunId: "765",
  packageManifest: { version: "2.0.0" },
  qualityRun: {
    id: 765,
    name: "Quality",
    event: "push",
    head_branch: "main",
    head_sha: SHA,
    status: "completed",
    conclusion: "success",
  },
  artifacts: [
    {
      id: 101,
      name: "pages-site",
      expired: false,
      digest: "sha256:" + "a".repeat(64),
    },
    {
      id: 102,
      name: "sbom-" + SHA,
      expired: false,
      digest: "sha256:" + "b".repeat(64),
    },
  ],
  ...overrides,
});

describe("release contract", () => {
  it("binds a release to the current tested main artifact and SBOM", () => {
    expect(validateReleaseContract(valid())).toEqual({
      schemaVersion: 1,
      product: "shopping-budget-companion",
      version: "2.0.0",
      tag: "v2.0.0",
      prerelease: false,
      sourceSha: SHA,
      qualityRunId: 765,
      pagesSite: {
        artifactId: 101,
        digest: "sha256:" + "a".repeat(64),
      },
      sbom: {
        artifactId: 102,
        digest: "sha256:" + "b".repeat(64),
        name: "sbom-" + SHA,
      },
    });
  });

  it("accepts a canonical prerelease and marks it explicitly", () => {
    const result = validateReleaseContract(
      valid({
        version: "2.1.0-beta.1",
        packageManifest: { version: "2.1.0-beta.1" },
      }),
    );

    expect(result.tag).toBe("v2.1.0-beta.1");
    expect(result.prerelease).toBe(true);
  });

  it("rejects a release that is not the current main head", () => {
    expect(() =>
      validateReleaseContract(valid({ mainSha: "f".repeat(40) })),
    ).toThrow(/not the current main head/);
  });

  it("rejects non-canonical SemVer prerelease identifiers", () => {
    expect(() =>
      validateReleaseContract(
        valid({
          version: "2.1.0-beta.01",
          packageManifest: { version: "2.1.0-beta.01" },
        }),
      ),
    ).toThrow(/leading zeroes/);
  });

  it("rejects a version that does not match package.json", () => {
    expect(() =>
      validateReleaseContract(
        valid({ packageManifest: { version: "2.0.1" } }),
      ),
    ).toThrow(/does not match requested release/);
  });

  it("rejects a Quality run from the wrong event, branch, revision or result", () => {
    for (const patch of [
      { event: "pull_request" },
      { head_branch: "feature" },
      { head_sha: "f".repeat(40) },
      { conclusion: "failure" },
      { status: "in_progress" },
    ]) {
      expect(() =>
        validateReleaseContract(
          valid({ qualityRun: { ...valid().qualityRun, ...patch } }),
        ),
      ).toThrow(/not a completed successful push-to-main run/);
    }
  });

  it("rejects missing, duplicate, expired or unverified release artifacts", () => {
    const base = valid().artifacts;

    expect(() =>
      validateReleaseContract(valid({ artifacts: base.slice(0, 1) })),
    ).toThrow(/sbom-/);

    expect(() =>
      validateReleaseContract(
        valid({ artifacts: [...base, { ...base[0], id: 103 }] }),
      ),
    ).toThrow(/pages-site; found 2/);

    expect(() =>
      validateReleaseContract(
        valid({
          artifacts: [
            { ...base[0], expired: true },
            base[1],
          ],
        }),
      ),
    ).toThrow(/explicitly present and unexpired/);

    expect(() =>
      validateReleaseContract(
        valid({
          artifacts: [
            { ...base[0], expired: undefined },
            base[1],
          ],
        }),
      ),
    ).toThrow(/explicitly present and unexpired/);

    expect(() =>
      validateReleaseContract(
        valid({
          artifacts: [
            { ...base[0], digest: null },
            base[1],
          ],
        }),
      ),
    ).toThrow(/SHA-256 artifact digest/);
  });
});
