import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const qualityWorkflow = await readFile(".github/workflows/quality.yml", "utf8");
const studyWorkflow = await readFile(
  ".github/workflows/publish-study-baseline.yml",
  "utf8",
);

describe("gh-pages deployment governance contract", () => {
  it("publishes production as a fast-forward commit from the current gh-pages head", () => {
    expect(qualityWorkflow).toContain(
      "git switch -C gh-pages-publish origin/gh-pages",
    );
    expect(qualityWorkflow).toContain(
      "git merge-base --is-ancestor origin/gh-pages HEAD",
    );
    expect(qualityWorkflow).toContain("git push origin HEAD:gh-pages");
    expect(qualityWorkflow).not.toContain("git push --force");
    expect(qualityWorkflow).not.toContain("git switch --orphan gh-pages-publish");
  });

  it("retains an exact deployment-to-source provenance commit even when bytes do not change", () => {
    expect(qualityWorkflow).toContain(
      'git commit --allow-empty -m "deploy: tested shopping app ${GITHUB_SHA}"',
    );
  });

  it("preserves the immutable study tree byte-for-byte during production deployment", () => {
    expect(qualityWorkflow).toContain(
      "git rev-parse origin/gh-pages:study > /tmp/study-tree-before",
    );
    expect(qualityWorkflow).toContain(
      'test "${study_tree_after}" = "${study_tree_before}"',
    );
  });

  it("queues gh-pages writers without cancelling active or pending publication", () => {
    const deployJob = qualityWorkflow.slice(
      qualityWorkflow.indexOf("\n  deploy:\n"),
    );

    expect(deployJob).toContain([
      "    concurrency:",
      "      group: gh-pages-publish",
      "      cancel-in-progress: false",
      "      queue: max",
    ].join("\n"));
    expect(deployJob).not.toContain(
      "group: gh-pages-publish\n      cancel-in-progress: true",
    );
    expect(studyWorkflow).toContain([
      "concurrency:",
      "  group: gh-pages-publish",
      "  cancel-in-progress: false",
      "  queue: max",
    ].join("\n"));
  });

  it("publishes study baselines without force and refuses to overwrite an existing path", () => {
    expect(studyWorkflow).toContain(
      'if [ -e "${target}" ]; then',
    );
    expect(studyWorkflow).toContain("git push origin HEAD:gh-pages");
    expect(studyWorkflow).not.toContain("git push --force");
  });
});
