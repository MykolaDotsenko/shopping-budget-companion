import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { selectBranchesForDeletion } from "../scripts/cleanup-merged-branches.mjs";

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
