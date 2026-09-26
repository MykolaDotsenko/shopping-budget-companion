import type { BarcodeLink } from "../domain/barcode-link";
import type { MinorUnits } from "../domain/money";
import type {
  PriceMemoryId,
  PriceMemoryRecord,
} from "../domain/price-memory";
import type {
  BarcodeSymbology,
  Gtin,
  ProductCode,
  ProductCodeError,
} from "../domain/product-code";
import type {
  ActiveTrip,
  CompletedTrip,
  DomainError,
  IsoTimestamp,
  ItemId,
  TripCommand,
  TripId,
} from "../domain/shopping-trip";
import type { BarcodeLinkPersistencePort } from "./barcode-ports";
import type { PriceMemoryPersistencePort } from "./price-memory-port";

export interface PersistenceProblem {
  readonly code: string;
  readonly storageKey?: string;
  readonly schemaVersion?: number;
}

export interface ShoppingPersistencePort {
  isCurrent?(): boolean;
  bootstrap(): ActiveTripBootstrapResult;
  readCompletedHistory(): CompletedHistoryReadResult;
  setAsideDamagedHistory(setAsideAt: IsoTimestamp): HistorySetAsideResult;
  setAsideUnreadableActiveTrip(
    setAsideAt: IsoTimestamp,
  ): ActiveTripSaveResult;
  save(
    trip: ActiveTrip,
    savedAt: IsoTimestamp,
  ): ActiveTripSaveResult;
  complete(
    trip: CompletedTrip,
    savedAt: IsoTimestamp,
  ): CompletionSaveResult;
  saveCompleted(
    trip: CompletedTrip,
    savedAt: IsoTimestamp,
  ): ActiveTripSaveResult;
  replaceCompletedHistory(
    trips: readonly CompletedTrip[],
    savedAt: IsoTimestamp,
  ): ActiveTripSaveResult;
  clearCompletedActive(): ActiveTripSaveResult;
}

export type ActiveTripPersistencePort = ShoppingPersistencePort;

export type ActiveTripBootstrapResult =
  | {
      readonly ok: true;
      readonly activeTrip: ActiveTrip | null;
      readonly completedTrips: readonly CompletedTrip[];
      readonly completionCleanupPending: boolean;
      readonly historyIssue?: PersistenceProblem;
    }
  | {
      readonly ok: false;
      readonly activeTrip: ActiveTrip | null;
      readonly completedTrips: readonly CompletedTrip[];
      readonly completionCleanupPending: boolean;
      readonly issue: PersistenceProblem;
      readonly recoveryRequired: boolean;
      readonly recoveryRaw?: string;
      readonly historyIssue?: PersistenceProblem;
    };

export type CompletedHistoryReadResult =
  | {
      readonly ok: true;
      readonly completedTrips: readonly CompletedTrip[];
    }
  | {
      readonly ok: false;
      readonly completedTrips: readonly CompletedTrip[];
      readonly issue: PersistenceProblem;
    };

export type HistorySetAsideResult =
  | {
      readonly ok: true;
      readonly completedTrips: readonly CompletedTrip[];
    }
  | {
      readonly ok: false;
      readonly issue: PersistenceProblem;
    };

export type ActiveTripSaveResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issue: PersistenceProblem;
      readonly stage?: "history-read";
    };

export type CompletionSaveResult =
  | {
      readonly ok: true;
      readonly completedTrips?: readonly CompletedTrip[];
    }
  | {
      readonly ok: false;
      readonly stage: "history-read" | "history-write" | "active-clear";
      readonly issue: PersistenceProblem;
      readonly historyPersisted: boolean;
      readonly completedTrips?: readonly CompletedTrip[];
    };

export interface Clock {
  now(): IsoTimestamp;
}

export interface IdGenerator {
  tripId(): string;
  itemId(): string;
}

export type AppLifecycle =
  | "booting"
  | "idle"
  | "active"
  | "completed-summary"
  | "recovery";

export type PersistenceHealth =
  | { readonly status: "healthy" }
  | {
      readonly status: "degraded";
      readonly issue: PersistenceProblem;
      readonly since: IsoTimestamp;
    };

export interface UndoState {
  readonly previousTrip: ActiveTrip;
  readonly description: "add" | "edit" | "remove";
}

export interface RecoveryState {
  readonly issue: PersistenceProblem;
  readonly raw?: string;
}

export interface ShoppingAppState {
  readonly lifecycle: AppLifecycle;
  readonly activeTrip: ActiveTrip | null;
  readonly completedSummary: CompletedTrip | null;
  readonly completedTrips: readonly CompletedTrip[];
  readonly completionCleanupPending: boolean;
  readonly persistence: PersistenceHealth;
  readonly historyIntegrity: PersistenceHealth;
  readonly priceMemories: readonly PriceMemoryRecord[];
  readonly priceMemoryPersistence: PersistenceHealth;
  readonly barcodeLinks: readonly BarcodeLink[];
  readonly barcodeLinkPersistence: PersistenceHealth;
  readonly undo: UndoState | null;
  readonly recovery: RecoveryState | null;
}

