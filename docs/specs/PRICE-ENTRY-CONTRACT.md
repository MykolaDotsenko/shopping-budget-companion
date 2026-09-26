# Price Entry Interaction Contract

## Status

**IMPLEMENTED current interaction contract.**

Money grammar is owned by [MONEY-SPEC.md](./MONEY-SPEC.md). This document owns only the user interaction around entering an item price.

## Goals

The common add-price flow must be:

- fast one-handed;
- exact;
- predictable;
- easy to correct;
- usable without a product label;
- explicit about projected budget consequence.

## Modes

The UI supports the current money-draft modes implemented by the price-entry draft model: decimal ("Euros"), the default, and auto-cents ("Cents mode"). Price entry opens in the mode the shopper chose last (a convenience preference), and while the draft is empty the status line explains the current mode.

### Decimal mode

Examples:

```text
4.79
4,79
```

Rules follow MONEY-SPEC.

### Auto-cents mode

Digit entry represents cents according to the implemented draft rules.

The mode is explicit and must not silently change while a non-empty draft is being edited.

## Draft states

### Empty

No committed price candidate.

UI may prompt the user to start entering a price.

### Incomplete

Syntactically unfinished input that may become valid with more input.

Do not show a destructive error prematurely.

### Valid

Parser succeeds and item-context rules allow the value.

The UI may calculate projected line/cart/remaining state.

### Invalid

Show concise corrective feedback.

Do not mutate the active trip.

## Item-context rule

A parser-valid money amount is not automatically a valid item price.

Current item price must be greater than zero and satisfy product bounds.

This rule lives above the generic parser rather than changing parser semantics.

## Keypad

The custom keypad must:

- provide digits;
- provide decimal separator where the active mode permits it;
- provide backspace;
- keep frequent targets comfortably tappable;
- preserve mode predictability;
- avoid accidental duplicate commits.

The keypad is presentation/input infrastructure, not a second money parser.

## Native input / paste

Where native input or paste is available:

- pass raw text through the same money draft/parser contract;
- do not add an alternate parsing implementation;
- preserve locale/separator rules from MONEY-SPEC.

## Quantity

Quantity is optional interaction beyond the default quantity of 1.

Changes must:

- respect domain bounds;
- update projected line/cart consequences before commit;
- never introduce floating-point financial arithmetic.

## Optional label

Item label is optional.

The user must be able to add a price without naming the item.

If a remembered-item/current-price flow pre-fills a label, the label must remain editable according to the feature contract.

When entry opens with a label ("Enter current price" on a remembered item, a scanned product, or a label carried through the camera), it shows "Current price for <label>".

## Pre-filled price

**IMPLEMENTED (D-055).**

Where price-tag reading is available, entry offers "Read price tag". It opens the camera's Price tag mode with the label and quantity entered so far; returning from the camera keeps both.

Choosing a read price opens entry with:

- the amount as a decimal ("Euros") draft, for example `4.29`, so the mode stays locked until the draft is cleared;
- the note "Read from the price tag. Check it matches the shelf." beside the valid amount, shown only while the amount still matches what was read, so editing it removes the note.

The price commits only through the shopper's Add, like a typed price, and is recorded as manual + confirmed.

## Projection

For a valid draft, show the consequence before commit when useful:

- line total;
- safe remaining;
- nominal remaining;
- reserve use;
- nominal overage.

Reserve use is the part of the safety buffer consumed by **this line alone**: the overlap between the line and the band from the safe limit to the nominal budget. When the cart is already inside the buffer, the preview must not attribute earlier buffer use to the new item. The domain projection (`safetyBufferUseMinor`) owns this arithmetic; presentation only formats it.

Projection never mutates canonical state.

## Over-budget confirmation

Crossing nominal budget requires an explicit intentional commit path.

The UI must show the overage clearly and allow cancel/correction.

Over-budget is a valid domain state, not an error condition.

## Commit

A successful Add action:

1. submits a validated intent to the application controller;
2. creates/persists the item through normal application/domain rules;
3. closes the entry surface when the command succeeds;
4. provides clear feedback;
5. returns focus/orientation sensibly.

The entry component must not directly mutate canonical trip state.

## Failure

If application commit fails:

- keep enough user context to recover/retry;
- do not falsely show the item as durably added;
- preserve persistence/degraded semantics from application state.

## Accessibility

Requirements:

- labelled input;
- semantic buttons;
- predictable focus;
- keyboard-equivalent completion;
- no colour-only validation;
- large touch targets for frequent keys;
- large-text support;
- reduced-motion equivalence;
- projected consequence readable by assistive technology where relevant.

## Premium quality

The surface should feel precise and deliberate through:

- stable numeric typography;
- clear hierarchy;
- responsive key feedback;
- good spacing;
- polished validation/confirmation states.

Do not add decorative motion or visual treatment that slows entry.

## Acceptance checklist

- Same parser as the domain money boundary?
- Price can be added without metadata?
- Mode never changes unexpectedly?
- A pre-filled price is marked until edited and commits only through Add?
- Invalid input cannot commit?
- Quantity projection remains exact?
- Reserve/overage consequence appears before intentional commit?
- Keyboard and touch paths both work?
- Focus returns sensibly after cancel/commit?
- Interaction remains fast and visually polished?
