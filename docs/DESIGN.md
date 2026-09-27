# Design

## Status

**IMPLEMENTED production design contract.**

The selected direction is **Calm Utility**: premium, precise and distinctive without adding interaction cost.

Historical prototype comparison and research rationale live in [reference/DESIGN-RATIONALE.md](./reference/DESIGN-RATIONALE.md).

Accessibility requirements are refined in [quality/ACCESSIBILITY.md](./quality/ACCESSIBILITY.md).

## Design objective

A shopper should understand, at a glance:

1. how much is safely left;
2. whether the budget is comfortable, using reserve, or exceeded;
3. how to add another price.

Desired emotional impression:

> calm control, not financial anxiety

Desired product impression:

> a small, unusually well-designed tool for one job

## Premium definition

Premium means:

- obvious hierarchy;
- excellent spacing;
- stable numeric typography;
- confident but restrained surfaces;
- polished empty/error/success states;
- fast, purposeful feedback;
- consistent motion;
- coherent light/dark behaviour;
- subtle identity;
- no visual ambiguity.

Premium does **not** mean:

- extra steps;
- hidden controls;
- decorative dashboards;
- glass-on-glass stacks;
- excessive gradients;
- slow hero animations;
- novelty gestures;
- “AI” styling without AI value.

If visual sophistication makes the core action slower or less obvious, it is not premium.

## Design personality

The product should feel:

- modern;
- calm;
- precise;
- warm;
- trustworthy;
- lightly playful;
- premium without looking exclusive.

The default Light/Dark experience should not feel:

- corporate;
- childish;
- gamified;
- alarmist;
- crypto/fintech;
- cyberpunk;
- neon-heavy;
- overloaded;
- aggressively “AI”.

Aurora is the deliberate exception on expression, not on usability: it may use luminous colour, depth and atmospheric effects, but critical money, status, focus and controls must remain calm, legible and structurally identical to the standard shells.

Working phrase:

> **Calm utility with a little delight.**

## Visual hierarchy

### Active trip

Order of importance:

1. remaining / over-budget amount;
2. budget context;
3. capacity/status cue;
4. Add price;
5. cart details;
6. secondary tools.

The remaining amount is the visual anchor.

Cart total supports the decision but must not compete with remaining safe spending.

### Start state

The first screen should make the job and first action obvious without onboarding.

Avoid marketing copy inside the core task.

### Completed state

Show:

- final estimated total;
- optional actual checkout comparison;
- remaining/overage;
- clear Done / Shop again / History actions.

Do not turn completion into a gamified spending celebration.

## Remaining-capacity visual

Use a quiet capacity/status cue that reinforces remaining room.

Requirements:

- readable in bright store conditions;
- understandable without colour alone;
- visually secondary to the numeric remaining amount;
- able to represent normal, reserve and over-budget states;
- stable at large text sizes.

Do not add charts that create another metric to interpret.

## Colour

Use colour by role:

- background/surface;
- primary text;
- secondary text;
- restrained accent;
- semantic reserve/over-budget status;
- focus/interaction states.

Rules:

- accent is not applied to every control;
- semantic meaning is never colour-only;
- normal spending states should not feel alarming;
- dark mode should be genuinely designed, not mechanically inverted;
- light mode must remain strong in bright environments.

## Appearance system

The product has four appearance choices:

- **System** — follows the operating-system light/dark preference;
- **Light** — primary bright-store production shell;
- **Dark** — deliberate low-light production shell, not an inversion;
- **Aurora** — optional expressive showcase shell with the same interaction and information architecture.

Rules:

- appearance is presentation-only and never changes ShoppingTrip, persistence, evidence or money semantics;
- all modes render the same product components rather than theme-specific screen forks;
- semantic design tokens own colour, depth and surfaces;
- switching is immediate and does not reload, remount the trip or reset focus unnecessarily;
- the saved appearance preference is convenience state and failure to store it must never block shopping;
- Light remains the visual calibration baseline for bright grocery environments;
- Aurora may add visual effects only when contrast, reduced-motion behaviour, battery/performance budgets and the remaining-first hierarchy remain intact.

