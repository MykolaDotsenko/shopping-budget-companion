# Architecture and Technology Decisions

## Status

Accepted decision records. These explain durable choices but do not override current code/tests or authoritative current contracts.

Use [../DECISIONS.md](../DECISIONS.md) as the retrieval index.

## D-006 — Strict TypeScript becomes justified by the pivot

Date: 2026-09-21

Status: accepted

### Decision

Migrate incrementally from JavaScript to strict TypeScript as the shopping domain is introduced.

### Rationale

The original counter was too small for a TypeScript migration to provide much risk reduction. The target domain adds money, currencies, multiple price origins, persistence schemas, scanner result types, and trip lifecycle.

### Consequence

TypeScript migration should begin with the domain and proceed incrementally rather than as a cosmetic whole-repo rewrite.

### Revisit when

Not expected unless implementation evidence shows an unacceptable migration cost.

## D-013 — State commits precede decorative motion

Date: 2026-09-21

Status: accepted

### Decision

Business-state mutation must not depend on View Transition callbacks or decorative animation completion.

### Rationale

The existing counter used advanced transition orchestration safely, but shopping data has higher correctness stakes. Motion remains a progressive enhancement.

### Consequence

Order is:

1. user intent
2. domain commit
3. persistence attempt
4. render
5. optional visual feedback

### Revisit when

Never for financial correctness; implementation details can evolve.

## D-024 — Core runtime remains React 19.3 + Vite 8

Date: 2026-09-21

Status: accepted

### Decision

Keep the existing React/Vite SPA foundation.

Target core:

- React 19.3
- React DOM
- Vite 8.x
- Node 24 tooling/runtime for CI

Do not migrate to Next.js, Preact, Vue, or Svelte for the shopping-product pivot.

### Rationale

The product is a local-first static PWA with no SSR or mandatory server requirement.

React 19.3 and Vite already satisfy the UI, code-splitting, testing, browser-API, and PWA integration needs. Rewriting the UI framework would add migration risk without changing the user outcome.

### Consequence

Architecture work focuses on domain/application/persistence quality rather than framework migration.

### Revisit when

A future requirement materially depends on a capability that the current static React/Vite architecture cannot reasonably provide.

## D-025 — Begin migration on strict TypeScript 6.0.x

Date: 2026-09-21

Status: accepted

### Decision

Use strict TypeScript 6.0.x for the first shopping-product migration.

Do not adopt TypeScript 7 in the same change that introduces the new domain/application architecture.

### Rationale

TypeScript 7 is current and materially faster, but the repository is small enough that compiler speed is not a bottleneck.

The first migration already changes:

- money representation
- persistence schemas
- application boundaries
- domain types

Keeping the compiler/tooling transition separate reduces simultaneous risk.

### Consequence

After Phase 1–3 are green, create a focused TypeScript 7 compatibility upgrade.

### Revisit when

The initial TypeScript migration is complete and the current lint/testing ecosystem has verified TS7 compatibility.

## D-026 — No third-party global state library in MVP

Date: 2026-09-21

Status: accepted

### Decision

Use a small plain-TypeScript application controller/store and React useSyncExternalStore.

Do not add:

- Redux Toolkit
- Zustand
- XState runtime

for MVP.

### Rationale

The app has one small canonical application state, but persistence orchestration should remain outside React.

A custom controller provides:

- deterministic commands
- one canonical snapshot
- subscription to React
- clean dependency injection
- no library-specific domain model

### Consequence

Application state APIs must remain deliberately small and immutable at the snapshot boundary.

### Revisit when

State complexity or collaboration requirements grow enough that the custom solution becomes harder to reason about than a library.

## D-029 — MVP uses native semantic UI and CSS Modules, not a UI framework

Date: 2026-09-21

Status: accepted

### Decision

Use:

- semantic HTML
- native dialog
- CSS Modules
- CSS custom properties
- React ViewTransition + CSS

Do not add Tailwind, a full component library, CSS-in-JS, or a general animation runtime for MVP.

