<p align="center">
  <img src="./public/favicon.svg" alt="" width="72" height="72" />
</p>

<h1 align="center">Shopping Budget Companion</h1>

<p align="center"><strong>Know what you can still spend before you reach the checkout.</strong></p>

<p align="center">
  A local-first shopping budget PWA built for one job: keep your <strong>safe remaining spend</strong> visible while the basket is still changeable.
</p>

<p align="center">
  <code>No account</code> · <code>No bank connection</code> · <code>Offline core flow</code> · <code>On-device camera processing</code>
</p>

<p align="center">
  <a href="https://mykoladotsenko.github.io/shopping-budget-companion/"><strong>Open the app →</strong></a>
  ·
  <a href="https://mykoladotsenko.github.io/shopping-budget-companion/privacy/">Privacy</a>
  ·
  <a href="https://github.com/MykolaDotsenko/shopping-budget-companion/issues/new?template=feedback.yml">Send feedback</a>
</p>

<p align="center">
  <img
    src="docs/assets/shopping-budget-companion.png"
    alt="Shopping Budget Companion active trip showing the remaining shopping budget, cart total and price entry"
    width="390"
  />
</p>

## The decision that matters

The useful number in a supermarket is often not **how much you have spent**.

It is:

> **How much can I still safely put in the basket?**

Shopping Budget Companion keeps that number visible while you can still change the cart.

```text
€50.00 limit − €5.00 safety buffer − €32.40 cart = €12.60 safe remaining
```

Instead of doing that arithmetic repeatedly in your head, you keep seeing **€12.60 left** as you shop.

## 30-second product story

<table>
  <tr>
    <td width="33%">
      <img src="./public/screenshots/entry.jpg" alt="Starting a shopping trip and entering a budget" width="100%" />
    </td>
    <td width="33%">
      <img src="./public/screenshots/trip.jpg" alt="Active shopping trip with remaining budget, cart total and price entry" width="100%" />
    </td>
    <td width="33%">
      <img src="./public/screenshots/summary.jpg" alt="Completed shopping trip with cart summary and receipt reconciliation" width="100%" />
    </td>
  </tr>
  <tr>
    <td align="center"><strong>1. Set the limit</strong></td>
    <td align="center"><strong>2. Shop against it</strong></td>
    <td align="center"><strong>3. Check the receipt</strong></td>
  </tr>
</table>

A price is enough to add an item. Names are optional.

The common path stays deliberately short:

```text
set a limit → add prices → see what remains → correct mistakes → finish → compare with receipt
```

You can edit or remove distracted input, Undo mistakes, change the budget during the trip, finish into local History and optionally enter the actual receipt total.

The next trip can be faster through **Shop again**, **Recent Items** and local **Price Memory**.

## Why this is different

This is not a general finance app with a shopping screen added later. It is purpose-built for the moment **before payment**, when the decision can still change.

| Alternative | Useful for | Gap for this specific job |
| --- | --- | --- |
| **Calculator** | quick arithmetic | no persistent trip, cart correction, history or receipt reconciliation |
| **Notes app** | flexible lists | arithmetic and remaining-budget state stay manual |
| **Typical banking/budget app** | account-level spending overview | usually explains spending after transactions rather than controlling one basket before checkout |
| **Shopping Budget Companion** | pre-checkout shopping control | intentionally focused on one trip and one remaining amount |

The product competes on **remaining-first control, low interaction cost, exact money, correction, local durability and repeat-trip speed** — not on feature count.

## Built for a real shopping aisle

- **Remaining first** — the primary active-trip number is what you can still safely spend.
- **Price first** — item name, barcode and other context stay optional.
- **Correction is cheap** — edit, remove and Undo are normal parts of the flow.
- **No mandatory setup** — no account, bank link or onboarding wall before first value.
- **Offline core** — the installable PWA shell keeps the main budget loop independent of network availability after it has loaded.
- **Repeat use gets easier** — prior trips and remembered prices can reduce repeated work.

## Trust is part of the product

### Money is a domain rule, not a formatting detail

Canonical money is stored as **integer euro cents**.

```text
€3.29 → 329
€12.60 → 1260
€50.00 → 5000
```

Cart totals, remaining amount, safety-buffer calculations, projections and over-budget states are derived from exact canonical values outside React components. Derived totals are not persisted as financial authority.

### Checkout is reconciliation, not a reset

The estimate built in the aisle and the amount charged at checkout are two different facts.

If the estimated cart is **€32.40** and the receipt is **€33.05**, the app reports that you paid **€0.65 more than the estimate**. It does not silently rewrite the prices you entered while shopping.

### Storage failure must not become silent data loss

Stored state is versioned and validated with Zod. The application has explicit persistence and recovery paths instead of assuming browser storage always succeeds.

If completion cannot be saved safely, the active trip stays open rather than pretending it was archived.

### Smart capture can suggest; the shopper decides

Manual price entry always works.

Optional camera helpers can reduce typing:

- **Barcode scanning** — native `BarcodeDetector` when available, with ZXing WASM fallback;
- **Product recognition** — lazy-loaded CLIP suggestions;
- **Shelf-price reading** — Tesseract.js price candidates.

The trust boundary stays explicit:

```text
camera → candidate/context → shopper confirms → canonical price
```

A barcode identifies a product, not a guaranteed current shelf price. OCR and visual recognition remain advisory. Camera frames stay on the device.

## Engineering underneath

```text
features ─────────▶ application ─────────▶ domain
                         ▲                    ▲
        implements ports │                    │ uses
                         └── infrastructure ──┘
```

| Layer | Responsibility |
| --- | --- |
| **Domain** | exact money, trip rules, projections, product-code rules |
| **Application** | use cases, Undo, lifecycle, recovery, persistence ordering |
| **Infrastructure** | browser storage, validation/codecs, camera and recognition adapters |
| **UI** | rendering, drafts, focus, accessibility and interaction feedback |

The state model uses a small TypeScript controller with `useSyncExternalStore`. The architecture protects money, lifecycle and recovery rules rather than making a small app look artificially large.

### Stack

**Product:** React 19 · TypeScript 6 strict · Vite 8 · Zod 4 · CSS Modules · Workbox/PWA · Web Storage · ZXing WASM · Transformers.js/CLIP · Tesseract.js

**Verification:** Vitest · React Testing Library · fast-check · Playwright · axe-core · ESLint · GitHub Actions · dependency/security checks

Browser journeys cover Chromium, Firefox and WebKit, including accessibility, persistence/recovery, localization, multi-tab behaviour and camera-tool flows.

[![Quality](https://github.com/MykolaDotsenko/shopping-budget-companion/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/MykolaDotsenko/shopping-budget-companion/actions/workflows/quality.yml)

## Evidence, not hype

The repository separates automated evidence from human/device validation. It does not present internal targets as measured user outcomes.

Real-store camera evidence and real-shopper second-/third-trip retention remain explicit validation gates rather than marketing claims.

## Run locally

Requirements: Node.js 24 and npm 11.

```bash
git clone https://github.com/MykolaDotsenko/shopping-budget-companion.git
cd shopping-budget-companion
npm ci
npm run dev
```

Full repository checks:

```bash
npm run check
npm run test:e2e
```

## Deeper documentation

- [Product](./docs/PRODUCT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Domain](./docs/DOMAIN.md)
- [Design](./docs/DESIGN.md)
- [Testing](./docs/TESTING.md)
- [Data persistence](./docs/architecture/DATA-PERSISTENCE.md)
- [Decision log](./docs/DECISIONS.md)
- [Security](./SECURITY.md)

## License

MIT — see [LICENSE](./LICENSE).