## Aurora calibration

Aurora is an optional expressive shell, not the default production appearance.

Requirements:

- use a deep navy-black canvas with restrained cyan/violet atmospheric gradients;
- keep the remaining amount and all critical money values neutral, high-contrast and free of decorative effects;
- reserve luminous cyan for actions, selected state and controlled emphasis rather than tinting the whole interface;
- at rest, create depth through layered surfaces, subtle glass-like contrast and soft bloom rather than particles or heavy WebGL;
- preserve explicit warning, danger and focus semantics without letting the aurora palette blur state meaning;
- price entry, button geometry, information architecture and shopping semantics stay identical to Light/Dark;
- the explicit Aurora choice must not be overridden by operating-system colour scheme;
- no continuous animation: at rest Aurora is static aurora gradients, neon hairlines on panels and luminous actions and selected states;
- choosing Aurora plays one short ignition, the only showpiece motion in the product: the new look spreads from the tapped control behind a spectrum neon rim, with a brief bloom and a spark burst, and controls flicker on like neon tubes (about 1.5 seconds, then nothing keeps moving);
- the ignition loads on demand only when Aurora is chosen, never runs with reduced motion or on start-up, never covers or delays a shopping action and never touches money values; browsers without View Transitions switch instantly;
- all Aurora effects must degrade gracefully to ordinary dark surfaces if a browser cannot render an effect.

## Dark calibration

Dark is a deliberate low-light shell, not a mechanical inversion of Light.

Requirements:

- use deep graphite/green-black rather than absolute black for the page;
- preserve clear separation between page, panel, raised control and transient overlay surfaces;
- keep primary money values neutral and high-contrast rather than tinting them with the accent;
- use the green accent mainly for actions, positive capacity and focus-supporting emphasis;
- keep secondary text comfortably above WCAG AA contrast on every surface it appears on;
- warning, danger and focus colours must remain independently readable;
- depth should come from restrained surface steps and soft black elevation, not luminous glows;
- native controls must remain in dark colour-scheme;
- System-dark must resolve to the same visual contract as explicit Dark.

## Surface and depth

Prefer simple surfaces and limited elevation.

Use depth only when it clarifies hierarchy, such as:

- modal/sheet separation;
- primary card separation where needed;
- focused transient layers.

Decorative glass/spectral effects are allowed only when they improve hierarchy without reducing text contrast or performance.

## Shape and spacing

Use consistent radius and spacing families.

Frequent controls must remain comfortably tappable.

Mobile page padding should preserve usable width while giving the hero visual breathing room.

Whitespace around the remaining amount is intentional: it improves instant recognition.

## Typography

Money is the most important typographic system.

Requirements:

- tabular numerals where available;
- stable layout as values change;
- responsive size rather than screenshot-specific fixed values;
- strong contrast;
- no decorative typeface for critical financial values;
- hierarchy survives 200% text / large text.

## Primary action

There should normally be one visually dominant action in the active shopping view:

> Add price

Secondary actions must remain discoverable but should not compete with it.

## Price entry

Design goals:

- fast one-hand entry;
- current budget context remains understandable;
- exact projected consequence appears before commit;
- quantity is available without overwhelming the default flow;
- optional item name is directly editable without an extra disclosure tap, while remaining visually subordinate and never required;
- over-budget confirmation is explicit;
- keypad/mode behaviour is predictable;
- after commit, the user returns cleanly to the trip.

Do not require name/category/store before a simple price add.

## Cart items

Each item should support quick recognition and correction.

Show only information useful to the shopping decision.

Unknown/unnamed items are valid; the UI must not imply they are incomplete.

Remembered/estimated/scanned values must remain distinguishable where trust depends on provenance.

## Correction

Edit/remove/Undo should feel immediate and safe.

A correction flow should preserve orientation and restore focus to a sensible trigger.

Do not hide destructive correction behind gesture-only interactions.

## Near-limit and over-budget states

Near-limit:

- increase clarity, not anxiety;
- preserve Add price;
- show remaining/reserve status explicitly.

