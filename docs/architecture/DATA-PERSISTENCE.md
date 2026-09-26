# Data and Persistence Contract

## Status

**IMPLEMENTED current persistence contract.**

This document owns durability, recovery and transaction semantics: completion ordering, startup reconciliation, recovery, deletion and the advisory stores. Other documents link here instead of restating these rules.

Storage shape/version detail lives in [../specs/STORAGE-SCHEMA.md](../specs/STORAGE-SCHEMA.md). Do not duplicate schema definitions here.

## Goals

Persistence must:

- preserve committed shopping state;
- fail visibly;
- avoid data loss during completion;
- reject malformed/unsupported data safely;
- keep core durability separate from advisory convenience data;
- remain local-first in the current product.

## Storage technology

Current persistence uses `localStorage`.

This is proportionate because:

- state is small;
- access patterns are simple;
- synchronous writes fit the current single-user workflow;
- storage is easy to inspect/test.

Move to IndexedDB only for a demonstrated size/query/concurrency requirement.

## Storage boundaries

Current durable subsystems:

1. active trip;
2. completed history;
3. Price Memory;
4. barcode names (barcode links, D-054).

QA/retention evidence uses its own `budget-cart:qa:*` keys in the same browser storage (timing QA in tab-scoped `sessionStorage`) and is never canonical shopping state. The appearance, scan-mode, price-entry-mode and install-offer preferences are convenience state outside these rules.

## Active-trip durability

A committed active-trip mutation:

1. applies through domain/application rules;
2. updates in-memory application state;
3. attempts persistence immediately;
4. exposes degraded health if the write fails.

A failed write must not be presented as durable success.

The in-memory state may remain usable, but the user must be able to understand that reload safety is degraded.

## Persistence health

### Healthy

The latest required durable operation succeeded.

### Degraded

A required persistence operation failed or persisted data requires recovery/cleanup.

Degraded state should include enough structured issue information for:

- user-facing warning/retry;
- deterministic tests;
- diagnostics.

Do not leak raw implementation detail into user copy.

## Read / bootstrap

Bootstrap reads and validates persisted state before reconstructing domain objects.

Rules:

- malformed JSON is not accepted;
- unsupported future versions are not guessed into compatibility;
- invalid DTOs do not become domain objects;
- domain invariants still run after DTO validation;
- raw recovery material is preserved where the recovery contract requires it;
- historical non-shopping values are never interpreted as shopping money.

## Active-trip restore

Valid active state restores to the active lifecycle.

No active snapshot restores to idle.

Malformed/unsupported active state enters explicit recovery/degraded behaviour rather than being silently replaced.

## Completed history restore

History restore validates:

- envelope/version;
- individual completed entries;
- domain reconstruction;
- duplicate/conflicting trip ids.

A valid subset may be retained only where the schema/persistence contract explicitly supports partial recovery.

Unreadable history never blocks the shopping flow and never enters RECOVERY. It is reported as its own history-integrity state, separate from write health, so a later successful active-trip write cannot hide it. Readable trips stay visible; finishing, deletion and clearing are refused until the shopper sets the damaged record aside, because each of them would overwrite it.

## Setting unreadable data aside

An unreadable record leaves its canonical key only through an explicit, clearly described user action:

1. copy the exact raw string to a new `budget-cart:set-aside:*` backup key;
2. read the backup back and compare it byte for byte;
3. only then rewrite history with the readable trips (or remove the unreadable active record).

If any step fails, the canonical record is left unchanged. A readable record is never set aside. Setting history aside keeps exactly the readable trips the app already showed (none when the record as a whole is unreadable). Backups are not read by the product; they remain on the device until site data is cleared. The key and value formats are defined in [STORAGE-SCHEMA](../specs/STORAGE-SCHEMA.md).

## Continuing without saving

When the active record cannot be read, or storage is unavailable, the shopper may explicitly continue without saving. The session then refuses every write, keeps an honest `session-only` degraded state and never touches stored data. Trips still finish into an in-memory summary and the next trip can start, but nothing survives a reload, which returns to recovery.

Session-only is a choice, not a fault: its single notice says nothing is saved, and the product never offers to repair, reset or clear stored records it has promised not to touch (no Price Memory repair, no history deletion or clearing, no "saved independently" reassurance).

## History rewrites

