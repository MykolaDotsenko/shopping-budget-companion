# Product

## Status

**IMPLEMENTED product direction.**

This document owns the current product job, principles, competitive strategy and decision criteria. Per-capability implementation status lives only in [specs/RELEASE-SPEC.md](./specs/RELEASE-SPEC.md#current-release-capabilities).

## Product thesis

Help a shopper stay under a hard spending limit **before checkout**, while the cart can still change.

Primary promise:

> Set your limit. Add prices. Always know what is left.

The product should answer one question faster and more confidently than general budgeting or grocery apps:

> How much can I still safely spend right now?

## Job to be done

When I shop with a fixed spending limit, help me see what I can still afford as I add items, so I can adjust the cart before checkout instead of discovering a problem at the register.

## Successful user outcome

A shopper can:

1. start a trip in seconds;
2. add prices with minimal interaction;
3. see remaining safe spending without navigation;
4. correct mistakes immediately;
5. survive reload without losing committed state;
6. finish with a credible cart estimate;
7. optionally reconcile against the actual checkout total;
8. return for another trip with less repeated work.

## Product quality bar

The product must be both:

- **exceptionally convenient in a real store**;
- **premium, polished and distinctive enough to feel meaningfully better than a generic calculator**.

Neither goal may be used to excuse harm to the other.

Premium quality comes from precision, hierarchy, feedback, typography, spacing, motion restraint, state design and consistency — not decorative complexity.

## North-star signals

### In-product decision metric

**Remaining safe spending.**

Cart total and progress are supporting information. The primary active-trip metric is what the shopper can still do.

### Product-validation metric

**Second-trip rate**, with third-trip behaviour as an important confidence check.

Real retention evidence outranks feature enthusiasm.

## Product principles

### 1. Remaining beats spent

The active experience answers “what can I still add?” first.

### 2. Speed beats feature count

Frequent interactions must take seconds. A feature that slows the common path must earn that cost with clear user value.

### 3. Price first

A price is enough to add an item. Name, category, barcode, store, photo and notes remain optional unless the chosen workflow needs them.

### 4. Manual entry always works

Manual price entry is the universal baseline and fallback.

### 5. No surprise automation

Remembered, scanned, estimated or externally sourced values are candidates/context until the user confirms the current price where required.

### 6. Local-first core

The core shopping job does not require an account, bank connection, backend or analytics platform.

### 7. Correction is cheap

Undo/edit/remove must be easy because distracted input is expected.

### 8. Complexity must earn its tap

A capability belongs only if it reduces friction, improves confidence, prevents data loss, improves repeat use, or materially strengthens the premium experience without slowing the core job.

### 9. Repeated use gets easier

Shop again, Recent Items and Price Memory exist to reduce recurring work.

### 10. Evidence beats feature race

Weak retention is not an automatic request for OCR, barcode, voice, cloud sync or more screens.

### 11. Premium without friction

Among equally correct and usable solutions, prefer the one with better hierarchy, feedback, polish, consistency and distinctiveness.

Never trade obviousness or speed for visual spectacle.

## Safety buffer

The optional buffer protects uncertainty inside the nominal budget. Safe-limit and over-budget formulas live in [specs/MONEY-SPEC.md](./specs/MONEY-SPEC.md#derived-values).

The UI must distinguish normal, reserve-using and nominal over-budget states without shame.

## Price trust

Price provenance and confidence are separate concepts ([DOMAIN.md](./DOMAIN.md#price-provenance)).

Current combinations:

- manual + confirmed: a typed price, or a price read from a tag once the shopper confirms it in price entry;
- price-memory + remembered: a remembered price reused without re-entry.

Barcode, visual recognition or online product identity may suggest/name the product but never supplies an authoritative current price. Visual candidates require an explicit human choice before normal price entry.

The product must never imply more certainty than it has.

## Competitive strategy

Do not compete by accumulating grocery features.

Compete on:

1. extremely fast price entry;
2. remaining-first decision support;
3. loss-resistant local persistence;
4. easy correction;
5. honest uncertainty;
6. repeat-trip acceleration;
7. zero-friction first use;
8. privacy-friendly local operation;
9. premium visual/interaction quality;
10. a focused, calm, memorable product identity.

A competitor having a feature is not enough reason to copy it.

## What we deliberately are not building

By default, this is not:

- a bank-linked finance app;
- a net-worth or bill dashboard;
- a meal planner;
- a nutrition tracker;
- a grocery delivery app;
- a coupon marketplace;
- a loyalty platform;
- an AI financial adviser;
- a household operating system;
- a social network.

Expansion beyond the pre-checkout budget-control job requires a new product decision.

## Tone

Calm, helpful, precise, optimistic and non-judgmental.

Humour may appear in low-stakes moments, never in money/data-integrity failures.

## Business value

The product helps avoid:

- checkout surprises;
- stressful item removal at the register;
- repeated mental arithmetic;
- accidental breaches of a hard spending cap.

The core workflow should remain useful without monetisation.

Any future monetisation must preserve first value and core trust.

## Success criteria

Internal targets until validated:

- purpose understood from the first screen;
- new trip starts in under ~10 seconds;
- common manual price-only flow targets median <=2.5 seconds in representative one-hand testing, with ~3 seconds or less as a practical release expectation;
- remaining amount requires zero navigation;
- correction is one or very few actions;
- committed state survives reload;
- core workflow needs no account.

Retention interpretation remains a heuristic, not an external benchmark. See `research/PRODUCT-SUCCESS-STRATEGY.md`.

## Product risks

### Input fatigue

Mitigation: price-first entry, auto-cents, repeat-trip acceleration, Price Memory, and optional barcode, visual recognition and price-tag reading, which shipped ahead of physical evidence behind kill switches (D-053, D-057, D-055) and are judged by post-release evidence (issues #73, #88, #90).

### Scanner theatre

Mitigation: judge capture by end-to-end interaction reduction, not technical novelty.

### Scope drift

Mitigation: map every feature to the core job and competitive strategy.

### False precision

Mitigation: explicit provenance/confidence, optional buffer and checkout reconciliation.

### Data loss

Mitigation: persist committed mutations and surface degraded durability.

### Generic utility feel

Mitigation: preserve premium hierarchy, typography, feedback, state design and coherent identity while keeping the workflow obvious.

## Decision rule for future features

Before accepting a meaningful product capability, answer:

1. Does it materially help the shopper stay under the trip limit before checkout?
2. Does it reduce friction, increase confidence or improve repeat use?
3. Does it strengthen premium quality or meaningful differentiation?
4. Can it remain optional where the simplest workflow should stay simple?
5. Does it preserve manual/local-first fallback and accessibility?
6. Does it preserve exact-money and durability invariants?
7. Does it avoid expanding into a different product category?

If the first answer is no, the feature normally does not belong.

If a feature looks premium but adds recurring friction, reject or redesign it.

If a change is frictionless but makes the product generic, improve its presentation/interaction quality without compromising speed.