### Rationale

The product has a small, custom, accessibility-sensitive interface.

Native primitives now cover the required modal/dialog semantics, while CSS Modules preserve strong custom design control with no runtime styling dependency.

### Consequence

Any later Radix/UI-library addition must solve a verified accessibility/browser problem rather than convenience alone.

### Revisit when

Native primitives fail a documented interaction/accessibility requirement.

## D-030 — No router until URLs have real product value

Date: 2026-09-21

Status: accepted

### Decision

Do not add React Router or another router to MVP.

Use application/UI state for:

- active trip
- add-price overlay
- history
- settings
- completed summary

### Rationale

The core product is one task surface.

Routing would add URL/state synchronization complexity without a deep-link requirement.

### Consequence

If future history/shared/public pages require durable URLs, prefer React Router Declarative Mode as the first option.

### Revisit when

A real deep-link/navigation requirement appears.

## D-046 — Make documentation authority explicit and keep the repository root small

**Status:** Accepted  
**Date:** 2026-09-22

### Context

The repository accumulated several high-quality documents that overlapped in product scope, UX, design, functionality, scenarios, technology, and execution planning. The content was useful, but the repository no longer made it obvious which documents were current sources of truth versus supporting reference or completed execution material.

This created two risks:

1. a reviewer or contributor could treat multiple planning documents as equally authoritative;
2. a stale detailed document could silently contradict a newer product or architecture contract.

### Decision

- Keep the repository root focused on code/configuration entry points, `README.md`, `AGENTS.md`, and `LICENSE`.
- Move the long-form product/engineering Markdown set under `docs/`.
- Use `docs/README.md` as the documentation map and authority model.
- Treat `PRODUCT.md`, `ARCHITECTURE.md`, `DOMAIN.md`, `DESIGN.md`, `ROADMAP.md`, and `TESTING.md` as the current high-level authoritative documents.
- Treat `docs/reference/UX.md`, `docs/reference/BRAND.md`, `docs/reference/SCENARIOS.md`, `docs/reference/TECH-STACK.md`, `docs/reference/CODE-OWNERSHIP.md`, and `docs/reference/MARKETING.md` as supporting reference. They may add context but must not independently redefine current implementation status.
- Keep detailed contracts under `docs/specs/` and specialized contracts such as persistence/accessibility alongside the current docs.
- Move completed sprint decomposition such as `CORE-UI-EXECUTION-BRIEF.md` under `docs/archive/` instead of leaving it mixed with current contracts.
- Avoid duplicating current-status checklists across multiple documents. Update the smallest owning authoritative document and reconcile supporting reference only where it would otherwise mislead.

### Consequences

- Repository browsing becomes faster for reviewers and contributors.
- Existing historical detail is preserved instead of deleted.
- Documentation conflicts have an explicit resolution path.
- Future planning documents do not automatically become permanent sources of truth.

---

## D-048 — Separate application contracts and compress current AI context surfaces

Date: 2026-09-22

Status: accepted

### Decision

Reduce reasoning cost without changing product behaviour by:

- moving public ShoppingAppController state/result/port contracts into `src/application/shopping-app-contracts.ts`
- keeping `shopping-app-controller.ts` focused on orchestration while re-exporting the existing public types for compatibility
- converting application entry points from JSX to strict TSX
- treating `AGENTS.md` as a concise context router rather than a duplicate product/architecture specification
- keeping `ARCHITECTURE.md` focused on current boundaries and invariants
- keeping `ROADMAP.md` focused on current evidence gates and future sequencing
- archiving completed phase-by-phase roadmap narration instead of carrying it in the active context set

### Rationale

The repository had strong contracts but increasingly high context cost:

- controller implementation and public type contracts occupied one large file
- current architecture documentation still contained migration-era language after the legacy shell had been removed
- the active roadmap mixed completed execution history with current priorities
- AI instructions duplicated stable rules from several authoritative documents

