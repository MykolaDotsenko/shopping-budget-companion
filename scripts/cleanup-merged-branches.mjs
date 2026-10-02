import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_VERSION = "2022-11-28";
const DEFAULT_PROTECTED_BRANCHES = new Set(["main", "gh-pages"]);
const DEFAULT_PROTECTED_PREFIXES = ["study/"];

const isProtectedBranch = (
  name,
  protectedBranches = DEFAULT_PROTECTED_BRANCHES,
  protectedPrefixes = DEFAULT_PROTECTED_PREFIXES,
) =>
  protectedBranches.has(name) ||
  protectedPrefixes.some((prefix) => name.startsWith(prefix));

const branchName = (branch) =>
  typeof branch?.name === "string" ? branch.name : "";

const pullRequestHead = (pullRequest) => ({
  branch:
    typeof pullRequest?.head?.ref === "string" ? pullRequest.head.ref : "",
  sha:
    typeof pullRequest?.head?.sha === "string" ? pullRequest.head.sha : "",
  repository:
    typeof pullRequest?.head?.repo?.full_name === "string"
      ? pullRequest.head.repo.full_name
      : "",
});

const openBranchHeads = ({ repository, openPullRequests }) =>
  new Set(
    openPullRequests
      .filter((pullRequest) => pullRequest?.head?.repo?.full_name === repository)
      .map((pullRequest) => pullRequestHead(pullRequest).branch)
      .filter(Boolean),
  );

export const selectExplicitlySupersededBranches = ({
  repository,
  branches,
  openPullRequests,
  manifest,
  protectedBranches = DEFAULT_PROTECTED_BRANCHES,
  protectedPrefixes = DEFAULT_PROTECTED_PREFIXES,
}) => {
  if (manifest?.schemaVersion !== 1) {
    throw new Error("Branch hygiene manifest must use schemaVersion 1.");
  }

  if (!Array.isArray(manifest.explicitlySuperseded)) {
    throw new Error("Branch hygiene manifest explicitlySuperseded must be an array.");
  }

  const openHeads = openBranchHeads({ repository, openPullRequests });
  const byName = new Map(branches.map((branch) => [branchName(branch), branch]));
  const seen = new Set();
  const selected = [];

  for (const entry of manifest.explicitlySuperseded) {
    const name = typeof entry?.branch === "string" ? entry.branch : "";
    const sha = typeof entry?.sha === "string" ? entry.sha : "";
    const reason = typeof entry?.reason === "string" ? entry.reason.trim() : "";

    if (
      name === "" ||
      !/^[0-9a-f]{40}$/.test(sha) ||
      reason === "" ||
      seen.has(name)
    ) {
      throw new Error(
        "Every explicitly superseded branch needs a unique name, exact lowercase 40-character SHA and reason.",
      );
    }

    seen.add(name);

    if (
      isProtectedBranch(name, protectedBranches, protectedPrefixes) ||
      openHeads.has(name)
    ) {
      continue;
    }

    const current = byName.get(name);
    if (current?.commit?.sha === sha) {
      selected.push(name);
    }
  }

  return selected.sort((left, right) => left.localeCompare(right));
};

export const selectBranchesForDeletion = ({
  repository,
  branches,
  openPullRequests,
  closedPullRequests,
  protectedBranches = DEFAULT_PROTECTED_BRANCHES,
  protectedPrefixes = DEFAULT_PROTECTED_PREFIXES,
}) => {
  const openHeads = openBranchHeads({ repository, openPullRequests });

  const mergedByHeadAndSha = new Set(
    closedPullRequests
      .filter(
        (pullRequest) =>
          pullRequest?.merged_at !== null &&
          pullRequest?.merged_at !== undefined &&
          pullRequest?.base?.ref === "main" &&
          pullRequest?.head?.repo?.full_name === repository,
      )
      .map((pullRequest) => {
        const head = pullRequestHead(pullRequest);
        return `${head.branch}\u0000${head.sha}`;
      }),
  );

  return branches
    .filter((branch) => {
      const name = branchName(branch);
      const sha =
        typeof branch?.commit?.sha === "string" ? branch.commit.sha : "";

      if (
        name === "" ||
        sha === "" ||
        isProtectedBranch(name, protectedBranches, protectedPrefixes)
      ) {
        return false;
      }

      if (openHeads.has(name)) {
        return false;
      }

      return mergedByHeadAndSha.has(`${name}\u0000${sha}`);
    })
    .map((branch) => branch.name)
    .sort((left, right) => left.localeCompare(right));
};

const request = async ({ url, token, method = "GET" }) => {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "shopping-budget-companion-branch-hygiene",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API ${method} ${url} failed with ${response.status}: ${body.slice(0, 500)}`,
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

const listPaginated = async ({ apiBase, path, token }) => {
  const items = [];

  for (let page = 1; page <= 100; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await request({
      url: `${apiBase}${path}${separator}per_page=100&page=${page}`,
      token,
    });

    if (!Array.isArray(batch)) {
      throw new TypeError(`Expected an array from GitHub API path ${path}.`);
    }

    items.push(...batch);

    if (batch.length < 100) {
      return items;
    }
  }

  throw new Error(`Pagination safety limit exceeded for ${path}.`);
};

export const cleanupMergedBranches = async ({
  repository,
  token,
  apply = false,
  apiBase = "https://api.github.com",
}) => {
  if (!/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("repository must use owner/name format.");
  }

  if (typeof token !== "string" || token.length === 0) {
    throw new Error("A GitHub token is required.");
  }

  const repositoryPath = `/repos/${repository}`;
  const [branches, openPullRequests, closedPullRequests] = await Promise.all([
    listPaginated({
      apiBase,
      path: `${repositoryPath}/branches`,
      token,
    }),
    listPaginated({
      apiBase,
      path: `${repositoryPath}/pulls?state=open`,
      token,
    }),
    listPaginated({
      apiBase,
      path: `${repositoryPath}/pulls?state=closed&base=main&sort=updated&direction=desc`,
      token,
    }),
  ]);

  const manifest = JSON.parse(
    await readFile(path.join(process.cwd(), ".github", "branch-hygiene.json"), "utf8"),
  );

  const mergedCandidates = selectBranchesForDeletion({
    repository,
    branches,
    openPullRequests,
    closedPullRequests,
  });
  const supersededCandidates = selectExplicitlySupersededBranches({
    repository,
    branches,
    openPullRequests,
    manifest,
  });
  const candidates = [...new Set([...mergedCandidates, ...supersededCandidates])].sort(
    (left, right) => left.localeCompare(right),
  );

  console.log(
    `Branch hygiene: ${branches.length} branches inspected, ${mergedCandidates.length} merged and ${supersededCandidates.length} exact-SHA superseded branch(es) selected.`,
  );

  for (const name of candidates) {
    if (!apply) {
      console.log(`DRY RUN delete: ${name}`);
      continue;
    }

    const encodedBranch = name
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    await request({
      url: `${apiBase}${repositoryPath}/git/refs/heads/${encodedBranch}`,
      token,
      method: "DELETE",
    });
    console.log(`Deleted safe stale branch: ${name}`);
  }

  return { inspected: branches.length, candidates };
};

const runningAsCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runningAsCli) {
  try {
    await cleanupMergedBranches({
      repository: process.env.GITHUB_REPOSITORY ?? "",
      token: process.env.GITHUB_TOKEN ?? "",
      apply: process.env.BRANCH_HYGIENE_APPLY === "1",
      apiBase: process.env.GITHUB_API_URL ?? "https://api.github.com",
    });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Branch hygiene failed.",
    );
    process.exitCode = 1;
  }
}
