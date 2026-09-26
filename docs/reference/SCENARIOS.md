# Scenario Reference

## Status

**SUPPORTING REFERENCE.**

This file is a compact scenario matrix for product/UX/test reasoning. Current behaviour is owned by the authoritative contracts and executable tests.

Use scenarios to challenge a proposed change, not to infer that every listed future capability is shipped.

## Scenario rules

Across all scenarios:

1. preserve entered/committed user data;
2. keep remaining safe spending understandable;
3. make correction cheap;
4. prefer Undo over unnecessary confirmation for reversible actions;
5. optional intelligence never blocks the manual core;
6. uncertainty is explicit data;
7. local interactions feel immediate;
8. user owns the spending limit;
9. premium polish never adds recurring friction;
10. implementation complexity follows demonstrated scenario value.

## Tier 0 — current core must be excellent

### Start / restore

- **First launch with hard budget** — purpose and start action are obvious.
- **Return with no active trip** — prior history/memories do not obstruct a clean new start.
- **Resume interrupted active trip** — committed state restores accurately.
- **Malformed saved active state** — safe recovery, no guessed financial data.

### Manual entry

- **Basic price add** — fast, exact, label optional.
- **Rapid consecutive adds** — no duplicate/missed commits; remaining updates immediately.
- **Typo before commit** — easy clear/backspace/edit.
- **Typo after commit** — edit/Undo without restarting.
- **Quantity > 1** — exact line total and projection.
- **Optional label** — empty label remains valid.

### Budget consequences

- **Comfortable budget** — remaining-first state is calm and obvious.
- **Cross safety buffer** — reserve use is explicit without panic.
- **Cross nominal limit** — exact overage is shown before intentional commit.
- **Remain over budget intentionally** — valid state; correction remains available.
- **Budget edited below cart total** — valid over-budget state.
- **Buffer changed** — derived safe remaining updates exactly.

### Reliability

- **Storage write fails mid-trip** — visible degraded durability.
- **Browser storage is full** — the cause is named; the oldest trips can be removed to make room, only after confirmation, even mid-trip.
- **Reload after successful mutation** — state restores.
- **History write fails during finish** — active trip is not erased.
- **Active clear fails after history succeeds** — completion remains durable; cleanup pending is exposed.
- **Stale active copy after completed history exists** — startup reconciles safely.

### Completion / repeat

- **Finish trip** — durable completion before active cleanup.
- **Started a trip by mistake** — an empty trip can be cancelled without a €0 history entry.
- **Actual checkout nearly matches** — optional reconciliation is clear.
- **Actual checkout differs** — difference is visible without rewriting items.
- **Receipt total forgotten or mistyped** — it can be added or corrected later from history.
- **View history** — enough context, no finance-dashboard scope.
- **Shop again** — fresh empty trip using prior spending-plan context.
- **Price Memory reuse** — remembered value remains clearly remembered.
- **Enter current price from memory** — current observation path stays explicit.

### Accessibility / device

- **Keyboard-only core flow** — start/add/edit/finish works.
- **Screen-reader core flow** — critical money/status/action hierarchy is understandable.
- **200% / large text** — no loss of core controls or financial meaning.
- **Reduced motion** — same behaviour/information.
- **Forced colours / colour-vision variation** — no colour-only semantics.
- **One-hand distracted use** — common actions are reachable and obvious.
- **Compact phone width** — no critical clipping/hidden actions.

## Tier 1 — current/repeat-use quality should be strong

- **Duplicate/repeated item** — no surprising silent merge.
- **Recent Items reuse** — less typing/identification than manual-from-scratch.
- **Remembered value is stale** — freshness/context prevents false confidence.
- **History deletion** — explicit and independent from Price Memory.
- **Price Memory deletion** — explicit and independent from history.
- **Persistence retry succeeds** — degraded status clears correctly.
- **Long item label** — does not break money hierarchy.
- **Empty history/memory** — restrained empty states.
- **Dark/light appearance** — both feel intentional and premium.
- **Bright store condition** — primary financial information remains legible.

## Tier 1b — shipped optional capabilities

These capabilities are **IMPLEMENTED**. None of them is required to complete the manual core.

### Installable PWA

**IMPLEMENTED** (FR-029). Install, precache and offline restore are covered by `e2e/pwa.spec.js`.

- install offered on the start screen, never mid-trip; on Safari for iPhone only before anything is saved there;
- offline launch after prior cache/install;
- update while active trip exists;
- service-worker failure without business-state loss.

### Barcode

**IMPLEMENTED.** Covered by `tests/ScanSurface.test.tsx`, `tests/ScanFlow.test.tsx`, `tests/shopping-app-barcode.test.ts` and `e2e/barcode-scanner.spec.js`.

- known barcode + remembered context;
- known barcode with no current price;
- unknown barcode;
- provider/network unavailable;
- camera permission denied;
- encoded/variable-measure codes.

Key rule: identity is not authoritative current shelf price.

### Price tag reading

**IMPLEMENTED.** Covered by `tests/shelf-price.test.ts`, `tests/price-ocr.test.ts`, `tests/ScanSurface.test.tsx`, `tests/ScanFlow.test.tsx` and `e2e/price-tag-scanner.spec.js`.

- one clear price, with or without a euro sign;
- superscript cents;
- multiple plausible prices;
- loyalty/member and regular price ambiguity;
- unit price vs product price;
- multi-buy offer vs single-item price;
- no readable price, slow reading, reader unavailable;
- reading the current price for a scanned product;
- returning from the camera to price entry with its name and quantity.

Key rule: a read price is a candidate until the shopper confirms it.

Key rule: OCR is candidate capture; correction cost must beat manual entry.

## Tier 2 — planned/gated scenarios

These scenarios are useful for future design but do **not** represent current shipped capability.

### Store context

- **Store context differs** — ranking/context must not imply universal price truth.

No current flow records a store, so this cannot happen today.

### Advanced pricing

- multi-buy discount;
- weighted item;
- deposit/extra charge.

Do not implement until exact-money/rounding semantics are explicit.

Not planned (ROADMAP non-goal): tax-exclusive context.

### Multi-device / concurrency

- multiple tabs edit same trip.

No silent merge without an explicit ownership/conflict contract.

Not planned (ROADMAP non-goals): cloud sync conflict; stale remote overwrite.

## Meta-scenario — smart feature is worse than manual

For every “smart” capability, compare:

```text
time + taps + waiting + correction + failure recovery
```

against the stable manual baseline.

If the smart path is slower, less trustworthy or harder to correct for the target use case, it should remain optional, be redesigned, or not ship.

## Scenario prioritisation

Use this order:

1. money/data-loss risk;
2. common aisle frequency;
3. correction/recovery cost;
4. repeat-use friction;
5. accessibility/device risk;
6. premium/differentiation value;
7. optional future breadth.

Do not prioritise a rare impressive scenario above a frequent manual-flow problem.

## Release challenge questions

Before a meaningful release/change:

- Can a first-time user start without explanation?
- Can the common item be added quickly with one hand?
- Is remaining safe spending always obvious?
- Can mistakes be corrected immediately?
- Can a storage failure mislead the user?
- Can completion lose the active trip?
- Are remembered values honest about currentness?
- Does repeat use become materially easier?
- Does premium polish improve clarity/quality rather than add noise?
- Does the product feel meaningfully better than a generic calculator?
