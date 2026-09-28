# Shopping Budget Companion

**Know what you can still spend before you reach the checkout.**

[**Open the app →**](https://mykoladotsenko.github.io/shopping-budget-companion/) ·
[Privacy](https://mykoladotsenko.github.io/shopping-budget-companion/privacy/) ·
[Send feedback](https://github.com/MykolaDotsenko/shopping-budget-companion/issues/new?template=feedback.yml)

<p align="center">
  <img
    src="docs/assets/shopping-budget-companion.png"
    alt="Shopping Budget Companion active trip showing the remaining shopping budget, cart total and price entry"
    width="390"
  />
</p>

The useful number in a supermarket is often not **how much you have spent**.

It is:

> **How much can I still safely put in the basket?**

Shopping Budget Companion keeps that number visible while the cart is still changeable.

```text
set a limit → add prices while shopping → see what remains → correct mistakes → finish → compare with the receipt
```

## A normal shopping trip

Imagine you want to keep tonight's shop under **€50**.

You set a €50 limit and keep a **€5 safety buffer** because the final total may not match your mental estimate exactly.

Your basket reaches **€32.40**.

The app does not make you calculate:

```text
€50.00 budget
− €5.00 reserve
− €32.40 cart
= €12.60 safe remaining
```

It simply keeps **€12.60 left** in front of you while you are still walking through the store.

If you type €4.29 instead of €3.29, edit it.  
If you add the wrong item, remove it and Undo if needed.  
If the budget changes, update it during the trip.

At checkout, suppose the receipt is **€33.05**. Add the real receipt total and the app tells you that you paid **€0.65 more than the cart estimate** without rewriting the prices you entered while shopping.

That is the whole job: make the spending decision **before checkout**, then make the estimate auditable afterwards.

## Three moments, one flow

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
    <td align="center"><strong>Set the limit</strong></td>
    <td align="center"><strong>Shop against it</strong></td>
    <td align="center"><strong>Check the receipt</strong></td>
  </tr>
</table>

## The product stays out of the way

A price is enough to add an item. Product names are optional.

The common path stays short:

- start from a preset or custom budget;
- optionally reserve part of that budget as a safety buffer;
- enter prices as items go into the cart;
- always see remaining safe spending;
- edit, remove or Undo distracted input;
- finish the trip and save it to local History;
- optionally enter the receipt total;
- shop again with the previous budget;
- reuse remembered item prices when they are useful.

There is no account, bank connection or backend requirement for the core shopping flow.

## Money is a domain rule, not a formatting detail

A shopping-budget app should not let JavaScript floating-point behaviour decide whether someone is over budget.

Canonical money is stored as **integer euro cents**.

```text
€3.29 → 329
€12.60 → 1260
€50.00 → 5000
```

Cart totals, remaining amount, safety-buffer calculations, projections and over-budget states are derived from exact canonical values outside React components.

Derived totals are not persisted as financial authority.

That matters because this UI is making a real-time money decision, not displaying decorative statistics.

## Checkout is reconciliation, not a reset

The estimate built in the aisle and the amount charged at checkout are two different facts.

When a trip is finished, Shopping Budget Companion can store the **actual receipt total** alongside the cart estimate.

It can then report:

- the receipt matched the estimate;
- you paid more than the estimated cart;
- you paid less than the estimated cart.

The receipt does **not** silently rewrite the item prices from the shopping trip.

This preserves the useful distinction between:

```text
what I thought the basket cost
                vs
what I actually paid
```

## Losing browser storage should not lose the shopping trip silently

Shopping can happen in a poor environment for software:

- the page gets reloaded;
- the browser limits storage;
- a previous saved payload is malformed;
- history cannot be written;
- the user is halfway through the store when something goes wrong.

Stored state is versioned and validated with Zod.

The application has explicit persistence and recovery paths instead of assuming `localStorage` always succeeds. If a completion cannot be saved safely, the active trip stays open rather than pretending it was archived.

The core committed state is designed to survive reloads, and degraded persistence is surfaced to the user.

## Camera tools reduce typing; they do not decide the price

Manual price entry is always available.

Optional on-device helpers can reduce friction:

- **Barcode scanning** — native `BarcodeDetector` when available, with ZXing WASM fallback;
- **Product recognition** — a lazy-loaded CLIP model can suggest what the camera is looking at;
- **Shelf-price reading** — Tesseract.js can propose price candidates from a shelf label.

The important boundary is:

```text
camera → candidate/context → shopper confirms → canonical price
```

A barcode identifies a product, not a guaranteed current shelf price.

OCR output is treated as candidate data. Visual recognition is advisory. The shopper remains in control of the value that becomes money in the trip.

Camera frames stay on the device.

## Repeat shopping gets cheaper

The first trip should work without setup. The second should require less work.

Completed trips can feed **Price Memory**, which remembers prior observed prices as context rather than pretending they are current truth.

A remembered price keeps its provenance. Reusing an old observation does not magically make it fresh.

This is a small detail in the UI, but an important trust rule in the product.

## Offline is part of the shopping environment

The app is an installable PWA.

The application shell is precached so the core workflow remains available offline. Larger scanner/OCR/model assets are loaded only when those optional tools are needed instead of making every first visit pay their cost.

The main budget loop does not depend on network availability.

## Under the product

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

The state model uses a small TypeScript controller with `useSyncExternalStore`. The architecture is there to protect money, lifecycle and recovery rules — not to make a small app look larger than it is.

See [Architecture](./docs/ARCHITECTURE.md) for the deeper breakdown.

## Stack

**Product**

- React 19
- TypeScript 6 strict
- Vite 8
- Zod 4
- CSS Modules
- Workbox / PWA
- Web Storage and browser APIs
- ZXing WASM
- Transformers.js / CLIP
- Tesseract.js

**Verification**

- Vitest + React Testing Library
- fast-check
- Playwright
- axe-core
- ESLint
- GitHub Actions
- dependency/security checks

Browser journeys cover Chromium, Firefox and WebKit, including accessibility, persistence/recovery, localization, multi-tab behaviour, barcode/OCR flows and camera-disabled builds.

## Run locally

Requirements: Node.js 24 and npm 11.

```bash
git clone https://github.com/MykolaDotsenko/shopping-budget-companion.git
cd shopping-budget-companion
npm ci
npm run dev
```

Quality checks:

```bash
npm run check
npm run test:e2e
```

## Deeper documentation

- [Product](./docs/PRODUCT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Domain](./docs/DOMAIN.md)
- [Testing](./docs/TESTING.md)
- [Data persistence](./docs/architecture/DATA-PERSISTENCE.md)
- [Decision log](./docs/DECISIONS.md)
- [Security](./SECURITY.md)

## License

MIT — see [LICENSE](./LICENSE).
