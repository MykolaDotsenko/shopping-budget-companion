# Accessibility Contract

## Status

**IMPLEMENTED current accessibility contract.**

Accessibility is part of release quality and premium product quality, not post-release polish.

This contract covers the current product, including the offline shell and optional camera scanning. Requirements for capabilities that have not shipped live in [../reference/FUTURE-QUALITY-PLANS.md](../reference/FUTURE-QUALITY-PLANS.md).

## Goal

Equivalent completion of the core job under:

- keyboard-only use;
- screen reader;
- low vision / forced colours;
- large text;
- reduced motion;
- motor constraints;
- compact mobile viewport;
- one-handed distracted use.

Zero axe violations alone are not sufficient.

## Critical flow

Accessibility coverage prioritises:

1. start trip;
2. understand remaining amount;
3. add price;
4. change quantity;
5. edit/remove/Undo;
6. understand reserve/over-budget consequence;
7. adjust budget/buffer;
8. finish trip;
9. completed summary/history;
10. repeat-trip/remembered-price actions.

## Touch targets

Frequent controls should meet the product target of at least 48 × 48 CSS px where practical.

Includes:

- Add price;
- keypad keys;
- quantity controls;
- Undo;
- edit/remove triggers;
- warning actions;
- finish trip.

Do not rely on tiny icon-only hit areas.

## One-handed use

Frequent actions should remain comfortably reachable on compact phone layouts.

Avoid repeated top-corner reach during active shopping.

One-hand ergonomics is both usability and accessibility.

## Keyboard

Every core action must be keyboard-operable.

Requirements:

- logical tab order;
- visible focus;
- semantic button activation;
- no traps;
- Escape closes non-destructive overlays where appropriate;
- focus returns to a meaningful control after overlay close.

Avoid custom keyboard shortcuts that conflict with normal form interaction.

## Focus management

Opening a primary interaction surface should focus the first meaningful control when appropriate.

Closing/cancelling should restore focus to:

- Add price;
- relevant item edit trigger;
- budget/finish trigger;
- another stable contextual control.

After destructive state changes, focus must not disappear.

When a notice or recovery surface resolves, focus lands on its announced outcome, or on the next screen's heading when the surface itself closes.

A two-step confirmation (for example setting damaged history aside) keeps focus on the control that armed it, so a double tap arms and cancels rather than confirms. The explanation, naming the confirming action, is announced from a live region that exists before it fills. A control whose name changes between steps is not marked as a disclosure (`aria-expanded`).

## Semantic information hierarchy

Critical numbers need semantic meaning.

A visually dominant value such as:

> €18.58

must have accessible meaning equivalent to:

> Safe remaining: 18 euros and 58 cents

or:

> Remaining budget: 18 euros and 58 cents

according to the active buffer context.

Do not expose important money as an unlabeled number.

## Live announcements

Announce committed consequences, not every visual animation frame.

Useful example:

> €4.79 added. €13.79 remaining.

Avoid duplicate announcements from multiple status regions.

Do not announce every keypad digit beyond normal control/input behaviour.

## Currency speech

Currency output must remain understandable to assistive technology.

Visual symbols may be accompanied by clearer accessible labels where needed.

The current product is EUR-only, but formatting should not block future explicit currency extension.

## Colour and contrast

No state is colour-only.

Reserve/over-budget states require text meaning in addition to colour/shape.

Meet WCAG AA contrast for critical text/controls.

Decorative translucency/gradients must never reduce financial-text readability.

## Forced colours

Core workflow remains understandable when system/browser colours override styling.

Verify:

- remaining amount;
- capacity/status cue;
- Add action;
- keypad;
- warning/over-budget state;
- item actions;
- focus indicator.

Decorative effects may disappear without losing meaning.

## Reduced motion

Respect `prefers-reduced-motion`.

Reduced-motion mode must:

- preserve all state changes;
- remove unnecessary large/looping motion;
- keep immediate static feedback;
- never change financial mutation semantics.

A commit must never depend on animation completion.

## Text scaling

At 200% / large text:

- remaining amount stays visible;
- Add price remains reachable;
- no horizontal scroll for the core page;
- keypad remains usable;
- warnings/actions do not overlap;
- item rows may grow vertically;
- secondary content may reflow rather than shrink below legibility.

Avoid fixed heights that assume default text size.

## Compact viewport

Support at least:

- ~320px-class width;
- ~390px-class modern phone width.

Prefer vertical reflow over shrinking touch targets.

## Price entry

Custom keypad/native input path must preserve:

- semantic controls;
- accessible labels;
- large targets;
- clear current value;
- backspace label;
- explicit Add;
- predictable draft mode;
- keyboard-equivalent completion.

