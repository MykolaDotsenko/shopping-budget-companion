# Roadmap

## Purpose

This file describes **current validation gates and future sequencing**.

It is not a chronological implementation diary; git history keeps the completed phase-by-phase plans.

## Current status — 2026-10-01

The core Shopping Budget Companion engineering path is implemented: exact money, the trip domain, local-first persistence and recovery, the remaining-first UI, fast price entry, history, Shop again, Recent Items, Price Memory, data controls and the installable offline shell. Production barcode identification (D-053), visual product recognition (D-057) and price-tag reading (D-055) ship in the shared in-trip camera behind build kill switches. Guarded evidence builds cover timing QA, the retention beta and cohort analysis. [specs/RELEASE-SPEC.md](./specs/RELEASE-SPEC.md) owns the per-capability status.

The representative physical-phone interaction gate was accepted by explicit repository-owner/user attestation on 2026-09-24. The check was reported as responsibly completed with no blocking usability problem.

That attestation closes the manual physical-usability blocker for this validation cycle, but no machine-verifiable timing JSON was retained. Therefore the repository must **not** quote an exact human median/P75/max or claim the <=2.5 s KPI from this cycle.

The core-flow product gate still open is real-shopper retention validation, including second- and third-trip behaviour. Post-release field evidence for the camera features and repository governance are tracked as the other validation gates in section A.

These gates are intentionally stronger than “CI is green”.

## Current priority

### 1. Run the real-store retention beta

Use the guarded beta evidence path defined in:

- [evidence/RETENTION-BETA.md](./evidence/RETENTION-BETA.md)
- [evidence/RETENTION-BETA-PLAYBOOK.md](./evidence/RETENTION-BETA-PLAYBOOK.md)

Primary early signal:

- second-trip rate

Also inspect:

- third-trip behaviour
- manual-entry abandonment
- repeated-item reuse
- current-price override behaviour
- qualitative trust/friction feedback

Do not reinterpret a weak retention result as an automatic request for more features.

## Work allowed while evidence is pending

The repository may continue to receive:

- correctness fixes
- accessibility fixes
- persistence/recovery hardening
- test/CI reliability improvements
- architecture simplification that preserves behaviour
- documentation drift cleanup
- evidence-tool integrity improvements
- small UX fixes that do not invalidate the evidence protocol
- dependency/security maintenance

Avoid broad product expansion that makes the retention result harder to interpret.

## Gate before new breadth

Do not treat the next capability as approved merely because implementation capacity exists.

Before adding a new major user-facing capability, answer:

1. What measured user problem does it solve?
2. Does it reduce shopping friction, increase confidence or improve repeat use?
3. Does it strengthen premium quality or meaningful competitive differentiation?
4. Can the manual/local-first fallback remain complete?
5. Does it preserve exact-money, persistence and accessibility invariants?
6. Is the previous validation gate sufficiently resolved?

## Execution sequence

The active roadmap is intentionally narrow and local-first.

### A. Current validation gates

1. **Repository governance — issue #58**
   - protect `main`;
   - require pull requests and current branches;
   - require the full quality/browser/CodeQL matrix;
   - block force pushes and deletion;
   - automatically remove merged head branches;
   - protect immutable `study/*` source refs;
   - publish new real-world studies from immutable `/study/<baseline>/` Pages surfaces rather than moving guarded URLs.

2. **Real-shopper retention — issue #72**
   - recruit 20–50 real shoppers;
   - preserve one retained beta session per participant;
   - interpret 7/14/30-day retention only when each window has at least 20 eligible participants;
   - use repeat use, abandonment, Price Memory/reuse and trust/friction evidence to decide whether the core flow needs remediation.

3. **Real-store camera validation — issue #88 (post-release validation, D-053/D-055/D-057)**
   - use the field protocol in [evidence/CAMERA-FIELD-VALIDATION.md](./evidence/CAMERA-FIELD-VALIDATION.md);
   - use the production app on representative Android Chrome and iPhone Safari devices in real stores;
   - validate barcode reads across small/curved/glossy/store-printed codes and native-detector fallback;
   - validate Product mode across loose produce, familiar packaged products, same-brand variants, glare, angle, partial occlusion and visually similar packaging;
   - validate price-tag reading across decimal/superscript/member/regular/unit/multi-buy/offer-date cases;
   - log time to human decision, wrong/missing results, manual fallback and notable confusion cases separately for each capability;
   - record an explicit **KEEP / REMEDIATE / DISABLE** decision for barcode, visual recognition and OCR without weakening manual entry or exact-money rules.

