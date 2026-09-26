# Storage Schema Specification

## Status

**IMPLEMENTED** localStorage contracts:

- active trip;
- completed history;
- Price Memory;
- barcode links;
- set-aside backups;
- versioned envelopes;
- strict runtime validation;
- domain reconstruction;
- malformed/future-version handling;
- historical non-shopping key retirement.

This document owns storage shapes and the validation order. Persistence rules — completion ordering, startup reconciliation, recovery, deletion and write failures — live in [../architecture/DATA-PERSISTENCE.md](../architecture/DATA-PERSISTENCE.md).

Four convenience preferences are the only settings records: appearance, scan mode, price entry mode and the install offer. No other settings/meta records are defined until a real requirement exists.

## Goals

- versioned and inspectable;
- canonical inputs only;
- deterministic validation;
- safe migration;
- loss-avoiding completion;
- no reinterpretation of historical non-shopping data;
- independent advisory Price Memory.

## Keys

```text
budget-cart:active-trip
budget-cart:history
budget-cart:price-memory
budget-cart:barcode-links
budget-cart:set-aside:<source>:<setAsideAt>[:<n>]
shopping-budget:appearance
shopping-budget:scan-mode
shopping-budget:price-entry-mode
shopping-budget:install-offer
```

Historical counter keys (`pulse-counter:state`, `counter`) must never be interpreted as shopping money.

Evidence tooling uses its own `budget-cart:qa:*` keys; they are not shopping state and are not defined here.

### Convenience preferences

Each preference is a raw, unversioned string outside the shopping envelopes. A missing, unreadable or unknown value reads as the default, and a failed write is ignored: the choice is simply not remembered next time.

| Key | Values | Default |
| --- | --- | --- |
| `shopping-budget:appearance` | `system`, `light`, `dark`, `aurora` | `system` |
| `shopping-budget:scan-mode` | `barcode`, `price` | the first camera mode the build offers |
| `shopping-budget:price-entry-mode` | `decimal`, `auto-cents` | `decimal` |
| `shopping-budget:install-offer` | `dismissed` | offer not dismissed |

### Deployed-surface scope

Every surface of this repository is served from one GitHub Pages origin, so they all share one `localStorage`. The public app uses the keys above unchanged. Guarded evidence builds prefix every shopping and evidence key with the path they are served from:

```text
surface:<served path>|<key>
surface:/shopping-budget-companion/beta/|budget-cart:active-trip
surface:/shopping-budget-companion/study/<baseline>/beta/|budget-cart:qa:retention-v1
```

The scope is resolved at runtime from the relocatable base, so a copied immutable study baseline, the moving guarded route and the public app never read, overwrite or clear each other's records. The same scope applies to the tab-scoped QA timing evidence in `sessionStorage`. The convenience preferences above stay shared on purpose; they are convenience state. Study baselines published before scoping shipped keep the unscoped keys they were built with.

## Common envelope

Logical records use a versioned envelope:

```ts
interface StorageEnvelope<T> {
  schemaVersion: number
  savedAt: string
  data: T
}
```

Rules:

- schemaVersion is integer >= 1;
- savedAt is diagnostic metadata;
- runtime schema validation happens before domain reconstruction;
- domain validation still applies after DTO validation;
- derived totals are never storage authority.

## Active-trip v1

Key:

```text
budget-cart:active-trip
```

Stored only when an active trip exists.

Canonical content includes:

- trip id/status/currency;
- budget and safety buffer;
- startedAt;
- item ids/prices/quantities;
- optional labels;
- price source/confidence;
- item timestamps.

Items are strict and carry no product identity such as a barcode; barcode names live in their own record (D-054). The only store context is the optional `storeId` on a remembered price's confidence.

Must not contain derived authority such as:

- cartTotal;
- remaining;
- safeRemaining;
- progress;
- overBudget.

## History v1

Key:

```text
budget-cart:history
```

Stores completed-trip snapshots in a versioned envelope whose data is `{ trips: [...] }`.

Each completed entry preserves canonical trip/item data plus:

- completedAt;
- optional actualCheckoutMinor.

Requirements:

- trip ids are unique;
- conflicting duplicate ids degrade rather than silently replace;
- invalid entries do not become domain objects.

How completion appends an entry, including the same-shopping and conflict rules, is defined in [DATA-PERSISTENCE](../architecture/DATA-PERSISTENCE.md).

## Price Memory v1

Key:

```text
budget-cart:price-memory
```

Envelope data is `{ records: [{ id, productId, label, currency, unitPriceMinor, observedAt, storeId?, source }] }`:

- `productId` is the product identity derived from the item name (`label:<lower-cased name>`) and `label` is its display form;
- `id` is derived from `productId` and the optional `storeId`; a record whose `id` does not match is invalid;
- `unitPriceMinor` is a positive integer number of EUR cents and `observedAt` is a canonical timestamp;
- `source` is `{ kind: "manual" }`, `{ kind: "shelf-scan", captureId? }` or `{ kind: "retailer-feed", provider }`;
- duplicate ids are a conflict, not a merge.

Price Memory is advisory and independent from active/history persistence; its rules are in DATA-PERSISTENCE.

## Barcode links v1

Key:

```text
budget-cart:barcode-links
```

Envelope data is `{ links: [{ gtin, label, linkedAt }] }`:

- `gtin` is 14 digits with a valid GS1 check digit; store codes and coupons are never stored;
- `label` is the canonical item label the shopper gave the product;
- `linkedAt` is a canonical timestamp; the newest link per GTIN wins and a clock moving back never makes a rename older;
- at most 500 links, most recent first; duplicate GTINs are a conflict, not a merge.

Barcode links are advisory like Price Memory (D-054); their rules are in DATA-PERSISTENCE.

## Validation order

For persisted input:

1. read raw string;
2. parse JSON;
3. validate envelope header/version;
4. validate DTO schema;
5. reconstruct through domain validators/constructors;
6. reject or recover on invariant failure.

Never cast untrusted JSON directly into branded domain types.

An active-trip record is either fully valid or unreadable. History, Price Memory and barcode links keep their valid entries and report the record as degraded when some entries are invalid; duplicate trip ids, memory ids or GTINs make the whole record unreadable. What follows a rejection — recovery, degraded health or setting the record aside — is defined in DATA-PERSISTENCE.

## Set-aside backups

When the shopper sets an unreadable active-trip or history record aside, its exact raw string is first copied to a new backup key:

```text
budget-cart:set-aside:<source>:<setAsideAt>[:<n>]
```

- `<source>` is `active-trip` or `history`;
- `<setAsideAt>` is the canonical ISO timestamp of the action;
- `:<n>` (`:2`, `:3`, …) is appended when a backup with the same timestamp already exists, so an earlier backup is never overwritten.

Backup value:

```json
{
  "schemaVersion": 1,
  "setAsideAt": "2026-09-22T10:00:00.000Z",
  "sourceKey": "budget-cart:history",
  "reason": "invalid-history-entry",
  "raw": "<exact original string>"
}
```

`reason` is the issue that made the record unreadable: `malformed-json`, `invalid-envelope`, `unsupported-version` or `invalid-data`, and for history also `invalid-history-entry` or `history-conflict`.

## Privacy

Shopping state remains local in the current product. The shopping app's only request that leaves this site is the optional, tap-only Open Food Facts name lookup: it sends the barcode number plus the app's name and version (and the list of product fields it wants back), never shopping content. Barcode and price-reader engine files load from this site.

Storage schemas must not grow analytics/evidence fields.

QA/retention evidence uses separate keys/contracts.

## Required tests

Cover, for each versioned record:

- fresh start;
- valid restore;
- reload after a write;
- malformed JSON;
- invalid envelope, DTO or business value;
- unsupported future version;
- invalid entries and duplicate ids or GTINs where a record keeps its valid entries.

Durability and transaction failure tests are listed in DATA-PERSISTENCE.

## Review checklist

- Is only canonical state persisted?
- Can an old build overwrite a future schema?
- Can completion lose the trip?
- Can invalid JSON become branded domain data?
- Is convenience state isolated from core durability?
- Are migration and tests included with a schema change?
- Did a speculative settings/meta record get added without a product need?