Over-budget:

- valid state, not error;
- show overage amount clearly;
- allow correction;
- avoid shame language.

## Success and delight

Delight should reward clarity and precision, not spending.

Appropriate:

- subtle confirmation;
- brief number transition;
- polished empty/completion state;
- restrained tactile/visual feedback.

Avoid:

- confetti for spending;
- streaks;
- achievements;
- celebratory overspending cues.

## Motion

Motion is progressive enhancement.

Rules:

- financial mutations happen before decorative animation;
- common actions stay fast;
- frequent press/settle feedback should stay in the 120–180 ms range;
- remaining-value changes may use a brief settle transition only after the new canonical state renders;
- new or restored cart rows may use a short orientation transition; removal must never wait for an exit animation;
- completion may use one short settled reveal, never a celebratory sequence;
- the Aurora ignition is the one deliberate showpiece: it plays only when someone chooses Aurora (see [Aurora calibration](#aurora-calibration));
- no important information exists only in motion;
- reduced motion preserves all meaning and controls and removes decorative animation;
- transitions should help orientation, not demonstrate animation skill.

## Navigation and disclosure

Do not manufacture navigation complexity for sophistication.

Secondary tools belong behind progressive disclosure when they are not part of the immediate aisle decision.

The core active trip should remain one-screen understandable.

## Content design

Use plain action-oriented language.

Prefer:

- “Add price”
- “€12.40 safe to spend”
- “Uses €1.20 of your safety buffer”
- “€2.10 over your limit”

Avoid branded terms for ordinary actions.

Tone remains calm and non-judgmental.

## Responsive strategy

### Mobile

Primary target.

Optimise for:

- 320–430px widths;
- thumb reach;
- software keyboard;
- large text;
- bright store conditions.

### Larger screens

Preserve hierarchy and compactness.

Do not stretch the utility into a dashboard simply because more space exists.

## Accessibility

Release requirements include:

- semantic controls;
- keyboard operation;
- visible focus;
- useful focus restoration;
- accessible names;
- no colour-only meaning;
- reduced motion;
- forced-colour resilience;
- large-text/200% support;
- reliable touch targets.

Accessibility is part of premium quality.

## Design anti-patterns

Do not ship:

- hidden remaining amount;
- scanner-first camera as the default UI;
- tiny icon-only frequent actions;
- multiple competing primary buttons;
- forced dark mode;
- mandatory onboarding;
- full-screen brand splash before first value;
- decorative finance charts;
- low-contrast secondary text;
- placeholder-only labels;
- swipe-only essential actions;
- AI sparkle iconography without AI value.

## Design acceptance

A user-facing change is acceptable when:

### Comprehension
The purpose and current remaining state are obvious.

### Action
The next likely action is visually clear.

### Ergonomics
The common flow remains one-hand friendly and fast.

### Trust
Money, provenance and durability states are honest.

### Premium quality
Spacing, typography, feedback, transitions and states feel intentional and coherent.

### Differentiation
The experience feels more considered than a generic calculator without adding task friction.

### Accessibility
The same job remains achievable with keyboard/assistive technology, large text and reduced motion.

## Review checklist

For a visual PR:

1. Is remaining still the strongest signal?
2. Is Add price still the strongest action?
3. Did we reduce or add recurring friction?
4. Does the result feel more polished without becoming busier?
5. Is the premium value visible in hierarchy, feedback or consistency rather than decoration?
6. Does the change strengthen a reason to prefer this product?
7. Can it be used one-handed?
8. Is uncertainty visible without noise?
9. Are money values stable and easy to scan?
10. Does light mode work in bright conditions?
11. Does dark mode remain intentional?
12. Does reduced motion preserve meaning?
13. Does large text remain usable?
14. Are frequent controls comfortably tappable?
15. Did we add visual complexity without product value?

## Maintenance rule

If usability evidence disproves a design assumption, change the contract.

Do not preserve a design choice because it is fashionable, impressive or already implemented.

The goal is to feel obvious, fast, trustworthy, polished and distinctive in a real store.