A field log is a plain table kept by the facilitator; it holds no photos, no shopping content and nothing from the app's storage. Every decision above stays a human decision, not an automated score.

These gates are not replaceable by automated fixtures or green CI.

### B. Production barcode

**Production status: IMPLEMENTED (owner promotion, D-053). Physical evidence (issue #88): PLANNED / GATED as post-release validation.**

Shipped in these layers:

1. product-identity domain contracts (GTIN parsing, check digits, store codes and coupons);
2. provider-neutral `BarcodeReaderPort` and shared `CameraPort` application ports;
3. native `BarcodeDetector` adapter;
4. lazy self-hosted ZXing WASM fallback (D-031);
5. provider-neutral `ProductLookupPort`;
6. runtime-validated Open Food Facts adapter, used only on tap (D-032);
7. scan → identity candidate → explicit user confirmation;
8. permission/error/manual-fallback UX;
9. release switches `VITE_SHOPPING_BARCODE_SCANNER` and `VITE_SHOPPING_PRODUCT_LOOKUP`, which CI reads from repository variables of the same name.

If the barcode part of issue #88 concludes that scanning must be remediated or withdrawn, switch it off rather than weakening manual entry: set the `VITE_SHOPPING_BARCODE_SCANNER` repository variable to `0`; the next push to `main`, such as the commit recording that outcome here, builds, tests and deploys the app without scanning.

Barcode identifies **product identity only**. It never supplies authoritative current shelf price. Manual current-price entry remains complete and always available.

### C. Visual product recognition

**Production status: IMPLEMENTED (owner promotion, D-057). Physical evidence (issue #88): PLANNED / GATED as post-release validation.**

Shipped as an optional Product mode in the shared camera:

1. provider-neutral `VisualProductRecognizerPort`;
2. Transformers.js 4.3.0 with pinned `Xenova/clip-vit-base-patch32` revision `d15189d7028b43f1d3e65039190477f6af591c2a`;
3. WebGPU first, WASM fallback;
4. bounded closed-set labels capped at 30, with personal recent labels capped first so common unbarcoded produce always retains candidate capacity;
5. transient framed camera capture with local inference; the photo and candidate labels are not uploaded or persisted;
6. up to five ranked candidates presented as relative suggestions without numeric pseudo-confidence, plus an explicit "None of these" path;
7. explicit candidate choice followed by the existing price-entry flow; visual recognition never supplies shelf price or commits an item itself;
8. first-use model acquisition is preceded by a one-time local acknowledgement that the download can be large, and active recognition is abandoned cleanly when the app backgrounds;
9. complete manual fallback for no-match, timeout, model/runtime failure and camera failure;
10. lazy runtime loading and a service-worker runtime cache; the visual engine stays outside the initial bundle and PWA precache;
11. release switch `VITE_SHOPPING_VISUAL_RECOGNITION`, read by CI from a repository variable.

The pinned model is acquired from its model host on first explicit Product-mode use. That is a model-delivery dependency only: shopping state, photos, labels and prices remain local.

If issue #88 concludes that recognition must be remediated or withdrawn, set `VITE_SHOPPING_VISUAL_RECOGNITION=0`. Do not weaken explicit human confirmation or manual entry to improve apparent recognition success.

The current zero-shot approach is best suited to visually meaningful product classes and known labels. Same-brand/SKU-level ambiguity remains a field-evidence risk; if it is material, the preferred next architecture is bounded reference-image embedding retrieval.

### D. Shelf-label OCR

**Production price-tag reading: IMPLEMENTED (owner promotion, D-055). Field evidence (issue #88): PLANNED / GATED as post-release validation.**

Shipped in these layers:

1. geometry-aware exact-money candidate ranking in `domain/shelf-price.ts`;
2. provider-neutral `CameraPort` and `PriceTagReaderPort` application ports;
3. a lazily imported Tesseract.js 7 adapter with a reusable worker, an idle release, cancellation and a 20 s timeout;
4. self-hosted, versioned worker, core and Finnish language files, cached by the service worker on first use;
5. a Price tag mode in the shared camera and "Read price tag" in price entry;
6. candidate choice, then pre-filled price entry that the shopper confirms;
7. release switch `VITE_SHOPPING_PRICE_OCR`, read by CI from a repository variable.

If the price-tag part of issue #88 concludes that price reading must be remediated or withdrawn, switch it off rather than weakening manual entry: set the `VITE_SHOPPING_PRICE_OCR` repository variable to `0`, and the next push to `main` builds, tests and deploys the app without it.

The parser reuses the `parseEurDraft` money contract. It does not invent decimals in bare OCR digits, does not treat percentages or dates as money, and keeps unit-price, member, regular and multi-buy context distinguishable for ranking and human review ([DOMAIN.md](./DOMAIN.md#shelf-price-reading)).

Production price reading preserves:

- OCR output is untrusted transient text;
- parsed prices are candidates, never canonical money;
- ambiguous candidates require explicit user choice;
- user confirmation precedes a ShoppingTrip mutation;
- slow/failing OCR returns cleanly to complete manual entry;
- image/OCR network boundaries remain explicit;
- OCR/model code remains lazy and outside the critical initial bundle.

### E. Evidence-selected advanced pricing

Advanced pricing is not a package to implement wholesale. Add one mechanic at a time only after repeated real-user need.

Candidate order:

1. weighted goods;
2. unit-price comparison;
3. discounts;
4. refundable deposits.

Tax-exclusive consumer pricing is outside the active roadmap unless a concrete use case appears.

Every accepted mechanic requires:

- an exact deterministic money contract;
- property/unit tests before UI;
- persistence compatibility;
- application orchestration;
- focused UX;
- browser/accessibility regression coverage.

### F. Completed-trip reopen — optional

Do not add reopen semantics unless real-user evidence shows recurring need.

If approved, reopening must derive a **new active trip** from immutable completed history. A completed history record must never be mutated back into an active transaction.

### G. Launch / recruiter-grade proof

Build the final case study from verified evidence:

- clear product problem and deliberately narrow scope;
- exact-money architecture;
- loss-safe local persistence;
- offline/PWA reliability;
- accessibility and cross-browser evidence;
- real retention evidence;
- barcode/visual-recognition/OCR go/no-go decisions;
- explicit examples of capabilities deliberately rejected or deferred.

## Explicit product non-goals

The active product is intentionally:

> **local-first · offline-first · account-free · no mandatory network**

Do not add the following to the active roadmap:

- backend/account infrastructure;
- authentication;
- cloud sync;
- shared-shopping collaboration;
- bank-linked personal finance;
- net-worth dashboards;
- investment/bill management;
- AI financial advice;
- retailer loyalty/social-platform breadth.

Optional product-identity acceleration may use narrowly scoped network delivery (Open Food Facts lookup or first-use visual-model acquisition), but network failure must never block the core trip and remote state must never become canonical shopping authority.

Receipt scanning, voice input and a global store-price database are also outside the active execution roadmap until real-user evidence identifies a recurring problem they uniquely solve.

## Technical-debt policy

Fix debt when it creates a real cost in correctness, reviewability, testing or change speed.

Priorities:

1. correctness/data-loss risk
2. duplicated sources of truth
3. unclear ownership between layers
4. files/modules with multiple unrelated reasons to change
5. flaky/slow quality gates
6. stale authoritative documentation
7. cosmetic organization

Do not create abstractions solely to reduce line count.

## AI-development policy

AI-assisted changes should optimise for reasoning efficiency:

- load only task-relevant authoritative context
- inspect current code/tests before trusting status prose
- keep public contracts separate from implementation when that reduces context cost
- update the smallest owning document
- delete completed execution narration; git history keeps it
- avoid duplicating status across multiple docs
- never claim human validation from automation
- make refactors behaviour-preserving unless the task explicitly changes product behaviour

For multi-file changes, prefer one coherent architectural intent per PR.

## Evidence-driven decision rule

A feature is normally allowed into the core product only when it:

- helps a shopper stay under the trip limit before checkout
- reduces interaction cost, increases confidence or improves repeat use
- strengthens premium quality or meaningful differentiation without adding recurring friction
- remains optional when possible
- preserves manual/local-first fallback
- does not weaken data integrity or accessibility

If it fails the first criterion, it normally does not belong in this product.

## When to revise this roadmap

Revise the current roadmap when:

- a validation gate produces new evidence
- a major capability is approved or rejected
- architecture constraints materially change
- user research changes the core job
- a future capability becomes current implementation

When a section becomes historical execution detail, delete it rather than growing this file indefinitely; git history keeps it.
