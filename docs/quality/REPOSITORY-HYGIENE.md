# Repository hygiene

The repository keeps branch cleanup deliberately conservative.

## Branch lifecycle

- `main` and `gh-pages` are never cleanup candidates.
- A branch merged to `main` is deleted only when its **current head SHA still equals the merged PR head SHA**.
- A branch with an open pull request is never deleted.
- Closed but unmerged work is retained by default.
- A superseded branch may be deleted only when it is listed in `.github/branch-hygiene.json` with:
  - the exact current 40-character Git SHA;
  - a concrete supersession reason.
- If a listed branch receives any new commit, the SHA no longer matches and cleanup skips it automatically.
- `study/*` evidence refs and experimental branches are not removed by inference. They require a separate evidence/archive decision.

## Automation

`.github/workflows/repository-branch-hygiene.yml` runs only after a successful `Quality` push on `main`.

The cleanup script inspects all branches, open pull requests and closed pull requests before issuing any delete operation. It has two safe deletion paths:

1. exact merged-PR head proof;
2. exact-SHA superseded manifest proof.

Both paths fail closed when the evidence is incomplete.

Immediately before deleting a selected branch, cleanup re-fetches its ref and open-PR state. The delete is skipped if the branch SHA changed or a new pull request appeared after the initial snapshot.

## Adding a superseded branch

Only add a branch to `.github/branch-hygiene.json` after verifying that its work is obsolete or represented by a newer merged implementation. Record its exact current SHA and the replacement reason.

Do not use broad prefixes, age-based deletion or wildcard deletion.
