# Architecture

## Status

This document describes the **current** architecture of the public Shopping Budget Companion.

The repository no longer contains an alternate prototype product shell. The public root, timing QA route and retention-beta route all compose the same shopping product. The public build resolves the evidence boundary to a NoOp adapter; guarded QA/beta builds resolve the same boundary to evidence tooling at build time.

The guarded `/cohort/` route is intentionally different: it is a facilitator-only local analyzer that imports already-exported retention evidence and never composes or mutates shopping state.

The shopping product's camera lives inside the trip; the old `/camera-tools/` address redirects to the app.

The installable offline PWA shell is **IMPLEMENTED**. Barcode identification (D-053), visual product recognition (D-057) and price-tag reading (D-055) are **IMPLEMENTED** in the in-trip camera behind build kill switches. Visual recognition only proposes identity candidates, a read price only pre-fills price entry, and nothing reaches the cart until the shopper confirms it through the normal flow. Human evidence gates (physical-phone usability, timing, retention and camera field evidence) are tracked in [ROADMAP.md](./ROADMAP.md).

## Architectural goal

Protect financial correctness and local durability while keeping the product small enough to understand, test and change quickly.

The architecture should make the common path obvious:

```text
features ─────────▶ application ─────────▶ domain
                         ▲                    ▲
        implements ports │                    │ uses
                         └── infrastructure ──┘

composition root (src/app/composition-root.ts): wires the infrastructure adapters into the application
```

Arrows point at what a layer may import (features may also read domain selectors for display); `eslint.config.mjs` enforces the direction. The domain imports nothing outside itself.

## Source shape

```text
src/
├── app/             composition root + product shell
├── application/     public contracts, controller, React state bridge, ports
├── domain/          exact money, ShoppingTrip, Price Memory, product codes,
│                    barcode links, shelf-price candidates
├── features/
│   └── shopping/    product UI and ephemeral interaction drafts
├── infrastructure/  runtime, storage, camera, barcode, price-OCR and
│                    product-lookup adapters + validation
└── qa/              guarded evidence builds, never product state
```

Entry points are TypeScript/TSX. Runtime business code should not require JavaScript escape hatches.

## Dependency rules

### Domain

`src/domain/` owns deterministic business rules.

It may depend on other domain modules. It must not depend on:

- React
- DOM/browser globals
- storage
- network
- camera/OCR
- analytics/evidence
- animation

Canonical money is integer minor units. Derived totals are selectors/calculations, never separately persisted authority.

### Application

`src/application/` owns use-case orchestration:

- lifecycle
- commands
- Undo semantics
- persistence ordering
- recovery/degraded-durability behaviour
- coordination of the advisory Price Memory and barcode-link records with trips and completed history

Public application state/result types, the controller interface and the shopping persistence, clock and id ports live in `shopping-app-contracts.ts`. The Price Memory, camera, barcode and price-tag ports live in their own modules (`price-memory-port.ts`, `camera-ports.ts`, `barcode-ports.ts`, `price-tag-ports.ts`).

`shopping-app-controller.ts` contains controller behaviour, not public contract declarations. Consumers may continue importing re-exported types from the controller where compatibility matters, but new application-level types should be owned by the contracts module.

The application layer must not render UI or reach directly into `localStorage`.

### Infrastructure

`src/infrastructure/` implements ports and runtime boundaries.

It owns:

- versioned storage envelopes
- Zod validation
- DTO ↔ domain reconstruction
- browser storage access
- explicit persistence failure mapping
- safe retirement of historical non-shopping keys
- camera, barcode, visual-recognition, price-OCR and product-lookup adapters

Infrastructure must reconstruct domain objects through domain validation rather than trusting raw persisted JSON.

### React / features

`src/features/` owns:

- rendering
- local drafts
- focus management
- disclosure/overlays
- accessibility semantics
- interaction feedback

React components may call domain selectors for display, but financial mutation rules belong in domain/application code.

### Composition root

`src/app/composition-root.ts` is the wiring boundary between browser adapters and the application controller.

Keep environment-specific construction here instead of scattering singleton creation through features.