export interface StartTripInput {
  readonly budgetMinor: MinorUnits;
  readonly safetyBufferMinor?: MinorUnits;
}

export interface AddManualItemInput {
  readonly unitPriceMinor: MinorUnits;
  readonly quantity: number;
  readonly label?: string;
  readonly barcode?: Gtin;
}

export interface AddRememberedItemInput {
  readonly memoryId: PriceMemoryId;
  readonly quantity?: number;
  readonly barcode?: Gtin;
}

export type BarcodeIdentification =
  | { readonly ok: false; readonly error: ProductCodeError }
  | {
      readonly ok: true;
      readonly code: ProductCode;
      readonly label: string | null;
      readonly remembered: PriceMemoryRecord | null;
    };

export interface UpdateSpendingPlanInput {
  readonly budgetMinor: MinorUnits;
  readonly safetyBufferMinor: MinorUnits;
}

export interface UpdateManualItemInput {
  readonly itemId: ItemId;
  readonly unitPriceMinor: MinorUnits;
  readonly quantity: number;
  readonly label?: string | null;
}

export type ActiveTripCommand = Exclude<
  TripCommand,
  { readonly type: "complete-trip" } | { readonly type: "set-actual-checkout" }
>;

export type ApplicationError =
  | {
      readonly kind: "application";
      readonly code:
        | "not-ready"
        | "active-trip-exists"
        | "recovery-required"
        | "no-active-trip"
        | "no-completed-summary"
        | "completed-summary-open"
        | "completion-not-saved"
        | "completed-trip-not-found"
        | "repeat-source-unavailable"
        | "history-write-unavailable"
        | "price-memory-write-unavailable"
        | "price-memory-not-found"
        | "history-unreadable"
        | "nothing-to-set-aside"
        | "set-aside-failed"
        | "recovery-not-open"
        | "trip-not-empty"
        | "discard-not-saved";
    }
  | DomainError;

export type Durability = "persisted" | "memory-only" | "unchanged";

export type AppCommandResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly durability: Durability;
      readonly state: ShoppingAppState;
    }
  | {
      readonly ok: false;
      readonly error: ApplicationError;
      readonly state: ShoppingAppState;
    };

export interface ShoppingAppController {
  readonly getSnapshot: () => ShoppingAppState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly bootstrap: () => ShoppingAppState;
  readonly refreshFromStorage: () => AppCommandResult;
  readonly startTrip: (input: StartTripInput) => AppCommandResult;
  readonly startTripFromCompleted: (tripId: TripId) => AppCommandResult;
  readonly discardEmptyTrip: () => AppCommandResult;
  readonly addManualItem: (input: AddManualItemInput) => AppCommandResult;
  readonly addRememberedItem: (
    input: AddRememberedItemInput,
  ) => AppCommandResult;
  readonly updateSpendingPlan: (
    input: UpdateSpendingPlanInput,
  ) => AppCommandResult;
  readonly updateManualItem: (
    input: UpdateManualItemInput,
  ) => AppCommandResult;
  readonly removeItem: (itemId: ItemId) => AppCommandResult;
  readonly undo: () => AppCommandResult;
  readonly completeTrip: () => AppCommandResult;
  readonly setActualCheckout: (
    actualCheckoutMinor: MinorUnits,
  ) => AppCommandResult;
  readonly dismissCompletedSummary: () => AppCommandResult;
  readonly deleteCompletedTrip: (tripId: TripId) => AppCommandResult;
  readonly setCompletedTripCheckout: (
    tripId: TripId,
    actualCheckoutMinor: MinorUnits,
  ) => AppCommandResult;
  readonly deleteOldestCompletedTrips: (count: number) => AppCommandResult;
  readonly clearCompletedHistory: () => AppCommandResult;
  readonly clearPriceMemory: () => AppCommandResult;
  readonly retryPersistence: () => AppCommandResult;
  readonly retryHistoryRead: () => AppCommandResult;
  readonly setAsideDamagedHistory: () => AppCommandResult;
  readonly setAsideUnreadableActiveTrip: () => AppCommandResult;
  readonly continueWithoutSaving: () => AppCommandResult;
  readonly dispatch: (command: ActiveTripCommand) => AppCommandResult;
  readonly identifyBarcode: (
    rawValue: string,
    symbology: BarcodeSymbology | null,
  ) => BarcodeIdentification;
}

export interface ShoppingAppControllerDependencies {
  readonly persistence: ShoppingPersistencePort;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly priceMemoryPersistence?: PriceMemoryPersistencePort;
  readonly barcodeLinkPersistence?: BarcodeLinkPersistencePort;
}
