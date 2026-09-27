# Future Capability Decisions

## Status

Accepted decision records. These explain durable choices but do not override current code/tests or authoritative current contracts.

Use [../DECISIONS.md](../DECISIONS.md) as the retrieval index.

## D-028 — PWA uses vite-plugin-pwa + Workbox generateSW first

Date: 2026-09-21

Status: accepted

### Decision

Implement initial offline/PWA support with:

- vite-plugin-pwa
- Workbox generateSW
- prompt-based updates
- application-shell precaching

Do not hand-write the first service worker.

### Rationale

The core offline requirement is simple static-shell availability.

A generated Workbox service worker is more reliable and maintainable than custom lifecycle/cache code for the MVP.

### Consequence

Business data remains in localStorage, not Cache Storage.

The service worker must never force a reload during an active trip.

### Revisit when

A documented feature requires custom background sync, complex runtime caching, or bespoke service-worker messaging. At that point, evaluate injectManifest.

## D-031 — Barcode scanning uses progressive native + lazy WASM detection

Date: 2026-09-21

Status: accepted

### Decision

For P1 barcode scanning:

1. use native BarcodeDetector when supported for required formats
2. otherwise lazy-load a BarcodeDetector-compatible ZXing-C++ WebAssembly ponyfill
3. self-host WASM for offline compatibility

The current preferred fallback candidate is the barcode-detector package.

### Rationale

The native Barcode Detection API remains unavailable in some widely used browsers.

A standardized native/ponyfill interface gives cleaner capability boundaries than coupling the application to one scanner library.

### Consequence

Scanner code remains outside the initial bundle and behind the `BarcodeReaderPort` and `CameraPort` application ports.

Manual price entry remains available in every scanner failure state.

As shipped: the native detector is used only when it reports every retail format (EAN-13, EAN-8, UPC-A, UPC-E). Otherwise `barcode-detector` 3.2.2 (ZXing-C++ `zxing-wasm` 3.1.3) is imported on demand. Its WASM is self-hosted: the default CDN location is overridden, the build fails unless the emitted file matches the bundled reader's SHA-256, and the service worker caches it on first use. Devices without a usable native detector fetch it in the background once a trip is active, so scanning keeps working offline in the store.

### Revisit when

Browser support becomes sufficient to drop the fallback, or benchmark data shows a materially better scanner SDK.

## D-032 — Open Food Facts is an optional product-identity provider, not a price provider

Date: 2026-09-21

Status: accepted

### Decision

Use Open Food Facts as the first provider candidate behind ProductLookup for barcode-based product identity.

Do not treat it as an authoritative current store-price source.

### Rationale

The API supports product retrieval by barcode and an official JS/TS SDK exists.

The product's business rule remains that barcode identifies a product; current shelf price is contextual.

### Consequence

- remote responses are runtime-validated
- not-found is normal
- manual flow survives provider failure
- provider-specific DTOs never enter the domain

As shipped: a lookup runs only when the shopper taps "Find name online" for a barcode the device does not know. Only the barcode number is sent, with `credentials: "omit"` and no referrer, and only the fields the product shows are requested. Browsers cannot set a custom `User-Agent`, so the app identifies itself with `app_name` and `app_version` query parameters instead of adding a backend. A suggestion only pre-fills an editable name field.

### Revisit when

A better product-identity data source exists for the target market, or API policy makes browser usage impractical.

## D-033 — Shelf OCR provider remains benchmark-gated

Date: 2026-09-21

Status: accepted

### Decision

Do not make a production OCR vendor/library part of core architecture yet.

Keep ShelfPriceScanner provider-agnostic.

Use Tesseract.js in a Web Worker as the first on-device benchmark candidate.

### Rationale

OCR accuracy and latency on real grocery shelf labels are empirical risks.

Locking a heavy OCR library or cloud vendor before mobile benchmarking would be technology-first design.

### Consequence

No OCR production dependency is added until fixture/mobile tests demonstrate useful speed and candidate quality.

