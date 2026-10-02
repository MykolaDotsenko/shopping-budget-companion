import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  archiveTagForBranch,
  isArchiveRefValid,
  isDeletionStillSafe,
  selectArchiveBeforeDeleteBranches,
  selectBranchesForDeletion,
  selectExplicitlySupersededBranches,
} from "../scripts/cleanup-merged-branches.mjs";

const repo = "MykolaDotsenko/shopping-budget-companion";

const branch = (name, sha) => ({ name, commit: { sha } });
const pull = ({
  head,
  sha,
  merged = true,
  base = "main",
  repository = repo,
}) => ({
  merged_at: merged ? "2026-10-02T00:00:00Z" : null,
  base: { ref: base },
  head: {
    ref: head,
    sha,
    repo: repository === null ? null : { full_name: repository },
  },
});

const hygieneWorkflow = await readFile(
  ".github/workflows/repository-branch-hygiene.yml",
  "utf8",
);

describe("repository branch hygiene", () => {
  it("selects a merged branch only when its current head matches the merged PR head", () => {
    expect(
      selectBranchesForDeletion({
        repository: repo,
        branches: [
          branch("main", "main-sha"),
          branch("gh-pages", "pages-sha"),
          branch("feat/merged", "merged-sha"),
          branch("feat/changed-after-merge", "new-sha"),
        ],
        openPullRequests: [],
        closedPullRequests: [
          pull({ head: "feat/merged", sha: "merged-sha" }),
          pull({ head: "feat/changed-after-merge", sha: "old-sha" }),
        ],
      }),
    ).toEqual(["feat/merged"]);
  });

  it("never deletes a branch that still has an open pull request", () => {
    expect(
      selectBranchesForDeletion({
        repository: repo,
        branches: [branch("feat/active", "same-sha")],
        openPullRequests: [
          {
            head: {
              ref: "feat/active",
              sha: "same-sha",
              repo: { full_name: repo },
            },
          },
        ],
        closedPullRequests: [
          pull({ head: "feat/active", sha: "same-sha" }),
        ],
      }),
    ).toEqual([]);
  });

  it("does not delete closed but unmerged work", () => {
    expect(
      selectBranchesForDeletion({
        repository: repo,
        branches: [branch("experiment/unmerged", "unique-sha")],
        openPullRequests: [],
        closedPullRequests: [
          pull({
            head: "experiment/unmerged",
            sha: "unique-sha",
            merged: false,
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("does not treat forks or non-main merges as safe deletion evidence", () => {
    expect(
      selectBranchesForDeletion({
        repository: repo,
        branches: [
          branch("feat/fork", "fork-sha"),
          branch("feat/release-base", "release-sha"),
        ],
        openPullRequests: [],
        closedPullRequests: [
          pull({
            head: "feat/fork",
            sha: "fork-sha",
            repository: "someone/fork",
          }),
          pull({
            head: "feat/release-base",
            sha: "release-sha",
            base: "release",
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("sorts safe deletion candidates deterministically", () => {
    expect(
      selectBranchesForDeletion({
        repository: repo,
        branches: [
          branch("fix/z-last", "z"),
          branch("feat/a-first", "a"),
        ],
        openPullRequests: [],
        closedPullRequests: [
          pull({ head: "fix/z-last", sha: "z" }),
          pull({ head: "feat/a-first", sha: "a" }),
        ],
      }),
    ).toEqual(["feat/a-first", "fix/z-last"]);
  });


  it("deletes an explicitly superseded branch only at its verified exact SHA", () => {
    const manifest = {
      schemaVersion: 1,
      explicitlySuperseded: [
        {
          branch: "release/old",
          sha: "a".repeat(40),
          reason: "Superseded by the merged final release workflow.",
        },
      ],
    };

    expect(
      selectExplicitlySupersededBranches({
        repository: repo,
        branches: [branch("release/old", "a".repeat(40))],
        openPullRequests: [],
        manifest,
      }),
    ).toEqual(["release/old"]);

    expect(
      selectExplicitlySupersededBranches({
        repository: repo,
        branches: [branch("release/old", "b".repeat(40))],
        openPullRequests: [],
        manifest,
      }),
    ).toEqual([]);
  });

  it("never deletes an explicitly superseded ref if it becomes active again", () => {
    const manifest = {
      schemaVersion: 1,
      explicitlySuperseded: [
        {
          branch: "release/old",
          sha: "a".repeat(40),
          reason: "Superseded.",
        },
      ],
    };

    expect(
      selectExplicitlySupersededBranches({
        repository: repo,
        branches: [branch("release/old", "a".repeat(40))],
        openPullRequests: [
          {
            head: {
              ref: "release/old",
              sha: "a".repeat(40),
              repo: { full_name: repo },
            },
          },
        ],
        manifest,
      }),
    ).toEqual([]);
  });

  it("fails closed on malformed or duplicate explicit superseded entries", () => {
    expect(() =>
      selectExplicitlySupersededBranches({
        repository: repo,
        branches: [],
        openPullRequests: [],
        manifest: {
          schemaVersion: 1,
          explicitlySuperseded: [
            { branch: "old", sha: "not-a-sha", reason: "" },
          ],
        },
      }),
    ).toThrow(/exact lowercase 40-character SHA/);

    expect(() =>
      selectExplicitlySupersededBranches({
        repository: repo,
        branches: [],
        openPullRequests: [],
        manifest: {
          schemaVersion: 1,
          explicitlySuperseded: [
            { branch: "old", sha: "a".repeat(40), reason: "one" },
            { branch: "old", sha: "b".repeat(40), reason: "two" },
          ],
        },
      }),
    ).toThrow(/unique name/);
  });

  it("hard-protects study evidence refs from merged-head cleanup", () => {
    expect(
      selectBranchesForDeletion({
        repository: repo,
        branches: [branch("study/evidence-baseline-r1", "study-sha")],
        openPullRequests: [],
        closedPullRequests: [
          pull({
            head: "study/evidence-baseline-r1",
            sha: "study-sha",
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("hard-protects study evidence refs from explicit superseded cleanup", () => {
    expect(
      selectExplicitlySupersededBranches({
        repository: repo,
        branches: [branch("study/evidence-baseline-r1", "a".repeat(40))],
        openPullRequests: [],
        manifest: {
          schemaVersion: 1,
          explicitlySuperseded: [
            {
              branch: "study/evidence-baseline-r1",
              sha: "a".repeat(40),
              reason: "Even an explicit entry cannot bypass study protection.",
            },
          ],
        },
      }),
    ).toEqual([]);
  });


  it("revalidates the exact branch SHA immediately before deletion", () => {
    expect(
      isDeletionStillSafe({
        expectedSha: "expected-sha",
        currentRef: { object: { sha: "expected-sha" } },
        currentOpenPullRequests: [],
      }),
    ).toBe(true);

    expect(
      isDeletionStillSafe({
        expectedSha: "expected-sha",
        currentRef: { object: { sha: "new-sha" } },
        currentOpenPullRequests: [],
      }),
    ).toBe(false);
  });

  it("cancels deletion if a pull request opens after the initial snapshot", () => {
    expect(
      isDeletionStillSafe({
        expectedSha: "expected-sha",
        currentRef: { object: { sha: "expected-sha" } },
        currentOpenPullRequests: [{ number: 999 }],
      }),
    ).toBe(false);
  });


  it("selects archive-before-delete branches only at their exact inactive SHA", () => {
    const manifest = {
      schemaVersion: 1,
      explicitlySuperseded: [],
      archiveBeforeDelete: [
        {
          branch: "experiment/legacy",
          sha: "a".repeat(40),
          reason: "Preserve before cleanup.",
        },
      ],
    };

    expect(
      selectArchiveBeforeDeleteBranches({
        repository: repo,
        branches: [branch("experiment/legacy", "a".repeat(40))],
        openPullRequests: [],
        manifest,
      }),
    ).toEqual([
      {
        branch: "experiment/legacy",
        sha: "a".repeat(40),
        tag: "archive/legacy/experiment/legacy",
        reason: "Preserve before cleanup.",
      },
    ]);

    expect(
      selectArchiveBeforeDeleteBranches({
        repository: repo,
        branches: [branch("experiment/legacy", "b".repeat(40))],
        openPullRequests: [],
        manifest,
      }),
    ).toEqual([]);
  });

  it("never archives protected study refs or branches with an open PR", () => {
    const manifest = {
      schemaVersion: 1,
      explicitlySuperseded: [],
      archiveBeforeDelete: [
        {
          branch: "study/evidence-r1",
          sha: "a".repeat(40),
          reason: "Should remain protected.",
        },
        {
          branch: "experiment/active",
          sha: "b".repeat(40),
          reason: "Should remain active.",
        },
      ],
    };

    expect(
      selectArchiveBeforeDeleteBranches({
        repository: repo,
        branches: [
          branch("study/evidence-r1", "a".repeat(40)),
          branch("experiment/active", "b".repeat(40)),
        ],
        openPullRequests: [
          {
            head: {
              ref: "experiment/active",
              sha: "b".repeat(40),
              repo: { full_name: repo },
            },
          },
        ],
        manifest,
      }),
    ).toEqual([]);
  });

  it("fails closed on malformed or duplicate archive entries", () => {
    expect(() =>
      selectArchiveBeforeDeleteBranches({
        repository: repo,
        branches: [],
        openPullRequests: [],
        manifest: {
          schemaVersion: 1,
          explicitlySuperseded: [],
          archiveBeforeDelete: [
            { branch: "legacy", sha: "bad", reason: "" },
          ],
        },
      }),
    ).toThrow(/exact lowercase 40-character SHA/);

    expect(() =>
      selectArchiveBeforeDeleteBranches({
        repository: repo,
        branches: [],
        openPullRequests: [],
        manifest: {
          schemaVersion: 1,
          explicitlySuperseded: [],
          archiveBeforeDelete: [
            { branch: "legacy", sha: "a".repeat(40), reason: "one" },
            { branch: "legacy", sha: "b".repeat(40), reason: "two" },
          ],
        },
      }),
    ).toThrow(/unique name/);
  });

  it("derives stable archive tags and requires them to resolve to the exact SHA", () => {
    expect(archiveTagForBranch("qa/legacy")).toBe("archive/legacy/qa/legacy");

    expect(
      isArchiveRefValid({
        archiveRef: { object: { sha: "expected" } },
        expectedSha: "expected",
      }),
    ).toBe(true);

    expect(
      isArchiveRefValid({
        archiveRef: { object: { sha: "other" } },
        expectedSha: "expected",
      }),
    ).toBe(false);
  });

  it("runs destructive cleanup only after a successful main Quality push", () => {
    expect(hygieneWorkflow).toContain('workflows: ["Quality"]');
    expect(hygieneWorkflow).toContain("types: [completed]");
    expect(hygieneWorkflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(hygieneWorkflow).toContain(
      "github.event.workflow_run.event == 'push'",
    );
    expect(hygieneWorkflow).toContain(
      "github.event.workflow_run.head_branch == 'main'",
    );
    expect(hygieneWorkflow).toContain("contents: write");
    expect(hygieneWorkflow).toContain('BRANCH_HYGIENE_APPLY: "1"');
  });
});
