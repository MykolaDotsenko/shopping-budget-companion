# UX Reference

## Status

**SUPPORTING REFERENCE.**

Current product/design contracts live in [../PRODUCT.md](../PRODUCT.md) and [../DESIGN.md](../DESIGN.md). This file preserves practical interaction heuristics and edge cases that are useful during UI work.

If wording conflicts, authoritative current contracts win.

## UX north star

A distracted shopper holding a basket should understand the budget situation and next action almost immediately.

Optimise for:

- recognition over recall;
- one-hand use;
- low typing burden;
- cheap correction;
- stable context;
- trustworthy feedback.

## First use

The first screen should let a new user start without onboarding.

Required understanding:

- what the app does;
- what value to enter;
- how to begin.

Avoid:

- account creation;
- feature tour;
- marketing carousel;
- permission prompts unrelated to immediate value.

## Active trip

The hierarchy should answer:

1. what is safely left?
2. what is the nominal context?
3. what action adds another price?
4. what was already added?
5. what secondary tools are available?

Do not make cart total more visually dominant than remaining safe spending.

## One-hand ergonomics

Frequent controls should be:

- thumb reachable where practical;
- at least the product touch-target standard;
- separated enough to avoid accidental taps;
- usable with software keyboard visible.

Do not put essential controls behind swipe-only gestures.

## Manual price entry

Manual entry is the baseline.

The fastest path should normally be:

```text
Add price → enter price → Add
```

Optional quantity/label should not obstruct this path.

Detailed interaction contract: [../specs/PRICE-ENTRY-CONTRACT.md](../specs/PRICE-ENTRY-CONTRACT.md).

## Correction

Distracted mistakes are normal.

Prioritise:

- Undo for the latest supported mutation;
- direct edit;
- direct remove;
- clear feedback after correction;
- sensible focus restoration.

Avoid confirmation dialogs for ordinary reversible edits.

## Safety buffer

The buffer should feel like protected room, not a second confusing budget.

When entering reserve:

- explain the consequence;
- avoid alarmist copy;
- keep nominal remaining understandable.

## Over-budget

Over-budget is valid.

The UI should:

- show exact overage;
- preserve correction;
- avoid shame;
- allow intentional continuation where the contract permits it.

## Remembered prices

A remembered value accelerates repeat use but is not current shelf truth.

Useful UI context may include:

- label;
- remembered amount;
- freshness;
- store context where available.

Always preserve an explicit current-price path.

## Recent Items

Recent Items should reduce repeated identification/typing.

Items are ordered by when they were last bought or last seen at a price, so the weekly basket stays at the top even when its prices are reused rather than retyped; reuse never makes a remembered price look freshly seen. Four show by default, the rest behind Show all, and items already in this cart are marked.

Do not turn it into a catalogue-management feature.

## Shop again

Shop again creates a fresh empty trip using appropriate prior spending-plan context.

It is not historical reopen.

Make the distinction clear in UI/copy.

## History

History is lightweight context, not expense analytics.

Prioritise:

- date/time;
- budget;
- estimated total;
- actual total if entered;
- remaining/overage;
- item count;
- repeat-trip action.

Avoid finance-dashboard expansion.

## Checkout reconciliation

Actual checkout is optional.

Its purpose is:

- confidence;
- discrepancy visibility;
- future evidence for product improvement.

Do not turn reconciliation into bookkeeping.

## Persistence degradation

A durability failure must be understandable without technical jargon.

The UI should communicate:

- current trip is still visible;
- saving/reload safety needs attention;
- retry/recovery action when meaningful.

Avoid implying data is safely stored when it is not.

## Recovery

Recovery UI should:

- explain that saved data could not be trusted/read;
- avoid silently discarding raw state;
- offer only actions that are safe under the persistence contract.

## Empty states

Keep them useful and restrained.

Examples:

- no active trip → start;
- empty cart → Add price;
- no history → explain briefly, not as marketing;
- no memories → nothing special required in core flow.

## Loading

Core local actions should not need loading states.

Async optional capability loading must never block manual shopping.

## Offline / network

The app is local-first. After one online visit, the installed shell opens offline with the active trip and history.

Optional network features, such as the tap-only Open Food Facts lookup, say when they are unavailable and fall back to manual entry.

## Motion

Use motion to preserve orientation and communicate consequence.

Avoid:

- delayed commits;
- long celebratory transitions;
- motion-only state changes;
- animation that blocks correction.

## Tone

Prefer factual, calm copy. Avoid moral judgement or panic language.

Copy examples live in [Content design](../DESIGN.md#content-design) in DESIGN.md.

## Performance perception

Users should feel that:

- Add reacts immediately;
- Undo is immediate;
- sheets/overlays open without lag;
- totals update without visible jitter;
- optional async features do not stall local actions.

Premium quality includes responsiveness.

## Common edge cases

### Keyboard remains open

Important budget context and commit/cancel controls should remain reachable.

### Large text

Avoid layouts that assume one-line financial labels.

### Very long label

Truncate/wrap without displacing the primary money hierarchy.

### Empty label

Valid item.

### Repeated item

Do not silently merge unless the product explicitly defines that behaviour.

### Budget reduced below cart total

Show valid over-budget state.

### Buffer greater than new budget

Require explicit correction rather than silently rewriting user intent.

### Price-memory current-price override

Preserve item identity/label where useful but treat newly confirmed current price as a new observation only according to domain rules.

## UI review questions

- Is remaining obvious?
- Is next action obvious?
- Did this change remove or add recurring work?
- Can a distracted user undo/correct safely?
- Is remembered/uncertain data honest?
- Is the UI still one-hand friendly?
- Does premium polish improve perceived quality without adding cognitive load?
- Does this interaction create a reason to prefer the product over a calculator?