Superseded for production by D-055: Tesseract.js 7 became the production price reader by owner decision, behind the provider-neutral `PriceTagReaderPort`, before field evidence existed.

If local OCR fails, cloud OCR can be evaluated behind the same port without changing domain/application code.

### Revisit when

Benchmark data exists.

## D-037 — Run an early scanner benchmark without promoting scanner to the production roadmap

Date: 2026-09-21

Status: accepted

### Decision

After Phase 5 establishes a stable, measured manual baseline, run a small experimental scanner benchmark before Phase 6–8 and the broader real-store beta.

This benchmark may test:

- barcode capture
- shelf-label price capture
- scan -> confirm interaction
- failure/fallback behaviour

It must remain:

- experimental
- optional
- outside the critical product bundle/path
- recoverable immediately to manual entry

Production barcode and OCR implementation remains scheduled for Phase 10/11.

### Rationale

The manual path is the universal baseline, but scanner value is an empirical interaction question.

A scanner could reduce:

- seconds per item
- typing effort
- cognitive fatigue

or it could increase:

- latency
- correction work
- ambiguity
- trust risk

Testing the hypothesis cheaply after the manual baseline exists gives earlier evidence without committing the product to scanner-first architecture.

### Consequence

The roadmap contains an Experimental Scanner Benchmark Gate after Phase 5.

Positive benchmark evidence may justify a scanner cohort in later beta testing.

Negative evidence must simplify/defer scanning rather than trigger more scanner engineering.

D-035 remains authoritative for production feature sequencing: Repeat Trip / Recent Items / Price Memory still precede production scanner breadth.

### Revisit when

The benchmark has representative mobile timing, failure, correction, and repeated-use data.

## D-053 — Production barcode ships ahead of physical evidence, behind kill switches

Date: 2026-09-25

Status: accepted

### Decision

The owner promotes production barcode identification into the public app before the issue #73 physical benchmark has produced evidence.

It ships as an optional accelerator:

- scanning appears only where a secure context and camera access exist; since D-055 barcodes are one mode of the shared in-trip camera;
- `VITE_SHOPPING_BARCODE_SCANNER=0` removes scanning from a build, and `VITE_SHOPPING_PRODUCT_LOOKUP=0` removes only the online lookup; CI reads both from repository variables, so switching off needs no code change;
- manual price entry stays complete and one tap away in every state.

### Rationale

The layered design in ROADMAP section B was already specified. What remained was an owner decision, not missing engineering. A reversible build switch keeps that decision cheap to undo if field use shows the scanner costs more than it saves.

### Consequence

- issue #73 becomes post-release validation: it can still conclude REMEDIATE or DEFER, which means switching scanning off rather than weakening manual entry;
- barcode identity never supplies an authoritative current price (D-004): a remembered price is shown as context and reused only by explicit choice;
- store-printed (restricted circulation) codes and coupons are recognised and routed to manual entry instead of being remembered.

### Revisit when

Issue #73 or real-shopper evidence shows scanning is slower, more error-prone or less trusted than manual entry.

## D-055 — Production price-tag reading ships ahead of field evidence, behind a kill switch

Date: 2026-09-26

Status: accepted

### Decision

The owner promotes shelf-label price reading into the public app before issue #90 has produced field evidence.

It ships as one mode of a shared in-trip camera:

- the trip's scan action opens one camera with Barcode and Price tag modes, and price entry offers "Read price tag" directly;
- Tesseract.js 7 reads the framed tag on the device in a worker; its worker, core and Finnish language files are served by this site under a versioned path, never from a CDN, and the service worker caches them on first use instead of precaching them for every visitor;
- the tallest printed number is ranked as the headline price, superscript cents get a second digits-only read, and the existing exact-money parser still decides what counts as money;
- a read price only pre-fills price entry, marked as read from the tag; the shopper confirms with Add, and every state keeps typing the price one tap away;
- `VITE_SHOPPING_PRICE_OCR=0` removes price reading from a build; CI reads it from a repository variable of the same name.

### Rationale