Every rewrite of completed history (append on completion, checkout update, deleting a trip, clearing history, making room) re-reads the stored record first and refuses to write when it cannot be read. Completion returns the history exactly as written, and deletion is computed from that durable list, never from what the session happened to load.

## Full storage

A write refused by the browser's storage quota is reported as `storage-full`, apart from other write failures, and nothing is deleted to make room without the shopper's confirmation. Browser storage is shared by every site on the origin, and a trip takes roughly 10 KB of history, so a long history can fill it. The notice then offers to remove the oldest trips from history (a tenth of them, at least one, never the trip on an open summary; remembered prices stay), retries the save that failed, and can be used again if that was not enough. On an open summary whose trip is already in history, Done keeps the trip as it was last saved when a later receipt total could not be saved; a receipt total for a trip deleted in another tab is refused with that reason instead of blocking Done. This works during a trip too, because removing old trips cannot touch the open trip. A finish refused for lack of room keeps the trip open and says how to make room.

## Completion transaction

Completion has the highest durability sensitivity.

Required ordering:

1. create a valid completed-domain trip;
2. re-read and validate the stored completed history;
3. append completed trip idempotently;
4. persist updated history;
5. only after history is durable, clear active-trip storage;
6. then learn remembered prices from the completed trip (see Price Memory persistence).

### History cannot be read

Then:

- nothing is written, and the active trip stays open and durable;
- history integrity becomes damaged (see Completed history restore); write health is unchanged;
- completion stays refused until the shopper sets the damaged record aside or a re-read succeeds.

### History write fails

Then:

- active trip must remain durable/current;
- the app must not claim safe completion;
- persistence becomes degraded;
- completion can be retried.

### History succeeds, active clear fails

Then:

- completion is durable;
- completed summary/history remain authoritative;
- cleanup is marked pending/degraded;
- a save retry, or startup reconciliation, attempts to clear the stale active copy;
- if history becomes unreadable before the copy is cleared, the copy is the last readable record of the trip: it is cleared only once readable history holds the same shopping, and setting history aside from the summary saves the trip into the new history first.

Never reverse the write order.

## Idempotent completion

"Same shopping" means the same trip id, currency, budget, safety buffer, start time and cart lines (every line field, in order). Completion time, the optional checkout total and when a line was last edited or its price last confirmed are not part of it, so an edit that was reverted is still the same shopping.

If history already contains the trip id with the same shopping:

- treat append as already durable;
- the recorded completion stays authoritative: the summary shows it, with its original completion time and any checkout total;
- do not duplicate the trip.

If history contains the trip id with different shopping, the open trip was edited after an earlier completion of it was recorded (for example while history could not be read). Storage reports a history conflict and never chooses one value; the completion use case then records the open trip under a new trip id, so both the recorded trip and the shopper's current cart are kept. The open trip is saved under the new id before that completion, so a completion interrupted after its history write leaves a copy that startup reconciliation recognises. If that save fails, nothing is recorded and the trip stays open with completion reported as not saved. Both records then stay in history as separate trips; the shopper can delete either one.

## Startup reconciliation

Bootstrap reads and validates the active-trip record, then completed history. An unreadable active record enters recovery and nothing is reconciled.

If a readable active snapshot is the same shopping as a trip in readable history (the readable trips of a partly damaged record count):

- history is completion authority;
- active state is treated as stale cleanup, and the app starts idle;
- attempt to clear active storage;
- do not duplicate history;
- expose cleanup failure if removal fails: cleanup stays pending and persistence degraded until a save retry or a later startup clears the copy.

Only readable trips can confirm a copy, so unreadable history is never permission to remove the active record. An active snapshot that shares an id with a completed trip but holds different shopping is not stale: it stays open, and finishing it follows the conflict rule above. A successful re-read after a read failure ("Try again") applies the same rule in-session, so edits made while history was unreadable are never discarded.

## Checkout reconciliation

Updating optional actual checkout total:

- requires the matching completed trip to exist;
- writes a replacement completed snapshot safely;
- does not create a new unrelated history entry;
- does not alter item prices.

Missing/conflicting history degrades rather than inventing state. Unreadable history is not written: history integrity becomes damaged and the new total stays in the open summary, which setting history aside then saves.

## Price Memory persistence

Price Memory is advisory and independently durable.

Rules:

