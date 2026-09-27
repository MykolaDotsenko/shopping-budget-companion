# Technology Stack Reference

## Status

**SUPPORTING REFERENCE.**

Actual runtime/dependency truth comes from `package.json`, source code, CI and current architecture decisions.

This file records current stack intent and dependency admission rules. It does not pre-authorize future dependencies.

## Current core stack

`package.json` pins every dependency to an exact version; runtime dependencies below carry those versions.

### Runtime / UI

- React 19.3.0
- React DOM 19.3.0
- Vite 8
- strict TypeScript 6
- native semantic HTML
- CSS Modules / existing CSS architecture

### Validation

- Zod 4.6.5 at untrusted/runtime boundaries, through the tree-shakeable `zod/mini` API so the public bundle pays only for the validators it uses

### Persistence

- localStorage through explicit infrastructure adapters

### Testing

- Vitest
- React Testing Library
- Playwright
- axe integration
- fast-check where property-style coverage adds value

### Hosting

- static GitHub Pages deployment

## State management

Current application state uses:

- explicit application controller;
- immutable snapshots;
- `useSyncExternalStore` bridge;
- pure domain state/transitions.

Do not add Redux/Zustand/XState/another global store unless measured complexity makes the current architecture insufficient.

## Routing

No client router is required for the current public product.

Add routing only when independent URLs/navigation states provide real product value.

## Styling

Keep the current lightweight styling approach.

Do not add Tailwind/CSS-in-JS/UI framework solely for developer preference.

A design-system dependency must improve delivery/product quality enough to justify bundle, conventions and migration cost.

## Forms

The product does not need a general form library for its current small interaction model.

Use focused controlled/uncontrolled React patterns plus domain/application validation boundaries.

## Motion

Prefer native CSS/platform capabilities for current needs.

Do not add a motion framework unless interaction requirements exceed the current approach and performance/accessibility remain strong.

## Time / IDs / formatting

Prefer platform APIs and explicit wrappers where testability matters.

Financial formatting follows the money contract.

## Remote/backend scope

Backend, authentication, cloud sync and collaborative remote shopping state are **outside the active product roadmap**.

The product remains local-first, offline-first and account-free. Do not add server-owned shopping state, remote history or account infrastructure as speculative architecture.

Product-identity lookup uses one narrow external provider adapter (Open Food Facts, D-032). It is optional, tap-only, runtime-validated and failure-safe; the core trip remains fully usable without network access.

## Analytics

No remote analytics SDK is required for current evidence work.

Retention/timing evidence remains local/content-minimized under the current contract.

## PWA / offline shell

**IMPLEMENTED.**

The current release uses:

- `vite-plugin-pwa` 1.3.0;
- Workbox `generateSW`;
- application-shell precaching;
- prompt-based updates;
- GitHub Pages-aware base/scope;
- no canonical business state in Cache Storage/service worker.

The generated service worker is disabled for every guarded evidence build so those evidence surfaces cannot create competing registrations. Update UI is lifecycle-aware and only becomes actionable when the shopping application is idle.

## Barcode

**IMPLEMENTED.**

- native `BarcodeDetector` when it supports EAN-13, EAN-8, UPC-A and UPC-E;
- otherwise `barcode-detector` 3.2.2 with `zxing-wasm` 3.1.3 (ZXing-C++ reader), imported on demand, WASM self-hosted and cached by the service worker (D-031);
- the build keeps the engine out of the initial bundle, holds it to the [public bundle budget](../TESTING.md#public-bundle-budget) and verifies the WASM hash against the bundled reader.

Barcode remains identity, not price authority.

## Price tag reading

**IMPLEMENTED.**

- `tesseract.js` 7.0.0 with `tesseract.js-core` 7.0.0 in LSTM mode and the Finnish `4.0.0_best_int` model from `@tesseract.js-data/fin` 1.0.0 (D-055);
- the worker, the SIMD and plain LSTM cores and the language file are emitted into a versioned `assets/ocr/` directory and served by this site; the build fails unless each emitted file is byte-identical to its pinned package file;
- the service worker caches those files on first use and never precaches them;
- the build keeps the engine out of the initial bundle and holds it to the [public bundle budget](../TESTING.md#public-bundle-budget); a device downloads the worker, one of the two cores and the language file.

Read prices are candidates, not price authority.

## Dependency admission rule

Before adding a runtime dependency, answer:

1. What current user/product requirement needs it?
2. Can native APIs/current abstractions solve the problem cleanly?
3. What bundle/runtime/security/maintenance cost does it add?
4. Does it weaken offline/local-first behaviour?
5. Does it improve UX/premium quality enough to justify the cost?
6. Is the capability approved by the roadmap/decision contract?

If the requirement is hypothetical, do not add the dependency.

## Explicit non-selections

Current architecture intentionally does not require:

- Redux/Zustand/XState;
- React Router;
- Tailwind;
- component UI frameworks;
- IndexedDB/Dexie;
- backend/auth;
- remote analytics SDK;
- commercial or cloud scanner/OCR SDKs (the self-hosted `barcode-detector`/`zxing-wasm` and Tesseract.js engines are admitted by D-031, D-053 and D-055).

These are not banned forever; they are simply unjustified today.

## Upgrade policy

Upgrade core dependencies when:

- security requires it;
- supported versions materially improve reliability;
- developer experience materially improves without destabilising product behaviour;
- migration cost is proportionate.

Do not upgrade major technology merely to make the stack look newer.

## Review checklist

- Does code/package metadata still match this reference?
- Is a proposed dependency solving a real problem?
- Is it loaded on the critical manual-entry path unnecessarily?
- Does it add a second source of state/validation?
- Does it improve the user experience or only architecture aesthetics?
- Will it make future AI/contributor reasoning harder?

- `@huggingface/transformers` 4.3.0 — lazy local visual-product inference with pinned CLIP model; WebGPU first, WASM fallback.