It also applies the deployed-surface storage scope to the shopping keys: guarded evidence builds prefix them with the path they are served from, while the public app keeps its original keys (D-052). Evidence keys get the same scope in `src/qa/evidence-storage.ts`; the appearance preference stays unscoped.

### QA

`src/qa/` records and analyzes validation evidence only. Production shopping code depends on the `#shopping-evidence` adapter contract, which resolves to a NoOp implementation in the public build and to the guarded evidence implementation only in guarded evidence builds. The cohort build points the separate `#app-entry` alias at the analyzer instead of the shopping product, so analysis code is never bundled into the public product.

QA data:

- must be separate from shopping persistence
- must not change financial outcomes
- must not become a required runtime dependency
- must not transmit shopping content unless a future privacy/consent decision explicitly allows it

## State ownership

### Canonical product state

The controller owns the in-memory application snapshot:

- lifecycle
- active trip
- completed summary/history
- durability health
- completed-history integrity (independent of write health)
- completion-cleanup state
- Price Memory snapshot/health
- barcode-link snapshot/health
- Undo snapshot
- recovery state

React subscribes through `useSyncExternalStore`.

Do not duplicate controller-owned business state into component state.

### Ephemeral UI state

Components may own temporary values such as:

- input drafts
- open/closed overlays
- focus targets
- confirmation UI
- transient feedback

Ephemeral UI state must not become a second source of truth for committed money.

## Exact-money architecture

EUR is the current currency scope.

Canonical values use safe integer cents.

```text
"3.79" input
   ↓ parse/validate
379 MinorUnits
   ↓ domain command
CartItem
   ↓ selector
cart total / remaining / safe remaining
   ↓ format
"€3.79"
```

Never use `parseFloat` + multiplication as a financial authority.

## ShoppingTrip domain

`shopping-trip.ts` is the stable public façade for the trip domain. Internal ownership is split by reason to change:

- `shopping-trip-model.ts` — canonical types, constructors and validation;
- `shopping-trip-selectors.ts` — derived totals and projections;
- `shopping-trip-reducer.ts` — state-changing trip commands.

Together they own:

- trip/item validation
- lifecycle-safe commands
- item identity and timestamps
- cart and line totals
- budget/safety-buffer projections
- remaining/overage selectors
- completion and checkout reconciliation

`reduceTrip()` is the central transition boundary for committed trip mutations.

UI-specific labels, focus and modal state do not belong here.

## Persistence architecture

Current durable stores are local-first and versioned.

Core durability is stronger than convenience durability.

[architecture/DATA-PERSISTENCE.md](./architecture/DATA-PERSISTENCE.md) owns the persistence rules: completion ordering, startup reconciliation, recovery and the advisory stores.

### Active trip and completed history

Completed history is durable before the active-trip snapshot is cleared. A failed history write must never delete the active trip, and a stale active copy of a recorded trip is reconciled rather than duplicated.

### Read failure

Malformed, invalid-business-value, conflicting or unsupported-future persisted data is not silently coerced.

Recovery surfaces preserve raw material where the contract allows it.

Only an unreadable active record blocks the shopping flow. Every unreadable state keeps an explicit exit that never destroys data: continue without saving (writes refused for the session) or set the record aside (exact raw backup first). See D-051.

### Price Memory

Price Memory is an independent advisory subsystem.

It may improve repeated use, but:

- a Price Memory write failure cannot invalidate a completed trip
- remembered prices remain explicitly remembered
- reuse does not refresh observation age unless a current price is actually confirmed
- deletion semantics remain independent from completed-trip history

Barcode names (D-054) are advisory and independently durable in the same way.

## React boundary

The product does not require Redux/Zustand/XState/router infrastructure for its current state model.

The controller + `useSyncExternalStore` boundary is sufficient because:

- there is one product shell
- state transitions are centralized
- domain rules are already pure
- persistence ordering lives outside React

Add a state library only when measured complexity cannot be handled cleanly by the current controller/contract boundary.

## Complexity management

Large files are a signal to inspect responsibilities, not an automatic refactor trigger.