- completion durability does not depend on Price Memory;
- Price Memory write failure does not invalidate a completed trip;
- prices learned from a completed trip are written only after its history write, and never over an unreadable Price Memory record; clearing remembered prices is the explicit reset;
- clearing Price Memory does not clear history;
- clearing history does not implicitly clear Price Memory;
- malformed Price Memory data cannot corrupt active/history state.

Barcode names (`budget-cart:barcode-links`, D-054) follow the same advisory rules. A link is written after the item that carried the barcode has been added, never before, and a failed link write keeps the name in memory for this session and reports degraded barcode-name persistence. An unreadable barcode record is never overwritten; clearing remembered prices resets it.

## Historical non-shopping data

Old counter/prototype keys are compatibility hazards only.

Rules:

- never reinterpret them as shopping money;
- retire them intentionally after shopping bootstrap is safe;
- key-removal failure is explicit where it affects cleanup status.

Do not keep compatibility UI/domain behaviour for the retired product.

## Unsupported future versions

An older app encountering a newer schema must:

- reject unsupported interpretation;
- avoid overwriting the newer raw value;
- surface recovery/degraded semantics;
- wait for an explicit migration/compatibility rule.

The shopper may still continue without saving, or set the newer record aside; setting aside preserves the exact raw value in a backup key rather than overwriting it.

## Malformed data

Do not “repair” money or lifecycle facts by guessing.

Recovery may:

- preserve raw data for diagnostics;
- isolate invalid entries where contractually supported;
- allow explicit reset/recovery action.

It must not silently fabricate canonical financial state.

## User-controlled deletion

### Completed history

Delete one trip, remove the oldest trips when storage is full, or clear history only through an explicit user action and safe history write.

### Price Memory

Clear independently through explicit user action.

### Active trip

Setting an unreadable active record aside is not destructive: the raw record is kept as a backup. Any future discard action for a readable trip must clearly communicate data loss before destructive removal.

## Privacy

Current shopping persistence is local.

Do not place analytics/evidence metadata into shopping schemas.

Do not add remote persistence without an explicit product/privacy decision.

## Service-worker boundary

The PWA service worker precaches the application shell and caches the self-hosted barcode and price-reader engine files on first use.

It must never own canonical shopping state or financial mutation ordering.

## Multiple tabs

The stored records are the source of truth; a tab's in-memory copy is a cache of them.

- Each storage port remembers the raw records it last read or wrote and reports when another tab has changed them.
- Before any command that writes, a tab whose own saves are healthy reloads the stored records and applies the command to them: an item added in each of two tabs keeps both, and a trip another tab finished or started is never reopened or overwritten.
- A `storage` event, returning to a hidden tab and restoring a page from the back/forward cache reload the same way, so an idle tab shows what another tab did.
- A tab whose own saves are failing keeps its unsaved view instead of reloading, so retrying saves what the shopper sees.
- A finished-trip summary stays open when the reloaded history does not contain it, unless another tab has started a trip.

Concurrent edits are never merged below the command level; the second tab's command runs on the first tab's result.

## Write strategy

Prefer simple explicit snapshot writes over speculative queues/event logs.

Requirements:

- deterministic serialization;
- versioned envelopes;
- no persisted derived totals;
- no hidden retry loop that makes UI durability status inaccurate.

## Migration discipline

A real storage schema change requires:

1. schema update;
2. migration/compatibility logic;
3. domain reconstruction update if needed;
4. old/current/future-version tests;
5. documentation update.

Refactors that preserve storage shape do not need version bumps.

## Required failure tests

At minimum:

- storage unavailable;
- read throws;
- malformed JSON;
- invalid envelope/data;
- unsupported future version;
- serialization failure;
- write failure;
- full storage (quota) and making room;
- remove failure;
- history conflict;
- idempotent completion of the same shopping;
- invalid history entry;
- completion history-write failure;
- completion active-clear failure;
- startup stale-active reconciliation;
- legacy key retirement failure;
- Price Memory and barcode-name failure independence.

## Review checklist

Before changing persistence:

- Can any committed trip be lost?
- Is history durable before active cleanup?
- Can malformed/future data be overwritten?
- Are schema and domain validation both applied?
- Is advisory state isolated from core durability?
- Is degraded state visible and retryable where meaningful?
- Does a new storage field represent canonical state?
- Is a version bump truly required?
- Did the change duplicate schema rules already owned by STORAGE-SCHEMA?
