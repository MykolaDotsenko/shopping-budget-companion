# Release Specification

## Status

This is the executable contract for the current shopping-budget release.

The original core MVP is implemented. Several post-core capabilities are also implemented and are explicitly listed below.

The installable offline PWA shell, optional barcode identification and optional price-tag reading are **IMPLEMENTED**.

## Core job

A shopper can:

> set a hard per-trip limit, add prices while shopping, always know what remains, correct mistakes quickly, survive reload, finish the trip, and do it without an account or mandatory network service.

## Current release capabilities

### IMPLEMENTED core

- one active trip;
- EUR;
- exact integer-minor money;
- budget;
- optional safety buffer;
- manual price entry;
- quantity;
- projected consequence before commit;
- add/edit/remove;
- one-step Undo;
- reserve and nominal over-budget states;
- active-trip persistence;
- degraded persistence UX;
- reload recovery;
- finish trip, or cancel a trip that has no items without saving it;
- optional actual checkout total, also addable or correctable later from history;
- completed-trip history;
- keyboard/assistive-technology access.

### IMPLEMENTED repeat-use extensions

- Shop again from completed history;
- Recent Items;
- local Price Memory;
- local history deletion;
- independent Price Memory deletion, which also clears remembered barcode names;
- retention/timing evidence tooling that does not own shopping state;
- installable offline application shell with prompt-based updates, and a start-screen install offer (the browser's prompt, or Add to Home Screen steps on Safari for iPhone and iPad before anything is saved there);
- optional barcode identification with local barcode names and tap-only online name lookup;
- optional price-tag reading that pre-fills price entry for confirmation (D-055).

### PLANNED / GATED

- weighted goods;
- discount engine;
- reopening completed trip into active state.

### Not planned (ROADMAP non-goals)

- tax-exclusive pricing mode;
- voice input;
- receipt scan;
- cloud sharing/sync;
- backend/authentication.

[ROADMAP.md](../ROADMAP.md) keeps these outside the active roadmap.

## Functional requirements

### FR-001 — Start trip

Given no active trip, a valid positive EUR budget starts a trip.

Optional safety buffer must satisfy domain rules.

### FR-002 — Remaining-first state

The active screen exposes remaining safe spending as the primary metric.

Supporting context may include nominal remaining, cart total and budget progress.

### FR-003 — Manual price draft

The user can enter a price without supplying product metadata.

Input behaviour follows `MONEY-SPEC.md`.

### FR-004 — Project before commit

A valid draft projects:

- line total;
- cart total;
- nominal remaining;
- safe remaining;
- reserve/over-budget consequence.

Projection does not mutate canonical trip state.

### FR-005 — Add item

Commit creates one valid item and immediately updates the active trip.

Persistence is attempted synchronously through the application boundary.

### FR-006 — Quantity

Quantity is a positive bounded integer and line totals remain exact.

### FR-007 — Edit item

Active item price, quantity and optional label can be corrected.

### FR-008 — Remove item

Active items can be removed.

### FR-009 — Undo

The most recent supported active-trip cart mutation can be undone.

Undo is not full event sourcing.

### FR-010 — Budget / buffer adjustment

The active budget and safety buffer can be changed intentionally.

A change that creates overage remains valid.

### FR-011 — Reserve crossing

If projected cart total crosses the safe limit but not nominal budget, the user sees an explicit reserve consequence before commit.

### FR-012 — Nominal over-budget

If projected cart total exceeds budget, the user sees explicit overage and can intentionally continue.

### FR-013 — Persistence durability

Committed active-trip mutations attempt local persistence promptly.

The UI must not silently represent failed persistence as durable success.

When the browser refuses a write because storage is full, the app says so and, only after the shopper confirms, removes the oldest trips from history to make room, then retries the save.

### FR-014 — Reload recovery

Valid saved active state restores after reload.

Malformed/unsupported data follows the recovery contract rather than being guessed into validity.

No stored-data problem may leave the shopper without a path to shop: an unreadable saved trip offers continue-without-saving and set-aside, and damaged history never blocks starting a trip and can be set aside before finishing.

### FR-015 — Finish trip

Finishing creates a completed trip.

History must become durable before active-trip cleanup.

Failed history persistence must not erase the active trip.

A trip with no items is not finished into history: the shopper can cancel it instead, which removes the saved open trip and returns to the start.

### FR-016 — Completion cleanup failure

If history is durable but active cleanup fails, completion remains durable and the app exposes cleanup-pending/degraded state.

### FR-017 — Actual checkout total

A completed trip may store actual checkout total, entered on the summary or later from its history card.

Derived difference does not rewrite item prices.

### FR-018 — Completed history

History provides enough information to understand prior shopping trips without becoming a general expense dashboard.

### FR-019 — Shop again

A valid completed trip can seed a **new empty active trip** with prior budget/buffer when persistence state is safe.

This is not reopening historical state.

### FR-020 — Price Memory learning

Eligible confirmed observations are learned only after completed history is durable.

### FR-021 — Price Memory reuse

Remembered price remains explicitly remembered and does not become authoritative current price merely through reuse.

### FR-022 — Local data controls

Completed history and Price Memory can be cleared independently according to their persistence contracts.

Clearing Price Memory also clears remembered barcode names; completed history stays.

### FR-023 — No mandatory external service

Current release does not require:

- barcode scanning, online product lookup or OCR;
- AI;
- authentication;
- bank API;
- backend;
- analytics service.

### FR-024 — Accessibility equivalence

The complete core workflow remains achievable through semantic controls and keyboard/assistive technologies.

### FR-025 — Local-first core

Shopping state, manual entry, editing, completion and history do not require a remote business service. After the application shell has been cached, the core flow remains available without network access.

### FR-026 — Continue/reopen after finish

**PLANNED / GATED.**

Historical reopen requires an explicit loss-safe history ↔ active-state transaction and is not current behaviour.

### FR-027 — Barcode identification

**IMPLEMENTED.**

Barcode may identify product context but cannot be treated as authoritative current shelf price by default. Validation and classification rules: [DOMAIN.md](../DOMAIN.md#barcode-identity).

Acceptance:

- a code that fails validation never counts: the camera ignores it, and a typed code gets an explanation of what to fix;
- a code must be read twice within 1.5 s before it counts, and the camera stops as soon as it does;
- a known barcode shows its remembered name and last confirmed price as context; the current price is entered or the remembered price reused by explicit choice;
- an unknown barcode can be named once; the name is remembered on the device for the next scan;
- a store-printed code (for example a weighed item) offers "Read price tag" when price reading is available, "Enter price" or "Scan another"; a coupon or receipt code offers "Scan another" or "Enter price without scanning"; neither is remembered;
- online name lookup runs only on tap and sends the barcode number with the app's name and version, never shopping data;
- camera permission, unsupported browsers, busy cameras and engine failures each explain the problem and offer typing the barcode or entering the price without scanning;
- camera frames never leave the device and are never stored.

### FR-028 — Price tag reading

**IMPLEMENTED.**

The camera can read a shelf price tag on the device and offer candidate prices. A read price is never added without the shopper's confirmation. Candidate and ranking rules: [DOMAIN.md](../DOMAIN.md#shelf-price-reading).

Acceptance:

- the trip's scan action offers Barcode and Price tag modes that share one camera session, and price entry offers "Read price tag";
- reading happens only on an explicit "Read price" tap, on the part of the picture inside the frame;
- up to four candidate prices are offered, best first;
- unit, member, regular and multi-buy prices are labelled;
- choosing a candidate opens price entry pre-filled and marked as read from the tag; the item is added only by the shopper's Add;
- the reader's first use shows its preparation progress; its files come from this site and are cached for offline use;
- no readable price, a slow read, an unavailable reader, a camera without a picture and every camera failure each explain the problem and offer retaking or typing the price;
- camera frames never leave the device and are never stored.

### FR-029 — Installable offline shell

**IMPLEMENTED.**

The public release exposes an installable manifest and Workbox-generated service worker that precaches application-shell assets.

The service worker:

- does not own or mutate canonical shopping state;
- does not generate for guarded QA/beta evidence builds;
- uses prompt-based updates;
- never forces a reload during an active shopping lifecycle.

After a successful online cache/install pass, active-trip and completed-history workflows remain available offline through the existing local persistence contract.

## Canonical state requirements

Canonical active/completed trip data includes only inputs and lifecycle facts required to reconstruct the shopping state.

Derived totals are never storage authority.

Detailed rules: `DOMAIN.md`.

## Money contract

All canonical financial values use integer EUR minor units.

Detailed parser/arithmetic contract: `specs/MONEY-SPEC.md`.

## Price trust contract

Source and confidence remain separate dimensions.

A price reused from Price Memory keeps source `price-memory` and confidence `remembered`. A typed price, and a tag price once the shopper confirms it in price entry, are `manual` + `confirmed`. Detailed rules: [DOMAIN.md](../DOMAIN.md#price-provenance).

## Non-functional requirements

### NFR-001 — Correctness

No canonical binary floating-point money arithmetic.

### NFR-002 — Responsiveness

Core local interactions feel immediate.

### NFR-003 — Reliability

A failed optional subsystem cannot silently corrupt core trip state.

### NFR-004 — Progressive enhancement

Optional capture/visual capabilities never become required for manual core completion.

### NFR-005 — Accessibility

Keyboard, focus, semantics, large text and reduced-motion requirements are release quality.

### NFR-006 — Mobile-first

The primary flow is usable one-handed on compact phone widths.

### NFR-007 — Bundle discipline

The shipped PWA shell must remain small and asset-only. Scanner and price-reader code stay lazily loaded outside the initial bundle; OCR engine files are cached at runtime on first use, never precached.

### NFR-008 — Privacy

Core shopping state is local. Evidence tooling stays content-minimized and separate.

### NFR-009 — Premium quality

The product must feel intentional, polished and distinctive without adding recurring friction or reducing accessibility.

## Acceptance journey

A representative release journey:

1. open with clean storage;
2. start a EUR trip with budget/buffer;
3. add exact prices;
4. observe remaining/reserve consequence;
5. edit/remove/Undo;
6. reload and restore;
7. finish trip;
8. optionally enter actual checkout total;
9. return to history;
10. start another trip;
11. reuse or override a remembered value where available.

The journey must remain clear, fast, durable and accessible.

## Acceptance rule

Current release behaviour is accepted only when:

- applicable domain/spec tests pass;
- persistence/recovery semantics pass;
- component/browser journeys pass;
- accessibility checks pass;
- code/docs agree on implementation status;
- no gated capability is presented as shipped;
- premium polish does not compromise speed or clarity.
