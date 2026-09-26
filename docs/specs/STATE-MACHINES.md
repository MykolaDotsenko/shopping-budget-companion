# State Machines

## Status

**IMPLEMENTED current behavioural contract.**

This file defines current application/persistence/interaction states and transitions. Write ordering, startup reconciliation and recovery rules are owned by [../architecture/DATA-PERSISTENCE.md](../architecture/DATA-PERSISTENCE.md); this file links there instead of restating them.

## Principle

Canonical shopping lifecycle and ephemeral UI state are separate.

Do not encode dialogs, focus, animation or optional capability loading inside ShoppingTrip.

## Application lifecycle

```text
BOOTING
  ├─ valid active trip ──────────────→ ACTIVE
  ├─ no active trip ─────────────────→ IDLE
  ├─ stale copy of a recorded trip ──→ IDLE (copy cleared)
  └─ unsafe persisted active state ──→ RECOVERY
```

A stale copy is an active trip that is the same shopping as a trip history already records. If clearing it fails, the app still starts in IDLE, with completion cleanup pending and persistence DEGRADED. The startup reconciliation rules are owned by DATA-PERSISTENCE.

### IDLE

Meaning:

- no active trip;
- history/Price Memory may exist.

Transitions:

- START_TRIP(valid) → ACTIVE;
- START_TRIP(invalid) → IDLE + validation error;
- SHOP_AGAIN(valid completed source + safe persistence) → ACTIVE with a fresh empty trip;
- OPEN_HISTORY → IDLE + history overlay state;
- SET_PAST_TRIP_CHECKOUT (from a history card) → IDLE with the receipt total saved on that trip in history; refused and nothing changes while history cannot be changed (unreadable, persistence DEGRADED, completion cleanup pending or `session-only`).

### ACTIVE

Meaning:

- exactly one active trip;
- active-trip mutations are allowed.

Transitions:

- ADD_ITEM / EDIT_ITEM / REMOVE_ITEM / UNDO → ACTIVE;
- SET_BUDGET / SET_BUFFER → ACTIVE;
- FINISH_TRIP(success) → COMPLETED_SUMMARY;
- FINISH_TRIP(history written, active-record clear fails) → COMPLETED_SUMMARY + persistence DEGRADED + completion cleanup pending;
- FINISH_TRIP(history already records different shopping under this id) → save the open trip under a new id, then finish it under that id; if that save or the history write fails → ACTIVE under the new id (when saved) + persistence DEGRADED;
- FINISH_TRIP(history-write failure) → ACTIVE + persistence DEGRADED;
- FINISH_TRIP(stored history unreadable) → ACTIVE + history integrity DAMAGED; nothing is written and the active trip stays durable;
- CANCEL_EMPTY_TRIP(no items) → IDLE with no history entry; the saved active record is removed and persistence is HEALTHY (session-only writes nothing and stays DEGRADED(`session-only`)); if the record cannot be removed → ACTIVE, unchanged;
- CANCEL_EMPTY_TRIP(trip has items) → refused, ACTIVE unchanged;
- RETRY_HISTORY_READ (the open trip is the same shopping as a recorded trip) → IDLE; the stale copy is cleared, or completion cleanup stays pending with persistence DEGRADED if that fails;
- active-state write failure → ACTIVE + persistence DEGRADED;
- MAKE_ROOM (persistence DEGRADED(`storage-full`), after confirmation) → the oldest trips leave history, then the failed save is retried: persistence HEALTHY when it now fits, otherwise still DEGRADED(`storage-full`); refused, with nothing removed, while history cannot be read.

### COMPLETED_SUMMARY

Meaning:

- current trip is completed;
- active-trip mutations are not allowed.

Transitions:

- SET_ACTUAL_CHECKOUT → COMPLETED_SUMMARY;
- SHOP_AGAIN(valid completed source, including the open summary's own trip) → ACTIVE with a new trip id and empty cart;
- OPEN_HISTORY (View trip history) → COMPLETED_SUMMARY + history overlay state; Back returns to the summary;
- DELETE_TRIP(the summary's own trip) / CLEAR_HISTORY → IDLE, with the history overlay still open; deleting any other trip stays in COMPLETED_SUMMARY;
- SET_PAST_TRIP_CHECKOUT → COMPLETED_SUMMARY; when it is the summary's own trip, the summary shows the new receipt total too;
- SET_ASIDE_HISTORY / RETRY_HISTORY_READ → COMPLETED_SUMMARY; a set-aside saves the summary's trip into the new history;
- DISMISS_SUMMARY → IDLE; refused (`completion-not-saved`) while persistence is DEGRADED other than `session-only`, or completion cleanup is pending, until a save retry succeeds.

Reopening the same completed trip is **PLANNED / GATED** and is not a current transition.

### RECOVERY

Meaning:

Persisted active data cannot safely become a valid ShoppingTrip: the active record is unreadable, or browser storage cannot be read at all.

Only the active record enters RECOVERY. Damaged history, a failed stale-copy cleanup and failed legacy-key retirement degrade instead.

Allowed behaviour:

- RETRY_READ → re-run bootstrap;
- SET_ASIDE_ACTIVE (unreadable record with raw material only) → back up the exact raw record, remove it, re-run bootstrap;
- CONTINUE_WITHOUT_SAVING → IDLE with persistence, Price Memory and barcode-name persistence DEGRADED(`session-only`): every write is refused for the rest of the session, so unreadable stored data is never overwritten. Trips still finish into an in-memory summary, the summary can be dismissed and Shop again works; nothing survives a reload, which returns to RECOVERY;
- preserve raw recovery material where the persistence contract requires it.

RECOVERY never invents prices/budgets from malformed data.

## Persistence health

Persistence health is orthogonal to lifecycle.

```text
HEALTHY
  └─ required durability failure → DEGRADED

DEGRADED
  ├─ successful canonical retry/write → HEALTHY
  └─ continued failure ──────────────→ DEGRADED
```

### HEALTHY

Latest required durable state is known to be persisted.

### DEGRADED

In-memory state may be newer than durable storage, or cleanup/recovery requires attention.

Requirements:

- visible warning;
- no false “saved” claim;
- arithmetic/UI can remain usable where safe;
- retry/recovery remains explicit.

Do not create a generic blocking ERROR lifecycle for ordinary storage failure.

## History integrity

History integrity is orthogonal to lifecycle and to write health.

```text
READABLE
  └─ stored history unreadable (bootstrap, finish, checkout total, save retry,
     the re-read before deleting a trip or clearing history) → DAMAGED

DAMAGED
  ├─ SET_ASIDE_HISTORY (backup, keep readable trips) → READABLE
  ├─ RETRY_HISTORY_READ succeeds (read failures only) → READABLE
  └─ otherwise ──────────────────────────────────────→ DAMAGED
```

While DAMAGED:

- starting, tracking and correcting trips work;
- readable completed trips stay visible and can seed Shop again;
- finishing, deleting a trip and clearing history are refused, because each would overwrite the unreadable record;
- a successful active-trip write never hides the history warning;
- the shown trips are exactly those a set-aside would keep;
- if history becomes unreadable while a finished-trip summary is open, repair is offered in the summary itself; setting history aside there saves the finished trip (with any checkout total) into the new history.

The rules behind these transitions — re-reading durable history before every rewrite, reconciling an open trip after a successful re-read, and keeping a stale active copy until readable history confirms it — are owned by DATA-PERSISTENCE.

## Add-price interaction

Ephemeral UI state:

```text
CLOSED
  └─ OPEN_ADD → EDITING

EDITING
  ├─ valid draft ─────────────→ VALID
  ├─ invalid/incomplete ──────→ EDITING
  └─ CANCEL ──────────────────→ CLOSED

VALID
  ├─ COMMIT within nominal budget ─→ COMMITTING
  ├─ COMMIT over nominal budget ───→ OVER_WARNING
  ├─ edit draft ───────────────────→ EDITING
  └─ CANCEL ───────────────────────→ CLOSED

OVER_WARNING
  ├─ ADD_ANYWAY → COMMITTING
  └─ CANCEL/EDIT → EDITING

COMMITTING
  ├─ application command accepted → CLOSED
  └─ rejected/failure → remain/recover according to application result
```

Crossing only the safety buffer is informational, not a second confirmation step.

Projection never mutates canonical trip state.

## Undo

```text
NO_UNDO
  └─ undoable mutation (add, edit, remove) → UNDO_AVAILABLE

UNDO_AVAILABLE
  ├─ UNDO → NO_UNDO
  ├─ new undoable mutation → UNDO_AVAILABLE (replace snapshot)
  ├─ SET_BUDGET / SET_BUFFER → NO_UNDO
  ├─ successful finish → NO_UNDO
  └─ reload → NO_UNDO
```

Undo is intentionally bounded/ephemeral. Leaving ACTIVE by any route clears it; a finish that is not saved (history unreadable or history write failed) keeps it.

## Finish-trip orchestration

FINISH_TRIP outcomes are the ACTIVE transitions above. The write order behind them, including the conflict fork, is owned by DATA-PERSISTENCE (Completion transaction, Idempotent completion).

Invariant:

> durable history before active cleanup

A history-write failure must not destroy the active trip.

If history succeeds and active cleanup fails, duplicated durable state is safer than lost state.

## Shop again

Shop again is not historical reopen.

```text
IDLE or COMPLETED_SUMMARY
  └─ SHOP_AGAIN(completedTripId)
       ↓
validate completed source
       ↓
copy budget + safety buffer
       ↓
new trip id + start time
       ↓
persist fresh empty ACTIVE trip
       ↓
ACTIVE
```

Reject the transition (`repeat-source-unavailable`) while persistence is DEGRADED other than `session-only` or completion cleanup is pending; it is also unavailable in BOOTING or RECOVERY and while a trip is open.

The completed history record remains unchanged.

## Checkout reconciliation

From COMPLETED_SUMMARY:

```text
SET_ACTUAL_CHECKOUT
  ↓
validate completed trip transition
  ↓
persist matching completed history entry
  ↓
COMPLETED_SUMMARY
```

This changes optional checkout reconciliation only; item prices remain historical observations.

## History / local-data state

History UI is ephemeral presentation state over canonical completed history.

Deleting one/all completed trips:

- requires no open trip, healthy persistence (so never in a `session-only` session), readable history and no pending cleanup;
- persists the new history snapshot;
- returns COMPLETED_SUMMARY to IDLE when the summary's own trip is removed;
- does not implicitly clear Price Memory.

Clearing Price Memory:

- requires no open trip;
- is independent;
- also clears remembered barcode names;
- does not mutate completed history.

## Overlay state

Avoid multiple unrelated booleans for mutually exclusive primary surfaces.

The shell (`ShoppingAppShell.tsx`) keeps one discriminated UI state, conceptually:

```ts
type OverlayState =
  | { kind: "none" }
  | { kind: "history" }
  | ({ tripId: TripId } & (
      | { kind: "add-price" }
      | { kind: "scan"; mode: "barcode" | "price"; context: { label?: string; barcode?: Gtin } }
      | { kind: "edit-item"; itemId: ItemId }
      | { kind: "budget-settings" }
      | { kind: "finish-trip" }
    ))
```

Overlay state is UI state, not ShoppingTrip lifecycle. A trip overlay belongs to the trip it was opened for: when that trip stops being the active one by any route (finished, reconciled, set aside), the overlay is treated as closed and never reopens over the next trip.

## Forbidden states

Implementation should reject/prevent:

- active trip with completedAt;
- completed trip without completedAt;
- zero/invalid quantity;
- safety buffer > budget;
- two primary overlays open simultaneously;
- persistence marked healthy after the latest required write failed;
- completed trip mutated with active-trip commands;
- remembered/candidate price silently represented as confirmed current price;
- completed history cleared as a side effect of Price Memory deletion.

## Camera scan

The scan overlay is ephemeral UI state, keyed to its trip like the other trip overlays. It has two modes, Barcode and Price tag, that share one camera session; switching modes while the camera runs does not reopen it, and switching from PAUSED or FAILED starts it again.

```text
STARTING ── camera ready ─────────────→ LIVE
STARTING ── camera fails ─────────────→ FAILED(reason)
LIVE(barcode) ── same code read twice in 1.5 s → FOUND   (camera stops)
LIVE(barcode) ── 5 consecutive detector errors / engine missing → FAILED(engine-failed)
LIVE(price) ── Read price ──→ READING   (frame captured, camera stops)
LIVE(price) ── Read price, no frame ──→ PRICE-PROBLEM   (camera stops)
READING ── candidates ──→ PRICES
READING ── none / timeout / reader unavailable ──→ PRICE-PROBLEM
LIVE / STARTING ── page hidden ──→ PAUSED   (camera stops)
PAUSED ── Resume ──→ STARTING
PAUSED / FAILED ── switch mode ──→ STARTING
FAILED ── Try again (when it can help) ──→ STARTING
PRICES / PRICE-PROBLEM ── Retake / Try again ──→ STARTING
STARTING / LIVE / FAILED (barcode mode) ── Type barcode ──→ TYPING
TYPING ── valid digits ──→ FOUND   (invalid digits show an error)
TYPING ── Use camera ──→ STARTING
price mode: STARTING / LIVE / FAILED / PRICES / PRICE-PROBLEM ── Type price ──→ price entry with the product carried
FAILED (barcode mode) ── Enter price without scanning ──→ price entry
FOUND ── Read price tag ──→ STARTING in price mode with the product carried
FOUND ── Scan another ──→ STARTING in barcode mode
any ── Cancel / Escape ──→ overlay closed; back to price entry when opened from it, otherwise focus on the scan action
```

PRICES → a chosen candidate opens price entry with the price pre-filled and marked as read from the tag. Nothing is added until the shopper confirms there.

Price reader preparation runs when price mode opens: IDLE → PREPARING(progress) → READY | FAILED. A failed preparation is retried by the next Read price.

FOUND by product code:

- known trade item → Read price tag (when available), enter the current price (price entry with the name and barcode) or Use the remembered price again;
- unknown trade item → optional name, optional tap-only online lookup, then Read price tag or price entry with the barcode;
- store code → Read price tag or price entry without a barcode;
- coupon → scan another or price entry without a barcode.

Online lookup: IDLE → LOADING → found | not-found | failed(offline, timeout, unavailable, invalid-response). A suggestion only fills the editable name field. Cancelling the overlay aborts a pending lookup.

## PWA update

The update prompt (`PwaUpdateNotice.tsx`) is ephemeral UI state outside the shopping lifecycle:

```text
NO_UPDATE ── new service worker installed and waiting ──→ UPDATE_WAITING
UPDATE_WAITING ── Later ──→ NO_UPDATE   (prompt dismissed, nothing reloads)
UPDATE_WAITING ── Update app ──→ new worker activates, page reloads
```

The prompt is shown only while the lifecycle is IDLE; in BOOTING, ACTIVE, COMPLETED_SUMMARY and RECOVERY it is withheld, so an update never reloads an open trip, a finished-trip summary or a recovery screen. Installing is the browser's own flow from the web manifest. The start screen (IDLE only) offers the browser's install prompt when the browser provides one; on Safari for iPhone and iPad it instead explains Add to Home Screen, but only while nothing is saved there, because a Home Screen app starts with its own empty storage and earlier trips would look lost. Dismissing the offer is remembered as a convenience preference.

## Planned transitions

Not current behaviour:

- reopen/continue the same completed trip;
- cloud/multi-device conflict resolution.

Define and test these only when the roadmap approves the capability.

## Review checklist

- Is this state canonical product state or ephemeral UI state?
- Can two lifecycle states accidentally be true at once?
- Can a failure path misrepresent durability?
- Is completion still history-first?
- Did a planned capability leak into current lifecycle?
- Did UI state enter the domain model unnecessarily?
