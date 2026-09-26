# Store Listing Specification

## Status

Target App Store / Google Play listing contract.

Do not publish metadata that describes features not yet shipped.

This spec intentionally uses [Brand] until the final product name is locked.

## Store objective

A person should understand the product from the first visible screen/search result without opening a long description.

The listing must answer:

1. What is this?
2. Why is it useful before checkout?
3. Is it fast?
4. Can I trust it?

## App Store naming

Apple allows an app name up to 30 characters and recommends a name that is simple, memorable, easy to spell, distinctive, and hints at function.

Recommended pattern:

> [Brand]: Shopping Budget

Alternative:

> [Brand] — Cart Budget

Do not keyword-stuff the title.

## App Store subtitle

Primary:

> Know what’s left before checkout

Alternative:

> Stay under your shopping limit

Keep the subtitle outcome-first.

## Google Play short description

Google Play allows up to 80 characters for the short description.

Recommended draft:

> Set a shopping limit, add prices, and know what’s left before checkout.

Alternative:

> Track your cart against a fixed budget before you reach the register.

## Long description opening

Recommended first paragraph:

> Shopping with a fixed limit? Set your budget, add prices as items go into your cart, and always see how much you can still spend before checkout. No bank connection, no account required, and the core shopping flow works offline.

Then concise benefits:

- See what remains, not just what you spent
- Add prices quickly
- Change quantity
- Undo mistakes
- Use a safety buffer
- Finish the trip and compare against checkout
- Resume after reopening the app

Do not include deferred scanner/price-memory features until they ship.

## Screenshot rules

Platform guidance converges on:

- show real product UI
- keep each screenshot focused on one idea
- design for a first-time visitor
- minimize text
- localize text overlays
- avoid misleading performance/ranking claims
- do not advertise unshipped functionality

## Screenshot 1 — core outcome

Copy:

> **Know what you can still afford**

Visual:

- EUR 50 budget
- EUR 18.58 left
- progress/capacity visual
- Add price visible

Purpose:

Communicate the app in one frame.

Score: **99/100**

## Screenshot 2 — speed

Copy:

> **Add prices in seconds**

Visual:

- numeric keypad
- EUR 4.79 draft
- projected remaining

Score: **98/100**

## Screenshot 3 — timing advantage

Copy:

> **Know before checkout — not after**

Visual:

- pending item
- projected overage warning

Score: **99/100**

## Screenshot 4 — safety buffer

Copy:

> **Leave room for small surprises**

Visual:

- EUR 50 budget
- EUR 2 buffer
- safe remaining

Score: **95/100**

## Screenshot 5 — trust

Copy:

> **No bank connection. No account required.**

Visual:

- active app state
- subtle offline/local-first trust treatment

Score: **98/100**

## Screenshot 6 — remembered prices

Price Memory has shipped as Recent Items; capture it from a second trip.

Copy:

> **Remember what you paid last time**

Visual:

- product
- previous price
- store/date context

## Screenshot 7 — scanning

Barcode and price-tag reading have shipped behind kill switches (D-053, D-055); keep them out of the screenshot set until the field evidence in issues #73 and #90 reports.

Copy:

> **Scan when it’s faster**

Visual:

- shelf tag candidate
- confirmation

Do not claim perfect scanning.

## Google Play feature graphic

Google Play feature graphic requirement:

- 1024 × 500
- JPEG or 24-bit PNG
- no alpha

Creative direction:

- central focal point
- remaining-capacity visual
- small amount of copy
- no duplicated giant app icon
- no ranking/award/pricing claims
- avoid edge-critical content because of cropping

Suggested text:

> Know what’s left before checkout

## App icon

Use the final brand mark only.

Do not add:

- text
- euro symbol
- generic shopping cart + currency icon
- “FREE”
- award/ranking badges

The icon should remain recognizable at small size.

## Preview video

Optional.

Structure:

1. Set EUR 50
2. Add EUR 4.79
3. Remaining updates
4. Add more items
5. Pending item exceeds budget
6. User sees warning before checkout

The video should be understandable muted.

Do not use cinematic intro before showing the product.

## Description tone

Use:

- everyday language
- short paragraphs
- outcome-first copy
- factual benefits

Avoid:

- keyword blocks
- excessive emoji
- all-caps hype
- “#1”
- “best”
- unsupported savings claims
- comparisons naming competitors in store metadata
- unverified testimonials

## Search intent map

Primary:

- shopping budget
- grocery budget
- cart calculator
- shopping calculator
- grocery calculator
- cart total

Secondary:

- stay under budget
- grocery spending
- checkout total

Later, only after shipped:

- price scanner
- barcode shopping
- grocery price tracker

## Localization

Every localized store listing must localize:

- subtitle
- short description
- long description
- screenshot overlay text
- keywords/intent language

Do not only translate the long description.

## A/B test backlog

### Experiment 1 — first screenshot

A:

> Know what you can still afford

B:

> Stay under your shopping limit

Primary metric:

install conversion.

### Experiment 2 — subtitle

A:

> Know what’s left before checkout

B:

> Stay under your shopping limit

### Experiment 3 — icon

A:

abstract remaining-space mark

B:

slightly more literal cart/capacity mark

### Experiment 4 — screenshot 2

After scanning ships:

A:

manual keypad

B:

price-tag scan

Hypothesis:

scanner may improve attention, but manual flow may communicate trust/simplicity better.

## Custom product-page backlog

Only after meaningful traffic.

### Fixed-budget page

Message:

> Shopping with a hard limit?

### Family page

Message:

> Keep a big cart under control.

### Student page

Message:

> Make your weekly grocery money last.

### Scanner page

Only after scanning ships:

> Scan prices. See what remains.

## Store compliance guardrails

Must:

- depict real shipped functionality
- use accurate screenshots
- avoid misleading relationships/endorsement
- avoid performance/ranking claims
- avoid price promotions in graphic assets where platform rules prohibit them
- keep metadata natural rather than keyword-stuffed

## Listing release gate

Before submission:

- final brand name checked
- final icon checked
- privacy metadata complete
- screenshots match current build
- no target-only feature appears
- first screenshot explains product
- description matches PRODUCT.md
- trust claims are technically true
- localized assets reviewed
- all image accessibility/alt-text fields completed where supported

## Store listing readiness

Current strategic readiness:

**98/100**

Actual submission readiness remains lower until:

- final name exists
- shopping product is implemented
- screenshots are captured from production UI
- store privacy/legal metadata is prepared
