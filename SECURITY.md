# Security Policy

## Supported code

Security fixes target the current `main` branch.

This is a local-first browser application with no production backend, account system or remote analytics dependency. Security work should preserve that small attack surface:

- shopping data stays in the browser's `localStorage`;
- camera frames for barcode, visual product recognition and price-tag reading are processed on the device and never stored or uploaded;
- the barcode and OCR engines are self-hosted with the app;
- optional outbound requests are limited to the tap-only Open Food Facts barcode-name lookup and first-use acquisition of the pinned visual-recognition model/runtime; model delivery receives no camera frame, candidate label, price or shopping state.

## Reporting a vulnerability

Do not publish exploit details, private user data or sensitive reproduction material in a public issue.

Prefer GitHub's private vulnerability-reporting / security-advisory flow when it is available for this repository. If that option is unavailable, open a minimal public issue asking the maintainer for a private reporting channel and omit exploit details.

Include, when relevant:

- affected commit/version;
- impact;
- minimal reproduction steps;
- browser/platform;
- whether stored shopping data can be read, altered or lost;
- suggested mitigation if known.

## Security expectations

Changes must preserve:

- runtime validation at persistence and network boundaries (stored data and Open Food Facts responses are Zod-validated);
- exact-money invariants;
- no unsafe HTML injection;
- least-privilege GitHub Actions permissions and CodeQL analysis of every change;
- dependency lockfile integrity;
- each quality run emits a SHA-scoped production CycloneDX SBOM plus SHA-256 digest using a commit-pinned SBOM action and pinned Syft version;
- the exact uploaded `pages-site` artifact digest receives GitHub/Sigstore build-provenance and SBOM attestations before production deployment;
- pull-request dependency changes must pass the pinned Dependency Review gate for high/critical vulnerabilities across runtime, development and unknown scopes;
- no secrets committed to the repository;
- manual/local-first functionality without mandatory third-party providers.
