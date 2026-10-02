import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  selectBranchesForDeletion,
  isDeletionStillSafe,
  selectClosedPrCapturedBranches,
  selectTreeEquivalentBranches,
} from "../scripts/cleanup-merged-branches.mjs";

const repo = "MykolaDotsenko/shopping-budget-companion";

const branch = (name, sha) => ({ name, commit: { sha } });
const pull = ({
  head,
  sha,
  merged = true,
  base = "main",
  repository = repo,
  state = "closed",
}) => ({
  state,
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


  it("protects study evidence refs from automatic deletion", () => {
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


  it("selects a branch whose exact current head is archived by a closed PR", () => {
    expect(
      selectClosedPrCapturedBranches({
        repository: repo,
        branches: [
          branch("experiment/archived", "captured-sha"),
          branch("experiment/advanced", "new-sha"),
        ],
        openPullRequests: [],
        closedPullRequests: [
          pull({
            head: "experiment/archived",
            sha: "captured-sha",
            merged: false,
          }),
          pull({
            head: "experiment/advanced",
            sha: "old-sha",
            merged: false,
          }),
        ],
      }),
    ).toEqual(["experiment/archived"]);
  });

  it("does not delete study refs even when a closed PR captures their head", () => {
    expect(
      selectClosedPrCapturedBranches({
        repository: repo,
        branches: [branch("study/legacy-r1", "captured-sha")],
        openPullRequests: [],
        closedPullRequests: [
          pull({
            head: "study/legacy-r1",
            sha: "captured-sha",
            merged: false,
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("does not treat an open PR snapshot as archival deletion evidence", () => {
    expect(
      selectClosedPrCapturedBranches({
        repository: repo,
        branches: [branch("feat/open", "open-sha")],
        openPullRequests: [
          {
            head: {
              ref: "feat/open",
              sha: "open-sha",
              repo: { full_name: repo },
            },
          },
        ],
        closedPullRequests: [
          pull({
            head: "feat/open",
            sha: "open-sha",
            merged: false,
            state: "closed",
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("selects a leftover branch when its complete Git tree is identical to main", () => {
    expect(
      selectTreeEquivalentBranches({
        repository: repo,
        branches: [
          branch("chore/empty-superseded", "same-tree-commit"),
          branch("feat/unique-work", "unique-tree-commit"),
          branch("study/evidence-baseline-r1", "study-tree-commit"),
        ],
        openPullRequests: [],
        treeBySha: new Map([
          ["same-tree-commit", "main-tree"],
          ["unique-tree-commit", "unique-tree"],
          ["study-tree-commit", "main-tree"],
        ]),
        mainTreeSha: "main-tree",
      }),
    ).toEqual(["chore/empty-superseded"]);
  });

  it("does not tree-delete a branch with an open pull request", () => {
    expect(
      selectTreeEquivalentBranches({
        repository: repo,
        branches: [branch("feat/open", "open-sha")],
        openPullRequests: [
          {
            head: {
              ref: "feat/open",
              sha: "open-sha",
              repo: { full_name: repo },
            },
          },
        ],
        treeBySha: new Map([["open-sha", "main-tree"]]),
        mainTreeSha: "main-tree",
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

  it("cancels deletion when a pull request opens after the initial snapshot", () => {
    expect(
      isDeletionStillSafe({
        expectedSha: "expected-sha",
        currentRef: { object: { sha: "expected-sha" } },
        currentOpenPullRequests: [{ number: 999 }],
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