Prefer extraction when one file owns multiple reasons to change, for example:

- public contracts + implementation
- serialization + storage transactions
- rendering + business orchestration
- product state + evidence collection

Do not introduce micro-files that make a single use case harder to trace.

Current structure:

- public application contracts are separated from controller implementation
- completion / checkout reconciliation is a cohesive application use-case module rather than part of the central controller body
- controller-wide state/result helpers live in a small support module and remain presentation-agnostic
- storage codec/schema reconstruction is separated from transactional persistence/recovery while preserving the existing public storage exports
- shell focus restoration is isolated from product orchestration
- price-entry presentation copy/calculation and the dumb keypad are separated from the stateful price-entry flow

Future extraction should continue by cohesive use-case boundary (for example history or recovery), not arbitrary line counts.

## UI architecture

The active-trip hierarchy remains:

1. remaining / over-budget amount
2. budget context
3. capacity/status visual
4. primary add action
5. cart details
6. secondary tools

Manual price entry is the baseline interaction.

Remembered/scanned/estimated values are accelerators and must never remove the explicit current-price path.

## Motion

Motion is progressive enhancement.

No committed financial mutation may depend on animation or View Transition completion. The current product does not require View Transition orchestration as an architectural dependency.

Reduced-motion behaviour must preserve the same information and controls.

## Local-first / network boundary

The product is intentionally **account-free, backend-free and offline-first**.

Canonical shopping state, history, Price Memory and barcode names remain device-local. The active roadmap does not include:

- authentication;
- backend account infrastructure;
- cloud sync;
- shared-shopping collaboration;
- remote shopping-state persistence.

The optional, tap-only Open Food Facts name lookup and first-use delivery of the pinned visual-recognition model are the two external network boundaries. Barcode and price-reader engine files are served by this site. Visual inference itself is local: photos, candidate labels, prices and shopping state are not uploaded. The lookup remains an accelerator rather than infrastructure authority:

- provider payloads are runtime validated;
- network failure degrades to manual entry;
- product identity is not current-price authority;
- no external service may become required to start, continue, recover or finish a shopping trip.

Do not introduce remote state pre-emptively.

## PWA / offline

The public product ships an **IMPLEMENTED** installable/offline application shell.

- `vite-plugin-pwa` generates the service worker through Workbox `generateSW`;
- Workbox precaches the application shell; the self-hosted barcode (`.wasm`) and price-reader engine files are cached on first use (`CacheFirst`) instead of being precached;
- canonical shopping state remains owned by the application/localStorage persistence adapters, never Cache Storage or the service worker;
- no guarded build generates or registers a service worker (`VitePWA` is disabled for every guarded build, and CI asserts it);
- service-worker updates use a prompt flow rather than auto-update;
- the update prompt is withheld during active/recovery/completed-summary shopping lifecycle states and is only offered from the idle state, so a new worker never forces a reload during an active trip.

Offline browser coverage verifies that an already installed/cached shell can restore an active trip, complete it while offline, persist history and restore that history after another offline reload.

## Android APK shell

Android distribution is an **IMPLEMENTED packaging boundary**, not a second product implementation.

- the native project lives under `android/`;
- CI builds the same React/Vite product with relative asset URLs and `VITE_SHOPPING_ANDROID_WRAPPER=1`;
- that Android-specific build disables the PWA manifest/service worker, then copies the immutable web payload into the APK;
- `WebViewAssetLoader` exposes those bundled files on `https://appassets.androidplatform.net/assets/web/`, preserving HTTPS/same-origin semantics without `file://`;
- WebView file/content access and mixed cleartext content are disabled;
- external top-level links leave the shell and open in the system browser;
- camera access is granted only to the local bundled origin, only for video capture, and only after Android CAMERA permission succeeds;
- Android backup is disabled so WebView shopping state is not promoted into a cloud-backup data path;
- the native shell owns no ShoppingTrip, money, history, Price Memory or evidence state.

The package targets API 36 and keeps API 24 as its minimum runtime. AndroidX WebKit is the only native runtime dependency admitted by D-059.

