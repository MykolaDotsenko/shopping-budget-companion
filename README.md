# Shopping Budget Companion

**Know what’s left before checkout.** Set a spending limit, add prices as you shop, and always see what you can still spend while the cart is changing.

[![Quality](https://github.com/MykolaDotsenko/shopping-budget-companion/actions/workflows/quality.yml/badge.svg)](https://github.com/MykolaDotsenko/shopping-budget-companion/actions/workflows/quality.yml)

[**Open the app**](https://mykoladotsenko.github.io/shopping-budget-companion/) ·
[Privacy](https://mykoladotsenko.github.io/shopping-budget-companion/privacy/) ·
[Send feedback](https://github.com/MykolaDotsenko/shopping-budget-companion/issues/new?template=feedback.yml)

<p align="center">
  <img
    src="docs/assets/shopping-budget-companion.png"
    alt="Shopping Budget Companion trip screen showing €19.48 left of a €50 budget, with the cart total, Add price and the cart list"
    width="390"
  />
</p>

## Product loop

```text
set a budget → add prices → see what remains → finish → compare with receipt
```

This is deliberately narrower than a generic expense tracker.

- start from a preset or custom budget;
- optionally keep a safety buffer for deposits/weighed items;
- add a price quickly, with product name optional;
- edit, remove and Undo mistakes;
- change the budget during a trip;
- finish with an actual receipt total;
- reuse the previous budget and remembered prices;
- install the app and keep using the core flow offline.

No account or bank connection is required. Shopping state stays on the device.

## Engineering choices that matter

### Money is exact

Canonical financial state uses **integer minor units**, not JavaScript floating-point values.

Totals, remaining budget, safety buffer, projections and over-budget state live in domain code outside React.

### Persistence can fail without destroying the trip

Stored data is versioned and validated with Zod.

The application distinguishes normal persistence, degraded writes and recovery paths instead of assuming `localStorage` always works. Finishing a trip is reconciliation-aware so history and active-trip cleanup cannot silently drift apart.

### Camera features are helpers, not authority

The manual price-entry flow always remains available.

Optional on-device features include:

- barcode scanning via native `BarcodeDetector` with ZXing WASM fallback;
- visual product recognition with a lazy-loaded CLIP model;
- shelf-price reading with Tesseract.js.

Camera frames stay on the device. Recognition results are advisory and still pass through normal user-controlled price entry.

### Offline is part of the product

The installable PWA precaches the application shell. Heavier scanner/OCR assets are loaded when needed instead of bloating the initial install.

## Architecture

```text
features ─────────▶ application ─────────▶ domain
                         ▲                    ▲
        implements ports │                    │ uses
                         └── infrastructure ──┘
```

| Layer | Owns |
| --- | --- |
| Domain | money, trip rules, projections, selectors, product codes |
| Application | use cases, controller, Undo, lifecycle, recovery, persistence ordering |
| Infrastructure | storage, schemas/codecs, camera, barcode/OCR/product adapters |
| UI | rendering, drafts, focus, accessibility and interaction feedback |

A small TypeScript controller with `useSyncExternalStore` is enough for this product. There is no Redux/Zustand/XState layer and no backend to synchronize.

See [Architecture](./docs/ARCHITECTURE.md).

## Stack

**Runtime**

- React 19
- TypeScript 6 strict
- Vite 8
- Zod 4
- CSS Modules
- Workbox/PWA
- Web Storage and native browser APIs
- ZXing WASM, Transformers.js/CLIP and Tesseract.js for optional camera helpers

**Verification**

- ESLint
- Vitest + React Testing Library
- fast-check
- Playwright
- axe-core
- GitHub Actions
- dependency/security checks

## Quality

```bash
npm ci
npm run check
npm run test:e2e
```

The quality gate covers linting, type checking, unit/component tests, coverage thresholds, production build validation and browser journeys.

Browser verification exercises Chromium, Firefox and WebKit, including accessibility checks and camera-disabled builds.

## Repository map

```text
src/
├── app/             composition root and shell
├── application/     controller, use cases, contracts and ports
├── domain/          money and shopping rules
├── features/        shopping UI
├── infrastructure/  storage and camera adapters
└── qa/              validation-only surfaces

tests/
e2e/
docs/
scripts/
```

Start with [docs/README.md](./docs/README.md) if you want the deeper design and decision history.

## Run locally

Requirements: Node.js 24 and npm 11.

```bash
git clone https://github.com/MykolaDotsenko/shopping-budget-companion.git
cd shopping-budget-companion
npm ci
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Scope and evidence

Barcode, visual-product and shelf-price recognition are shipped features, but they are not required for the core shopping flow.

Physical field validation for those camera features is tracked separately from whether the code works in automated tests. The repository does not treat an automated browser pass as proof that every real supermarket label or barcode will be recognized.

## Documentation

- [Product](./docs/PRODUCT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Domain](./docs/DOMAIN.md)
- [Testing](./docs/TESTING.md)
- [Data persistence](./docs/architecture/DATA-PERSISTENCE.md)
- [Decision log](./docs/DECISIONS.md)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)

## License

MIT — see [LICENSE](./LICENSE).
