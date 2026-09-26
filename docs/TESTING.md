# Testing

## Status

**IMPLEMENTED quality contract.**

Testing protects user outcomes and financial correctness, not implementation trivia.

Future capability test plans that are not yet part of the product live in [reference/FUTURE-QUALITY-PLANS.md](./reference/FUTURE-QUALITY-PLANS.md).

## Quality priorities

In order:

1. exact money;
2. loss-resistant persistence/recovery;
3. correct lifecycle and completion;
4. fast correction;
5. user-visible consequences;
6. accessibility;
7. repeat-trip / Price Memory semantics;
8. evidence integrity;
9. cross-browser reliability;
10. installable/offline-shell reliability;
11. performance/premium interaction quality.

## Definition of done

A code change is complete only when relevant checks pass:

- lint;
- strict TypeScript;
- unit tests;
- component tests;
- production build;
- affected Playwright flows;
- accessibility expectations;
- owning documentation when behaviour/contracts changed;
- dependency changes pass the pull-request Dependency Review gate.

Critical money, persistence or recovery behaviour may not rely on “manual QA later”.

## Repository gate

```bash
npm ci
npm run check
npm run test:e2e
```

`npm run check` runs these steps in order and stops at the first failure:

1. `docs:check` — documentation structure (`scripts/validate-docs.mjs`): required contract paths, retired paths, repository-root and docs-root file placement, relative Markdown links and their heading anchors, and reachability from `docs/README.md`;
2. `lint` — ESLint with no warnings allowed, including the architectural layer-boundary import rules;
3. `typecheck` — strict TypeScript (`tsc --noEmit`);
4. `test:coverage` — every Vitest unit and component test, with the coverage floors below;
5. `build` — the public production build;
6. `build:check` — the public build validator (`scripts/validate-build.mjs`): install manifest, icons, install-dialog screenshots (real size, not precached) and service worker, the [public bundle budget](#public-bundle-budget), engine isolation and the guarded-evidence marker scan.

`npm run test:e2e` builds the public app and runs the public Playwright suite in Chromium, Firefox and WebKit. Tests tagged for a guarded evidence surface run only with `PLAYWRIGHT_GUARDED_SURFACE=1`, which CI sets while it serves that surface.

### Critical-layer coverage floor

Coverage is a regression guard for code where arithmetic, lifecycle, durability or device-boundary defects can change user outcomes. `vitest.config.js` measures:

- `src/domain/**`;
- `src/application/**`;
- `src/infrastructure/storage/**`;
- the camera, scanning and lookup adapters: `src/infrastructure/barcode/browser-barcode-reader.ts`, `src/infrastructure/camera/browser-camera.ts`, `src/infrastructure/price-ocr/tesseract-layout.ts`, `src/infrastructure/price-ocr/lazy-price-reader.ts` and `src/infrastructure/product-lookup/**`.

The baseline measured on 2026-09-26, with each scope aggregating every file it covers, was:

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| All measured files | 90.66% | 83.74% | 98.43% | 90.57% |
| Domain | 89.75% | 82.93% | 100% | 89.59% |
| Application | 91.09% | 84.42% | 95.45% | 90.98% |
| Storage infrastructure | 88.19% | 78.46% | 100% | 88.11% |
| Camera, scanning and lookup adapters | 96.88% | 94.37% | 97.59% | 97.09% |

CI enforces these floors from `vitest.config.js`, set below the measured baseline instead of claiming an arbitrary 100% target:

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| All measured files | 84% | 74% | 96% | 84% |
| Domain | 85% | 75% | 100% | 85% |
| Each domain file | 70% | 55% | 90% | 70% |
| Application | 86% | 77% | 95% | 86% |
| Each application file | 60% | 60% | 50% | 60% |
| Storage infrastructure | 82% | 71% | 95% | 82% |
| Each storage file | 45% | 45% | 50% | 45% |

The per-file floors prevent a newly added domain, application or storage module from silently entering the repository with no meaningful tests. The camera, scanning and lookup adapters count towards the all-files floor but have no floor of their own.

Persistence recovery is additionally exercised by an exhaustive scenario matrix (`tests/persistence-scenarios.test.ts`): every combination of stored active record, history, Price Memory and storage failure mode is booted through the real composition root and must leave the shopper able to shop without losing any unreadable record.

Coverage does **not** replace browser, accessibility, persistence-failure, real-device or human-evidence gates. Presentation and QA evidence code remain primarily protected by behaviour-focused tests rather than the same numeric threshold.

### Continuous integration

The Quality workflow runs on every pull request and every push to `main`, and tests the exact artifact it deploys:

- **quality** — installs with `npm ci`; generates a production CycloneDX SBOM and validates its envelope, product identity and runtime dependency inventory; runs `npm audit --omit=dev --audit-level=high`; runs `npm run check`; builds and validates a build with `VITE_SHOPPING_BARCODE_SCANNER=0` and `VITE_SHOPPING_PRICE_OCR=0`; then builds and validates the public release build, builds every guarded evidence build, checks that each guarded build is relocatable and has no manifest or service worker, and uploads the combined site as one immutable `pages-site` artifact;
- **provenance** — on pushes and same-repository pull requests, verifies the SBOM digest and attaches signed build-provenance and SBOM attestations to the exact uploaded `pages-site` digest;
- **artifact-integrity** — checks that the artifact holds the public install files, that every guarded surface has its page but no manifest or service worker, and that no source, package, `study/`, build-directory or SBOM file entered it;
- **browser** (Chromium, Firefox and WebKit) — runs the public Playwright suite against the exact public build; its axe scans run in the Chromium leg;
- **guarded-browser** — in Chromium, serves each guarded surface in turn from the same artifact and runs its tagged tests with `PLAYWRIGHT_GUARDED_SURFACE=1`; it continues past a failed surface, names every failed surface and then fails;
- **deploy** — on pushes to `main` only, and only after artifact-integrity, provenance, browser and guarded-browser succeed, publishes the exact tested artifact to GitHub Pages.

Pull requests also run a least-privilege Dependency Review workflow. It fails when a changed runtime, development or unknown-scope dependency introduces a high/critical known vulnerability, while showing patched-version guidance when GitHub Advisory data provides it. The action is pinned to an immutable commit SHA and does not receive pull-request write permission. A CodeQL workflow analyses the JavaScript and TypeScript code on pushes and pull requests to `main` and once a week.

Guarded evidence builds use a relative asset base so the exact tested directories are relocatable without rebuilding. They are stamped with the exact Git commit SHA, and their downloaded JSON must expose that revision. A separate manual **Publish Study Baseline** workflow may copy those already-tested guarded directories into an immutable `/study/<baseline>/` Pages path after verifying the selected successful main Quality run and exact source SHA. Existing study directories are preserved tree-for-tree by later production deployments, and reusing an existing baseline slug fails closed. See [Immutable Study Deployments](./evidence/IMMUTABLE-STUDY-DEPLOYMENTS.md).

The SBOM scanner is commit-pinned, its Syft version is pinned, JavaScript devDependencies are omitted and Syft's GitHub Actions catalogers are explicitly disabled so workflow metadata nested inside installed packages cannot contaminate the product inventory. The SBOM is retained as CI evidence with a SHA-256 digest while remaining outside the public Pages site.

## Test layers

### Domain

Highest density.

Cover:

- parser/format rules;
- exact minor-unit arithmetic;
- budget/buffer invariants;
- quantity;
- line/cart totals;
- remaining/safe remaining;
- over-budget boundaries;
- ShoppingTrip commands;
- provenance/confidence;
- Price Memory selection/learning.

Use property-style tests where algebraic invariants are stronger than example-only coverage.

### Application

Cover:

- lifecycle;
- command acceptance/rejection;
- immutable snapshot semantics;
- one notification per state change;
- Undo;
- completion ordering;
- checkout reconciliation;
- history;
- recovery;
- Price Memory coordination;
- degraded durability.

### Persistence / infrastructure

Cover:

- valid DTO → domain reconstruction;
- malformed JSON;
- invalid business values;
- unsupported future versions;
- write/remove/read failure;
- history conflicts;
- loss-safe completion;
- stale active/completed reconciliation;
- legacy non-shopping key retirement;
- independent Price Memory persistence.

Never make schema validation the only domain validation.

### Components

Test user-visible semantics:

- start trip;
- add price;
- projected consequence;
- quantity;
- over-budget confirmation;
- edit/remove/Undo;
- budget adjustment;
- persistence warning;
- completion/history;
- Price Memory/recent item flows;
- local-data controls;
- focus restoration and announcements.

Prefer role/name queries over implementation selectors.

### Browser E2E

Protect critical real workflows across:

- Chromium;
- Firefox;
- WebKit.

At minimum cover:

1. clean start;
2. create trip;
3. add prices;
4. correct an item;
5. reload/restore;
6. finish;
7. history;
8. repeat trip / remembered value where applicable;
9. degraded/recovery cases covered by browser harness;
10. accessibility scans/critical keyboard paths;
11. install manifest/service worker and offline active-trip/history recovery.

## PWA / offline shell

Automation must prove:

- the public release artifact contains a valid install manifest, install icons, install-dialog screenshots and generated service worker;
- guarded evidence builds do not create competing service workers;
- after one successful online install/cache pass, the shell opens when network requests are unavailable;
- an active trip restores offline with exact canonical values;
- completion/history persistence continues offline;
- history restores after a subsequent offline reload;
- Cache Storage/service-worker behaviour never becomes shopping-state authority.

Service-worker updates must remain prompt-based. Automated or runtime update logic must never force an active shopping trip to reload.

CI runs the full browser-offline reload journey in Chromium and Firefox. WebKit CI verifies the manifest, service-worker registration and precached application entry; Playwright WebKit offline navigation is not treated as Safari/device evidence because its Web Inspector harness cannot reliably navigate once offline.

## Exact-money contract

Tests must prove:

- no canonical float arithmetic;
- comma/period input follows MONEY-SPEC;
- extra fraction digits reject rather than silently round;
- product bounds hold;
- quantity multiplication remains safe;
- format does not mutate canonical values;
- known floating-point regression cases never leak into displayed canonical money.

The complete parser matrix lives in `specs/MONEY-SPEC.md`; do not duplicate it here.

## Persistence contract

Tests must prove:

- committed active-trip mutations attempt persistence promptly;
- failed history write does not clear active state;
- history-durable + active-clear failure becomes cleanup-pending/degraded;
- startup reconciles stale completed copies safely, and never an open copy edited since its completion;
- malformed/future data is preserved or rejected according to contract;
- convenience-state failure never masquerades as core durable success.

Detailed storage cases live in `architecture/DATA-PERSISTENCE.md` and `specs/STORAGE-SCHEMA.md`.

## Price Memory / repeat use

Tests must prove:

- only eligible completed confirmed observations are learned;
- remembered values remain remembered;
- stale memory is not presented as authoritative current price;
- reuse does not fabricate a new observation timestamp;
- deletion is independent from history;
- Price Memory failure does not invalidate completed-trip durability.

## Accessibility

The automated and manual accessibility checks are owned by [Automated checks](./quality/ACCESSIBILITY.md#automated-checks) and [Manual checks](./quality/ACCESSIBILITY.md#manual-checks) in quality/ACCESSIBILITY.md.

## Motion / premium interaction quality

Test behaviour, not decorative frames.

Verify:

- add/undo/edit work with reduced motion;
- no financial commit depends on animation callbacks;
- motion failure cannot duplicate/drop a mutation;
- important controls remain responsive;
- layout does not shift unpredictably as money values change.

Selective visual regression is useful for stable states such as:

- empty active trip;
- normal budget;
- near-limit;
- over-budget;
- keypad;
- completion summary.

Do not create brittle screenshot tests for every animation frame.

## Evidence tooling

### Timing QA

Automation may verify the recorder and eligibility rules.

It may not claim the human timing target was passed.

The QA recorder must not mutate shopping state or fabricate physical evidence.

Timing-evidence tests must also prove:

- an excluded timing sample stays in evidence;
- each exclusion references a real sample ID and requires a bounded non-empty reason;
- documented external interruptions are omitted from timing KPIs without deleting the sample;
- a stored session whose exclusions reference unknown samples is not restored;
- the timing export carries the exact `buildRevision` of the build that recorded it;
- local timing JSON download uses a non-identifying timestamp filename;
- the guarded QA browser gate verifies the downloaded export revision equals the exact tested Git SHA.

### Retention beta

Tests must prove:

- evidence remains local unless explicitly copied or downloaded by the facilitator;
- no prices, budgets, item names, product/store identities or checkout values enter the evidence schema;
- event history is bounded without sliding-window truncation of earlier evidence;
- the event-capacity boundary fails closed and at-capacity exports are rejected from primary cohort ingestion;
- storage write failure leaves shopping behaviour unchanged while surfacing a visible memory-only evidence warning;
- malformed retained evidence is preserved unchanged, freezes recorder/export, and requires explicit reset before a fresh session can be written;
- trip ordinals are session-relative;
- milestones deduplicate;
- entry completion/abandonment remain distinguishable;
- remembered reuse/current-price override remain distinguishable;
- recorder/storage failure cannot alter shopping behaviour;
- beta UI cannot block the primary flow;
- retained events cannot predate the beta session start;
- export `generatedAt` cannot predate retained session evidence;
- export UI handles invalid device-clock chronology without crashing the beta panel;
- local JSON download uses a non-identifying session-timestamp filename and preserves the same privacy-safe export contract as clipboard copy;
- retention export schema carries a validated `buildRevision`;
- 7/14/30-day retention uses maturity-aware denominators so right-censored participants are not counted as failures;
- each window-specific cohort summary exposes its eligible participant count;
- the cohort analyzer keeps recruitment readiness (20–50 real shoppers) separate from 7/14/30-day interpretation readiness;
- a window is not marked ready for interpretation until at least 20 participants are eligible for that specific window;
- aggregate second-/third-trip shares are visibly labelled as observed-so-far rather than time-normalized retention;
- second-/third-trip metrics require contiguous chronological trip starts rather than ordinal gaps;
- orphan or pre-start finish events do not inflate completed-trip counts;
- partial interaction evidence remains available for friction analysis without being promoted to retention/completion evidence;
- the local cohort analyzer rejects invalid/tampered exports and implausibly future-dated observation timestamps before aggregation;
- one in-memory cohort accepts exactly one source `buildRevision`; mixed source revisions are rejected rather than implicitly combined;
- aggregate output records both the source evidence revision and the analyzer build revision;
- a newer export from the same retained evidence session replaces an older one rather than double-counting it;
- analyzer state remains page-memory only and aggregate copy/download output excludes raw participant events and filenames;
- local aggregate download uses a non-identifying timestamp filename and the exact same aggregate payload contract as clipboard copy;
- local-development revisions remain inspectable but cannot produce downloadable/copyable field aggregate evidence;
- field aggregate schema requires non-empty source evidence plus immutable full-Git-SHA source and analyzer revisions;
- the aggregate embeds a recomputable maturity-aware readiness snapshot;
- aggregate runtime parsing rejects tampered counts/rates/readiness, empty field aggregates and source-report-count mismatches;
- aggregate privacy flags explicitly exclude raw events, participant filenames and participant identifiers.

Real-store retention evidence remains a human/product-validation gate.

### Production barcode scanner

Tests must prove:

- EAN-13/EAN-8/UPC-A/UPC-E parsing, UPC-E expansion, check-digit rejection of every single-digit error (property test), store codes, coupons and display round-trips (`tests/product-code.test.ts`);
- barcode links: normalisation, newest-wins with clock rollback, the 500-link bound, versioned storage, damaged/newer/conflicting records reported rather than guessed (`tests/barcode-links.test.ts`);
- the scan stabiliser needs two agreeing reads in its window and ignores misreads;
- the controller links a barcode only after a named item is added, recalls the name and the last remembered price, never writes over an unreadable record, clears links with remembered prices and keeps them in memory only in session-only mode (`tests/shopping-app-barcode.test.ts`);
- the camera adapter maps camera errors, retries without constraints, releases the camera on every failure, exposes the torch only when present, captures exactly the framed part of a cover-fitted preview and loads its implementation only when opened (`tests/browser-camera.test.ts`);
- the barcode reader picks the native detector only when it reads every retail format, falls back to the lazy engine otherwise, prefetches the fallback once and never detects before the preview has a frame (`tests/barcode-reader-adapter.test.ts`);
- the Open Food Facts adapter requests only the shown fields, omits credentials and referrer, treats not-found as normal, reports failures without guessing, times out, respects cancellation and never runs while offline or before a tap (`tests/open-food-facts.test.ts`);
- the scan surface handles every barcode and price tag result and failure state, mode switching on one camera session, preparation progress, focus, Escape, the light toggle, background pause and cancelling an unfinished read (`tests/ScanSurface.test.tsx`); the shell flows name a product once and recognise it on the next scan, read a price tag and add it only after confirmation, return from the camera to price entry with its name and quantity, and show the scan action only for what the device can do (`tests/ScanFlow.test.tsx`);
- `VITE_SHOPPING_BARCODE_SCANNER=0` removes barcode reading and the online lookup but keeps the camera for price tags, `VITE_SHOPPING_PRODUCT_LOOKUP=0` removes only the lookup, `VITE_SHOPPING_PRICE_OCR=0` removes price reading, and the camera disappears only when barcode scanning and price reading are both off (`tests/camera-switches.test.ts`); CI also builds and validates a build with both camera switches at `0` (see [Public bundle budget](#public-bundle-budget));
- in Chromium, a fake camera streaming a generated EAN-13 decodes through the self-hosted WASM engine with no request leaving the origin, and the result screen passes axe (`e2e/barcode-scanner.spec.js`). The fake-camera test runs in Chromium only; Firefox and WebKit cover the rest of the product flow. When a build switches the scanner off, the same spec instead checks in every browser that the trip offers no barcode scanning.

Production barcode shipped ahead of its field evidence (D-053); issue #73 remains an open post-release gate that automation cannot close.

### Production price tag reading

Tests must prove:

- candidate ranking accepts the headline number without a euro sign, keeps unit/regular/member/multi-buy context from only the words printed since the previous amount, puts a multi-buy tag's per-item price first, joins superscript and split cents, never turns quantities, bare digits, codes or dotted dates such as "24.09.2026" and "24.09.–30.09." into prices, and always returns a bounded, duplicate-free, score-ordered list (`tests/shelf-price.test.ts`, including a property test);
- Tesseract layout mapping reads nested blocks defensively, measures lines by their tallest number, finds the headline number, recognises raised cents and targets the second digits-only read (`tests/price-ocr.test.ts`);
- the engine reads in one pass when it can, adds the second pass only for whole-euro headlines, replaces a failed worker, times out, stops at once on cancel and refuses reads after dispose; the lazy reader loads the engine once, shares progress, retries a failed load, releases the engine when idle and points it at this site's own files (`tests/price-ocr.test.ts`);
- price entry starts from a read price, says it came from the tag until the amount changes, and opens the reader with the name and quantity typed so far (`tests/PriceEntrySurface.test.tsx`);
- in Chromium, a fake camera showing `e2e/fixtures/price-tag-1-29.mjpeg` is read by the self-hosted Tesseract files with no request leaving the origin, the candidate screen passes axe, and the chosen price is added only after confirmation (`e2e/price-tag-scanner.spec.js`). When a build switches price reading off, the same spec instead checks in every browser that price entry offers no "Read price tag" action. `e2e/support/render-price-tag-fixture.mjs` regenerates the fixture.

Price tag reading shipped ahead of its field evidence (D-055); issue #90 remains an open post-release gate that automation cannot close.

## Performance

### Public bundle budget

The production build has separate total, initial-load and on-demand engine budgets. The baseline measured on 2026-09-26 for the release build, with barcode scanning and price tag reading shipped, is approximately:

- initial application JavaScript: 391,335 raw bytes / 113,185 gzip bytes;
- total public JavaScript (without the barcode and price engines): 421,473 raw bytes / 123,693 gzip bytes, including the lazy scan surface, the lazy camera implementation, the lazy Open Food Facts adapter and `workbox-window`;
- barcode engine JavaScript (`zxing-fallback-detector-*`): 43,541 raw bytes / 14,964 gzip bytes; barcode engine WASM: 1,093,289 bytes;
- price reader JavaScript (`tesseract-price-reader-*`): 26,919 raw bytes / 11,022 gzip bytes; price reader files: 9,798,124 bytes, of which a device downloads one 2.9 MB core and the 3.8 MB language file;
- initial CSS: 68,130 raw bytes / 11,001 gzip bytes; total CSS with the lazy scan surface: 74,164 raw / 12,735 gzip bytes.

CI currently enforces:

- total public JavaScript without the engines: <= 443,000 raw / 132,000 gzip bytes;
- initial JavaScript referenced by the public HTML: <= 396,000 raw / 116,000 gzip bytes, and it must contain neither engine;
- any single JavaScript chunk: <= 230,000 raw bytes (React ships as its own chunk, so an app update does not re-download it);
- exactly one barcode engine chunk: <= 60,000 raw / 20,000 gzip bytes, outside the initial bundle;
- exactly one barcode engine WASM file: <= 1,200,000 bytes, whose SHA-256 must equal the bundled `zxing-wasm` reader build;
- exactly one price reader chunk: <= 40,000 raw / 14,000 gzip bytes, outside the initial bundle;
- every self-hosted price reader file present, within its own budget, byte-identical to its pinned package file, <= 10,500,000 bytes together, and absent from the service worker precache;
- total public CSS: <= 81,500 raw / 15,600 gzip bytes;
- initial CSS referenced by the public HTML: <= 63,000 raw / 10,600 gzip bytes.

The engine budgets apply only to a feature the build ships. With `VITE_SHOPPING_BARCODE_SCANNER=0` the validator skips the barcode engine chunk and WASM checks and reports "barcode scanning switched off"; with `VITE_SHOPPING_PRICE_OCR=0` it skips the price reader chunk and file checks, reports "price tag reading switched off" and fails if the build still ships the price reader files. CI builds and validates one build with both switches at `0`.

The build validator classifies module scripts, module-preload links and stylesheets from generated HTML, so a camera capability can be code-split without silently joining the startup path. Its guarded-evidence marker scan reads every public JavaScript chunk except the two lazy engine chunks. The total budgets were raised explicitly for the lazy scan surface (D-053, D-055), and the initial CSS gzip budget by 100 bytes for the price entry "Read price tag" control (D-055). The 2026-09-26 release audit moved trip history and the recovery screen out of the startup bundle (history is fetched in the background once a trip has been finished), tightened the initial budgets to what remains, and raised the total gzip budgets because those screens now compress as separate files. Field borders of at least 3:1, state colours, the pinned remaining amount and the privacy footer then raised both CSS gzip budgets by 300 bytes. Cancelling an empty trip and the install offer raised the initial and total JavaScript budgets by 5,000 raw / 1,500 gzip bytes and the initial CSS budget by 1,000 raw bytes; they stay in the startup bundle because both are on the screens a shopper opens first. Adding a receipt total from a history card raised the total CSS budgets by 1,500 raw / 300 gzip bytes, all in the history screen's own lazy stylesheet. Making room when browser storage is full, and adding a receipt total from history, raised the total JavaScript budgets by 5,000 raw / 500 gzip bytes and the initial ones by 3,000 raw / 500 gzip bytes; the storage-full notice stays in the startup bundle so it works offline mid-trip. The second release audit's fixes (a pinned keypad, ghost-tap guards, recovering a wiped open trip, a labelled Undo, keypad read-back and inline field errors) raised the initial and total JavaScript budgets by 3,000 raw bytes and the initial CSS budget by 1,000.

Protect:

- fast initial product load;
- immediate local add/edit/undo response;
- stable bundle trend;
- no guarded evidence markers in the public JavaScript the marker scan covers (every chunk except the two lazy engine chunks);
- public JS/CSS remain within the enforced bundle budgets;
- optional capability isolation.

Do not accept a premium visual effect that materially slows the core aisle interaction.

## Security / privacy

Tests and fixtures must avoid real personal shopping data.

Verify local-data deletion paths and ensure evidence tooling does not accidentally collect content.

## Regression policy

When a bug affects a meaningful user outcome:

1. reproduce it at the lowest useful layer;
2. add a regression test;
3. fix the cause;
4. keep the test readable as a future contract.

## What not to test

Avoid brittle tests for:

- private implementation structure;
- exact DOM nesting without semantic reason;
- CSS class names;
- decorative animation frames;
- arbitrary internal helper calls.

Protect behaviour, invariants and user outcomes.

## Release checklist

Before a significant release:

- full quality gate green;
- no unresolved money/persistence regression;
- critical browser journeys green;
- accessibility contract checked;
- current docs match current behaviour;
- any required human/evidence gate is explicitly pass/fail/not-run;
- premium polish has not compromised speed, clarity or accessibility.