The harness, parser and engine were already built and measured on fixtures. What remained was an owner decision. Reading a tag reduces typing in the core job while confirmation keeps manual authority, so the risk stays bounded and reversible.

### Consequence

- issue #90 becomes post-release validation: REMEDIATE or DEFER means switching price reading off rather than weakening manual entry;
- read prices are candidates and never become canonical money without confirmation (D-004);
- camera images stay on the device; only engine files are downloaded, from this site;
- the guarded Tesseract experiment kept its own pinned `fin+swe+eng` configuration until D-056 retired it.

### Revisit when

Issue #90 or real-shopper evidence shows reading tags is slower, less accurate or less trusted than typing the price.

## D-056 — Retire the camera benchmarks once the camera features ship

Date: 2026-09-26

Status: accepted

### Decision

The owner retires the guarded camera evidence tools: the barcode benchmark, the paired barcode/manual analyzer, the shelf-label OCR benchmark, the Tesseract experiment, the paired OCR/manual analyzer and the visual-recognition (CLIP) benchmark, together with their tests, CI surfaces and documents. The timing QA, retention beta and cohort analyzer stay.

### Rationale

Production barcode reading (D-053) and price-tag reading (D-055) shipped, and the benchmarks measured other configurations: a native-only barcode reader, multilingual OCR without the production layout pass, and a CLIP model loaded from a remote hub. Evidence from them would not describe what shoppers use. The CLIP benchmark was also the only user of `@huggingface/transformers`, which brought about 480 MB of native and WebAssembly runtimes into every install.

### Consequence

- issues #73 and #90 are answered from the production app with the field log in ROADMAP section A, and still end in keeping or switching off each feature;
- the immutable study baseline `evidence-baseline-2026-09-25-r10` keeps the last published copies of the retired tools;
- production visual recognition (issue #88) is designed for the product itself rather than benchmarked through the retired harness;
- the camera flows have no in-app instrumented timing.

### Revisit when

A camera decision needs quantitative evidence that a field log cannot provide.


## D-057 — Production visual recognition ships as a local-inference optional accelerator

Date: 2026-09-27

Status: accepted

### Decision

The owner promotes visual product recognition into the public app as an optional third mode of the shared camera.

Production recognition:

- is behind the provider-neutral `VisualProductRecognizerPort`;
- uses `@huggingface/transformers` 4.3.0 with the pinned `Xenova/clip-vit-base-patch32` model revision `d15189d7028b43f1d3e65039190477f6af591c2a`;
- prefers WebGPU and falls back to WASM;
- ranks a bounded closed set made from recent Price Memory labels plus common unbarcoded produce;
- keeps captured images and candidate labels on the device;
- downloads the pinned model/runtime only on first explicit use instead of placing it in the critical application shell;
- requires the shopper to choose a candidate and then confirm the current price through the ordinary price-entry path;
- can be removed from a build with `VITE_SHOPPING_VISUAL_RECOGNITION=0`.

Model acquisition is a network dependency on first use. It is not a shopping-state service: no photo, candidate label, price or trip state is sent to the model host.

### Rationale

The owner explicitly requested production visual recognition. The existing camera and manual-price boundaries make it possible to add recognition without granting an ML output authority over money or committed product state.

The retired CLIP benchmark (D-056) was not restored. Only the useful production adapter pattern returns: lazy model loading, pinned identity, local inference, bounded candidate validation, cancellation and human confirmation.

### Consequence

- issue #88 becomes post-release field validation rather than an implementation gate;
- weak recognition evidence must lead to remediation or switching the feature off, not to silent auto-selection;
- Product mode may need a network connection on its first use to acquire the pinned model, while the core shopping flow remains fully usable without it;
- build validation keeps the recognition runtime out of the initial bundle and PWA precache.

### Revisit when

Representative phone/store evidence shows the current CLIP closed-set approach is too slow, too large, or insufficiently accurate for SKU/product identity. The preferred next experiment is bounded reference-image embedding retrieval rather than weakening confirmation.