This made it easier for a contributor or AI agent to load stale or redundant context and harder to distinguish current behaviour from historical sequencing.

### Consequence

- application consumers have a dedicated contracts module
- existing controller type imports remain compatible through re-exports
- current documentation is shorter and more present-tense
- historical execution detail remained in `docs/archive/` until that folder was removed on 2026-09-26; git history keeps it
- AI contributors are instructed to load task-specific authoritative context rather than the entire documentation tree
- future refactors should be driven by cohesive responsibility boundaries, not line-count targets

### Revisit when

The controller requires another cohesive use-case extraction, documentation authority changes, or measured contributor/AI workflows show that a different context-routing model is more effective.

## D-049 — Decompose architectural hotspots by reason to change

Date: 2026-09-22

Status: accepted

### Decision

Reduce the largest current implementation hotspots only where a cohesive responsibility boundary already exists:

- separate shopping storage codec/domain reconstruction from storage transactions, reconciliation and recovery;
- move completion, checkout reconciliation and completed-summary dismissal into one application use-case module;
- move controller state/result helpers into a small application support module;
- isolate shell focus restoration from product orchestration;
- separate price-entry presentation calculations/copy and the dumb keypad from the stateful entry/confirmation flow.

Keep backward-compatible exports at existing storage/controller boundaries where changing imports would add migration churn without product value.

### Rationale

The previous large files were still correct, but several contained multiple independent reasons to change. Extracting by responsibility reduces review and AI context cost without introducing speculative service layers or a state-management framework.

### Consequence

The remaining large modules stay intentionally cohesive. Further splitting requires a clear behavioural or ownership boundary; line count alone is not sufficient justification.

## D-050 — Appearance is a semantic-token presentation layer

Date: 2026-09-25

Status: accepted

### Decision

Support System, Light, Dark and Aurora through one component tree and semantic CSS custom properties.

Appearance preference is independent convenience state. It must not enter the shopping domain, application controller, persistence schema or evidence payloads.

Represent the saved choice on the document as `data-appearance` and the resolved visual shell as `data-theme`. System resolves to Light or Dark before styling, so CSS does not duplicate a second system-specific palette.

Apply both values before the first React paint so explicit Dark/Aurora and System-dark never flash through the Light shell.

Light is the primary bright-store calibration baseline. Dark and Aurora may change colour, surface and depth treatment, but not information hierarchy, interaction semantics or financial authority.

### Rationale

The product benefits from personalisation and a distinctive showcase mode, but duplicating screens per theme would multiply UX drift, accessibility risk and maintenance cost.

Semantic tokens give high visual leverage while preserving one tested interaction model.

### Consequence

- theme work stays in presentation/design-system code;
- a storage failure falls back safely without affecting shopping;
- visual modes share the same accessible controls and product semantics;
- future effects must earn their performance cost and respect reduced motion;
- theme-specific React screen forks are not allowed without a separate architecture decision.

### Revisit when

A platform limitation prevents semantic tokens from expressing a required accessible design, or measured user evidence shows that a mode needs materially different interaction rather than presentation.


## D-058 — Self-hosted ZXing runtime and WASM stay version-locked

Date: 2026-10-01

Status: accepted

### Decision

Treat `barcode-detector` and the directly self-hosted `zxing-wasm` package as one compatibility unit.

The application's direct `zxing-wasm` version must exactly match the `zxing-wasm` version required by the installed `barcode-detector` package. CI must fail closed when:

- the direct dependency spec drifts from the exact version required by `barcode-detector`;
- the installed root `zxing-wasm` version differs from that requirement;
- npm installs a second nested `zxing-wasm` version under `barcode-detector`;
- a future `barcode-detector` release stops pinning an exact ZXing runtime without an explicit review of the self-hosted WASM integration.

Dependabot groups the two barcode-runtime dependencies separately from other production updates. A `zxing-wasm`-only update is not mergeable merely because it is a patch release; it must wait for a compatible `barcode-detector` release or be handled as an explicit paired compatibility change.

### Rationale

