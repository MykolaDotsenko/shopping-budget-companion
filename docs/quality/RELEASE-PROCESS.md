# Release Process

## Status

**IMPLEMENTED release contract.**

GitHub Releases are metadata and provenance records for code that has already passed the normal main Quality pipeline. The release workflow does not rebuild the application and never substitutes for the production deployment gate.

## Principle

A release identifies one exact, already-tested production revision:

> package version → current main SHA → successful push-to-main Quality run → immutable web/SBOM/Android artifact digests → release-key signing of the exact tested unsigned APK → Git tag and GitHub Release

The release workflow is deliberately stricter than creating a tag manually.

## Preconditions

Before publishing a release:

1. the intended version is already committed in package.json;
2. the release source is the current main head;
3. a Quality workflow triggered by a push to main completed successfully for that exact SHA;
4. that run still retains `pages-site`, `sbom-<source-sha>` and `android-apk-<source-sha>`;
5. the repository has the Android release-signing secrets configured;
6. required human and evidence gates are reported honestly as passed, failed or still open.

Required Android signing secrets:

- `ANDROID_KEYSTORE_BASE64` — base64 of the private release keystore;
- `ANDROID_KEYSTORE_PASSWORD`;
- `ANDROID_KEY_ALIAS`;
- `ANDROID_KEY_PASSWORD`.

The keystore itself must never be committed or published as an Actions artifact.

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
8. downloads the exact SHA-scoped SBOM from the selected run and verifies its SHA-256 sidecar;
9. downloads the exact `android-apk-<source-sha>` artifact from that same Quality run;
10. verifies its APK checksums and Android build manifest against the requested version/source SHA;
11. zip-aligns and signs the exact tested unsigned release APK with the private release key, without rebuilding the web or Android project;
12. verifies the APK signature and records its SHA-256 digest;
13. creates a draft GitHub Release directly from the exact source SHA;
14. attaches the tested Pages archive, signed Android APK + checksum, `release-manifest.json`, CycloneDX SBOM and its checksum;
15. verifies the draft tag, target SHA and every required asset;
16. only then publishes the release.

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
- SBOM artifact ID, name and SHA-256 digest;
- Android Quality artifact ID, name and SHA-256 digest;
- signed release APK filename, application ID, target API and SHA-256 digest.

It is a provenance pointer, not a second build system. The GitHub Release also preserves the exact tested `pages-site` artifact archive so the short Actions retention window cannot erase the release payload it identifies.

## Failure rules

Fail closed when:

- version syntax is invalid;
- package.json does not match the requested version;
- source SHA is not current main;
- the selected run was not a successful push-to-main Quality run for that SHA;
- release artifacts are missing, duplicated, expired or lack verified SHA-256 digests;
- the Android build manifest does not match the selected source/version/API contract;
- any Android release-signing secret is missing;
- APK alignment/signing or signature verification fails;
- tag or release already exists;
- the SBOM checksum fails;
- draft release identity or assets do not match the validated contract.

If a draft is left by an infrastructure failure, inspect it rather than creating another release tag. Never retarget an existing published tag to newer code.

## Relationship to deployment

The normal Quality workflow owns build, browser verification, provenance attestation and GitHub Pages deployment.

The release workflow owns human-readable version identity, preservation of already-generated provenance evidence, and application of the private Android release signature to the exact unsigned APK produced by the successful Quality run.

Signing is not a rebuild: the release workflow may align/sign the verified APK bytes, but it may not re-run Vite, Gradle compilation, or substitute another source revision.

A release is therefore:

> a label and release signature on tested code, not a new build of tested code.

## Version discipline

Use SemVer intentionally:

- patch — compatible correctness, reliability or security fix;
- minor — backwards-compatible user-facing capability;
- major — intentional incompatible product, data or API contract change.

Do not bump version merely to trigger deployment; every main push already follows the deployment contract.

Prerelease versions such as 2.1.0-beta.1 are published as GitHub prereleases automatically.