A custom keypad must not remove native keyboard accessibility without replacement.

## Quantity

Increase/decrease controls need meaningful accessible names.

Use item label context when available.

For unlabeled items, avoid overly verbose/repetitive speech while still making target identity clear enough.

## Item actions

Edit/remove cannot exist only as swipe gestures.

Visible/focusable alternatives are required.

Undo feedback should be discoverable and announced appropriately.

## Warnings / confirmation

Over-budget confirmation must:

- state exact consequence;
- provide explicit actions;
- manage focus correctly;
- remain dismissible/correctable without precision gestures.

Example:

> This item puts you €3.41 over your limit.

Actions:

- Add anyway;
- Cancel/edit.

## Safety-buffer communication

When safe remaining is primary, label it explicitly.

Do not make assistive-technology users hear a different conceptual metric from the visual hierarchy.

Nominal remaining may be secondary context.

## Price provenance / uncertainty

Remembered values must expose that status semantically, not only visually.

Useful accessible context:

> €1.39, remembered price, last observed 8 days ago

where that data exists.

Do not imply currentness through iconography alone.

## Camera scanning

Scanning is optional; "Add price" stays the primary action and manual entry is reachable from every scan state.

- every action is a text-labelled button and every field has a visible label; the Barcode / Product / Price tag mode switch and the light toggle expose `aria-pressed`;
- the scan status is an always-present polite live region (what to point at, hints after 8 s, first-time preparation progress, how many prices were found);
- a determinate progress bar reports price reader preparation; indeterminate progress reports price reading and visual recognition;
- price candidates are large buttons whose names include the amount and context; visual candidates are large labelled buttons that expose the product label and ranked match score;
- a price read from a tag stays marked as such in price entry until the shopper changes it;
- the surface focuses its heading on open, the result or failure heading when one appears, and the digit field when typing a barcode; closing returns focus to the scan action, or to price entry when the camera was opened from there;
- Escape closes the surface from anywhere in it;
- a blocked, missing or busy camera explains the cause and offers typing the price instead, and in Barcode mode typing the barcode digits;
- a successful barcode read vibrates briefly where supported; every result is announced; the scanning line does not animate with reduced motion, and the frame keeps a visible border in forced colours;
- the camera preview is labelled; no action depends on seeing it.

## Persistence / recovery errors

Errors must be:

- stated in text;
- associated with the relevant scope;
- announced when they materially change durability/recovery;
- recoverable without losing current entered data where possible.

Persistence failure should be announced clearly, not repeatedly on every render.

## Semantic structure

Prefer native HTML semantics.

Use:

- one main landmark;
- meaningful heading hierarchy;
- form labels;
- buttons for actions;
- lists for cart/history where appropriate;
- status/output semantics only when they improve meaning.

Do not add ARIA when native semantics already solve the problem.

## Capacity visual

If the budget capacity cue is meaningful, expose equivalent text/numeric context.

Screen-reader users must not need to navigate decorative SVG/canvas content to understand remaining/overage.

## Automated checks

Cover representative states with axe/semantic assertions:

- start;
- active trip;
- price entry;
- item correction;
- budget adjustment;
- over-budget review;
- finish confirmation;
- completed summary;
- history;
- recovery and history repair;
- camera barcode result, visual product candidates and price candidates.

Also test focus restoration, keyboard journeys, committed announcements and disabled-state semantics where automation is reliable. The axe scans run once, in Chromium; the focus and keyboard journeys run in Chromium, Firefox and WebKit.

## Manual checks

For meaningful UI releases, verify:

- keyboard-only flow;
- VoiceOver/TalkBack or equivalent spot-check;
- 200% / large text;
- reduced motion;
- forced colours/high contrast where available;
- compact viewport;
- touch targets;
- one-hand/bright-store physical usability when the evidence gate calls for it.

Automation cannot prove spoken-order quality or physical ergonomics.

## Acceptance

The current core shopping job must be completable without relying on:

- colour perception;
- precise pointer input;
- animation;
- default text size;
- camera;
- a mandatory external network service.

Manual price entry is the accessibility baseline.

## Premium accessibility rule

A premium interface is not premium if:

- focus is lost;
- text truncates at large sizes;
- contrast is weak;
- motion cannot be reduced;
- important states are icon/colour-only;
- tap targets are tiny.

Accessibility quality is part of perceived product quality.

## Review checklist

- Can the action be reached by keyboard?
- Is the accessible name meaningful?
- Is state expressed in text as well as colour?
- Does focus return predictably?
- Does large text preserve the task?
- Does reduced motion preserve feedback?
- Is the critical money value labelled by meaning?
- Can errors be corrected without precision gestures?
- Are repeated announcements concise?
- Does premium styling preserve contrast/clarity?
