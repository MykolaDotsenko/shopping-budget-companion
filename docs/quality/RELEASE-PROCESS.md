# Release Process

## Status

**IMPLEMENTED release contract.**

GitHub Releases are metadata and provenance records for code that has already passed the normal main Quality pipeline. The release workflow does not rebuild the application and never substitutes for the production deployment gate.

## Principle

A release identifies one exact, already-tested production revision:

> package version → current main SHA → successful push-to-main Quality run → immutable artifact digests → SBOM → Git tag and GitHub Release

The release workflow is deliberately stricter than creating a tag manually.

## Preconditions

Before publishing a release:

1. the intended version is already committed in package.json;
2. the release source is the current main head;
3. a Quality workflow triggered by a push to main completed successfully for that exact SHA;
4. that run still retains both pages-site and sbom-<source-sha>;
5. required human and evidence gates are reported honestly as passed, failed or still open.

The workflow rejects an older main commit even if it once passed CI. This prevents a release label from silently pointing at code different from the current production line.

## Publishing

Use:

> GitHub Actions → **Publish Release** → Run workflow

Inputs:

- version — canonical package SemVer without a leading v, for example 2.0.0 or 2.1.0-beta.1;
- quality_run_id — the successful main Quality push run;
- source_sha — exact lowercase 40-character current main SHA.

The workflow:

1. checks out the exact SHA;
2. fetches the selected Quality run, its artifacts and the current main ref;
3. validates the release contract with scripts/validate-release-contract.mjs;
4. verifies package.json version equality;
5. rejects duplicate tags and releases;
6. downloads the exact tested `pages-site` artifact archive by immutable artifact ID;
7. verifies that archive against the SHA-256 digest recorded by GitHub Actions;
8. downloads the exact SHA-scoped SBOM from the selected run;
9. verifies the SBOM SHA-256 sidecar;
10. creates a draft GitHub Release directly from the exact source SHA;
11. attaches the tested Pages archive, `release-manifest.json`, the CycloneDX SBOM and its SHA-256 sidecar;
12. verifies the draft tag, target SHA and required assets;
13. only then publishes the release.

No application build occurs in this workflow.

## Release manifest

release-manifest.json records:

- schema version;
- product;
- package version and tag;
- prerelease status;
- exact source SHA;
- exact Quality run ID;
- pages-site artifact ID and SHA-256 digest;
- SBOM artifact ID, name and SHA-256 digest.

It is a provenance pointer, not a second build system. The GitHub Release also preserves the exact tested `pages-site` artifact archive so the short Actions retention window cannot erase the release payload it identifies.

## Failure rules

Fail closed when:

- version syntax is invalid;
- package.json does not match the requested version;
- source SHA is not current main;
- the selected run was not a successful push-to-main Quality run for that SHA;
- release artifacts are missing, duplicated, expired or lack verified SHA-256 digests;
- tag or release already exists;
- the SBOM checksum fails;
- draft release identity or assets do not match the validated contract.

If a draft is left by an infrastructure failure, inspect it rather than creating another release tag. Never retarget an existing published tag to newer code.

## Relationship to deployment

The normal Quality workflow owns build, browser verification, provenance attestation and GitHub Pages deployment.

The release workflow owns human-readable version identity and preservation of the already-generated provenance evidence.

A release is therefore:

> a label on tested code, not a new build of tested code.

## Version discipline

Use SemVer intentionally:

- patch — compatible correctness, reliability or security fix;
- minor — backwards-compatible user-facing capability;
- major — intentional incompatible product, data or API contract change.

Do not bump version merely to trigger deployment; every main push already follows the deployment contract.

Prerelease versions such as 2.1.0-beta.1 are published as GitHub prereleases automatically.