The barcode fallback imports the ponyfill/runtime from `barcode-detector`, while the application self-hosts the ZXing reader WASM through the direct `zxing-wasm` package so scanning can remain offline-capable.

Emscripten runtime JavaScript and its WASM binary are one ABI-level artifact pair. Feeding a runtime one package version while serving the WASM binary from another can crash the page rather than fail as an ordinary recoverable scanner error.

This risk was exposed by the attempted `zxing-wasm 3.1.3 → 3.1.4` Dependabot update: `barcode-detector@3.2.2` still required `zxing-wasm@3.1.3`, so npm installed two ZXing versions and the Chromium barcode E2E crashed. The safe production version remains the aligned pair until both sides can move together.

### Consequence

- dependency drift fails before release;
- build validation independently re-checks the installed runtime graph;
- a scanner dependency update cannot silently replace only the self-hosted WASM half of the runtime;
- barcode updates remain reviewable as a small explicit compatibility unit;
- the current production scanner stays on the known-green aligned versions until the paired update passes the full browser matrix.

### Revisit when

The application stops self-hosting ZXing WASM, `barcode-detector` exposes a first-class self-hosted asset path that cannot diverge from its runtime, or the barcode implementation no longer has two separately resolved package boundaries.

## D-059 — Android APK uses a thin local WebViewAssetLoader shell

Date: 2026-10-02

Status: accepted

### Decision

Ship Android distribution as a thin native shell around the same tested React/Vite product.

The shell:

- bundles the production web payload inside the APK;
- serves bundled files through AndroidX `WebViewAssetLoader` on the secure `https://appassets.androidplatform.net` origin;
- never uses `file://` or enables WebView file access;
- keeps JavaScript business state, exact-money rules and persistence inside the existing web application;
- grants WebView camera access only for `RESOURCE_VIDEO_CAPTURE`, only to the bundled local origin, and only after Android runtime permission succeeds;
- sends external top-level links to the system browser rather than loading arbitrary sites in the privileged WebView;
- disables cleartext traffic, Android backup and third-party cookies;
- disables the PWA service worker/manifest in the Android-specific web build because APK assets are already local and must update atomically with the APK;
- targets Android 16 / API 36, with Android 7 / API 24 as the minimum wrapper runtime.

Use AndroidX WebKit 1.17.1 and Android Gradle Plugin 9.4.0 with Gradle 9.6.0 for this packaging baseline.

Do not use a Trusted Web Activity while the public product is hosted as a GitHub Pages project path whose origin-level Digital Asset Links file is outside this repository's control.

### Rationale

The Android package should preserve the product's strongest architectural property: the core shopping loop remains local and does not depend on a remote application server.

Bundling the web payload:

- makes first launch independent of GitHub Pages availability;
- avoids a second native implementation of money, persistence or UX rules;
- keeps browser and Android releases on one product code path;
- makes an APK update the authority for bundled application code instead of leaving an older service-worker cache able to mask a native update.

`WebViewAssetLoader` preserves an HTTPS-like origin and same-origin semantics without the security weaknesses of `file://` loading.

A TWA remains a viable future distribution option if the product moves to an origin where the required Digital Asset Links association can be controlled and verified.

### Consequences

- Android packaging adds one native runtime dependency, AndroidX WebKit, but no JavaScript product dependency.
- Android CI must build a relative-base web payload, lint the native shell and produce both an installable debug-signed preview APK and an unsigned release APK.
- A public production APK must be signed with a private release key supplied through GitHub Actions secrets; the key is never committed.
- Optional network-backed product-name/model delivery may still use HTTPS, while shopping state remains local.
- Native code is a security/packaging boundary only and must not become a second source of product state or financial rules.

### Revisit when

Revisit if:

- verified TWA hosting becomes available;
- WebView-specific behaviour materially diverges from browser behaviour;
- a native capability is required that cannot be expressed safely through the current web/native boundary;
- Play distribution requirements make a different package architecture materially safer or simpler.