The installable CI preview APK uses Android's debug signing identity and a `.debug` application-id suffix. Production release APKs are generated from the exact CI-tested unsigned release payload and must be signed later with a private release key supplied through GitHub Actions secrets. No signing key belongs in git.

## Barcode, visual product recognition and price-tag reading

Production barcode identification (D-053), visual product recognition (D-057) and price-tag reading (D-055) are implemented and share one camera.

Layers:

- `domain/product-code.ts` parses EAN-13/EAN-8/UPC-A/UPC-E into a GTIN-14 or a store-code/coupon verdict; `domain/barcode-link.ts` owns remembered barcode names; `domain/shelf-price.ts` turns OCR text lines and their printed heights into ranked exact-money price candidates;
- `application/camera-ports.ts` defines `CameraPort`; `application/barcode-ports.ts` defines `BarcodeReaderPort`, `ProductLookupPort` and `BarcodeLinkPersistencePort`; `application/visual-recognition-ports.ts` defines `VisualProductRecognizerPort`; `application/price-tag-ports.ts` defines `PriceTagReaderPort`; `application/barcode-scan.ts` stabilises readings; the controller's `identifyBarcode` and the `barcode` input on add commands are the only state entry points, and a read price reaches state only through confirmed price entry;
- `infrastructure/camera/` opens the stream, maps camera errors, exposes the torch and captures the framed part of a cover-fitted preview, loaded only when the camera opens; `infrastructure/barcode/` adapts the native detector and the lazily imported ZXing fallback; `infrastructure/visual-recognition/` owns the lazy pinned CLIP adapter with WebGPU/WASM fallback; `infrastructure/price-ocr/` holds the lazily imported Tesseract adapter and its layout mapping; `infrastructure/product-lookup/` holds the lazily imported Open Food Facts adapter; `infrastructure/storage/barcode-link-storage.ts` owns the `budget-cart:barcode-links` record;
- `features/shopping/ScanSurface.tsx` is a lazily loaded trip overlay that never mutates state itself;
- the composition root builds the adapters only when the build switches allow them.

Production adapters preserve these boundaries:

- barcode → identity candidate, not current price authority
- visual recognition → ranked identity candidates, never automatic product/price authority
- OCR → price candidate, not committed cart mutation
- user confirmation → domain/application command
- failure → manual entry remains available

Provider payloads must be runtime validated before entering domain/application logic.

## Testing architecture

### Domain

Pure tests cover exact money, trip invariants, projections and Price Memory rules.

### Application

Controller tests cover lifecycle, Undo, persistence ordering, completion, history, recovery and Price Memory coordination.

### Infrastructure

Storage tests cover schemas, malformed/future data, write failures, completion transactions and reconciliation.

### Components

Testing Library verifies user-visible interaction and accessibility semantics.

### Browser

Playwright runs Chromium, Firefox and WebKit journeys including accessibility and responsive/recovery cases.

Human physical/timing evidence remains a separate gate and must not be inferred from automation.

## Security and privacy posture

Current core data stays local.

The product does not require:

- authentication
- bank access
- remote shopping-content telemetry
- third-party financial APIs

Evidence tooling is intentionally content-minimized and separate from business persistence.

## Architectural invariants

A change is architecturally acceptable only if all relevant invariants remain true:

1. canonical money is exact integer minor units
2. domain remains framework/browser independent
3. React does not become financial authority
4. committed mutations go through domain/application rules
5. persistence failure is visible and cannot silently masquerade as durable success
6. completed-history durability is protected before active-trip cleanup
7. Price Memory remains advisory and independently durable
8. QA evidence remains separate from product state
9. manual entry remains available
10. external payloads are validated at boundaries
11. current docs describe current code; completed phase narration is deleted, and git history keeps it

## Review checklist

Before merging architecture-affecting work:

- What layer owns the behaviour?
- Is there a new source of truth?
- Did any derived value become persisted unnecessarily?
- Can any failure path lose or misrepresent a committed trip?
- Did convenience state become coupled to core durability?
- Did React gain domain/application responsibility?
- Is a new dependency justified by current product value?
- Are code, tests and the smallest owning document updated together?
