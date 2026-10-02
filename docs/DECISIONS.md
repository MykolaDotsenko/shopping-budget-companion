# Product and Architecture Decisions

## Purpose

This is the retrieval index for accepted durable decisions.

Current implementation status comes from code/tests and current authoritative contracts. Decision records explain **why** important choices were made and when they may be revisited.

Do not load every decision file for a narrow task. Use the category links or table below.

## Categories

- [Product, scope and competition](./decisions/product-scope-competition.md)
- [Money, domain and trust](./decisions/money-domain-trust.md)
- [Persistence and data integrity](./decisions/persistence-data-integrity.md)
- [Architecture and technology](./decisions/architecture-technology.md)
- [Future capabilities](./decisions/future-capabilities.md)
- [Evidence, brand and validation](./decisions/evidence-brand-validation.md)

## Decision index

| Decision | Topic | File |
| --- | --- | --- |
| D-001 | Pivot from generic counter to shopping budget companion | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-002 | Remaining amount is the primary metric | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-003 | Manual price entry is the baseline | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-004 | Barcode identifies product, not current price | [Money, Domain and Trust](./decisions/money-domain-trust.md) |
| D-005 | Exact money uses integer minor units | [Money, Domain and Trust](./decisions/money-domain-trust.md) |
| D-006 | Strict TypeScript becomes justified by the pivot | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-007 | localStorage before IndexedDB | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-008 | Persistence failure must be visible | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-009 | No backend for MVP | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-010 | Scanned values require confirmation | [Money, Domain and Trust](./decisions/money-domain-trust.md) |
| D-011 | Price confidence is part of the product model | [Money, Domain and Trust](./decisions/money-domain-trust.md) |
| D-012 | Event sourcing is not justified | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-013 | State commits precede decorative motion | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-014 | Core product remains free of mandatory smart features | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-015 | Product does not expand into general personal finance | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-016 | Competitive advantage is execution, not feature count | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-017 | Price source and confidence are separate dimensions | [Money, Domain and Trust](./decisions/money-domain-trust.md) |
| D-018 | MVP supports EUR only | [Money, Domain and Trust](./decisions/money-domain-trust.md) |
| D-019 | MVP money input guardrails are explicit | [Money, Domain and Trust](./decisions/money-domain-trust.md) |
| D-020 | Brand promise is pre-checkout remaining control | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-021 | CartRoom remains a working codename, not the locked product name | [Evidence, Brand and Validation](./decisions/evidence-brand-validation.md) |
| D-022 | Organic proof before meaningful paid acquisition | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-023 | Monetization must preserve core shopping trust | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-024 | Core runtime remains React 19.3 + Vite 8 | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-025 | Begin migration on strict TypeScript 6.0.x | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-026 | No third-party global state library in MVP | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-027 | Zod validates untrusted boundaries, not the domain | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-028 | PWA uses vite-plugin-pwa + Workbox generateSW first | [Future Capability](./decisions/future-capabilities.md) |
| D-029 | MVP uses native semantic UI and CSS Modules, not a UI framework | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-030 | No router until URLs have real product value | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-031 | Barcode scanning uses progressive native + lazy WASM detection | [Future Capability](./decisions/future-capabilities.md) |
| D-032 | Open Food Facts is an optional product-identity provider, not a price provider | [Future Capability](./decisions/future-capabilities.md) |
| D-033 | Shelf OCR provider remains benchmark-gated (superseded for production by D-055) | [Future Capability](./decisions/future-capabilities.md) |
| D-034 | localStorage remains MVP persistence despite adding runtime validation | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-035 | Repeat-trip acceleration precedes scanner breadth | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-036 | Second-trip rate is the primary early product-validation signal | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-037 | Run an early scanner benchmark without promoting scanner to the production roadmap (retired by D-056) | [Future Capability](./decisions/future-capabilities.md) |
| D-038 | Refine retention thresholds and include third-trip behaviour | [Product, Scope and Competition](./decisions/product-scope-competition.md) |
| D-039 | Human B6 gate is explicitly waived for continued development, not declared passed | [Evidence, Brand and Validation](./decisions/evidence-brand-validation.md) |
| D-040 | Repeat budget derives from completed history, not duplicate settings state | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-041 | Price Memory learns only from durably completed confirmed items | [Money, Domain and Trust](./decisions/money-domain-trust.md) |
| D-042 | Retention beta evidence stays local and content-free | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-043 | Structured physical evidence is required for B6 eligibility | [Evidence, Brand and Validation](./decisions/evidence-brand-validation.md) |
| D-044 | Guarded shopping builds use provisional product identity without locking the final brand | [Evidence, Brand and Validation](./decisions/evidence-brand-validation.md) |
| D-045 | Retire the compatibility shell and publish one product | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-046 | Make documentation authority explicit and keep the repository root small | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-047 | B6 timing evidence must be internally verifiable | [Evidence, Brand and Validation](./decisions/evidence-brand-validation.md) |
| D-048 | Separate application contracts and compress current AI context surfaces | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-049 | Decompose architectural hotspots by reason to change | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-050 | Appearance is a semantic-token presentation layer | [Architecture and Technology](./decisions/architecture-technology.md) |
| D-051 | Damaged local data always leaves the shopper a safe exit | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-052 | Each deployed evidence surface keeps its own storage | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-053 | Production barcode ships ahead of physical evidence, behind kill switches | [Future Capability](./decisions/future-capabilities.md) |
| D-054 | Barcode names are remembered in their own advisory record | [Persistence and Data Integrity](./decisions/persistence-data-integrity.md) |
| D-055 | Production price-tag reading ships ahead of field evidence, behind a kill switch | [Future Capability](./decisions/future-capabilities.md) |
| D-056 | Retire the camera benchmarks once the camera features ship | [Future Capability](./decisions/future-capabilities.md) |
| D-057 | Production visual recognition ships as a local-inference optional accelerator | [Future Capability](./decisions/future-capabilities.md) |
| D-058 | Self-hosted ZXing runtime and WASM stay version-locked | [Architecture and Technology](./decisions/architecture-technology.md) |

## Usage rule

Read a decision when:

- the task would reverse or materially reinterpret an accepted cross-cutting choice;
- the current contract points to a decision for rationale;
- a proposed dependency/capability appears intentionally gated;
- product evidence may justify reopening a prior choice.

Do not use older wording inside a decision record to infer current implementation status.
