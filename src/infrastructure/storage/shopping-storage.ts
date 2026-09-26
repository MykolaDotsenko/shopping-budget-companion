import {
  isoTimestamp,
  sameTripContents,
  type ActiveTrip,
  type CompletedTrip,
  type IsoTimestamp,
} from "../../domain/shopping-trip";
import {
  ACTIVE_TRIP_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  HISTORICAL_NON_SHOPPING_STORAGE_KEYS,
} from "./shopping-storage-schema";
import {
  decodeActiveTripSnapshot,
  decodeHistorySnapshot,
  encodeActiveTripSnapshot,
  encodeHistorySnapshot,
  persistenceIssue,
  type PersistenceIssue,
  type PersistenceIssueCode,
} from "./shopping-storage-codec";

export {
  decodeActiveTripSnapshot,
  decodeHistorySnapshot,
  encodeActiveTripSnapshot,
  encodeHistorySnapshot,
} from "./shopping-storage-codec";

export type {
  DecodeActiveTripResult,
  DecodeHistoryResult,
  EncodeActiveTripResult,
  EncodeHistoryResult,
  PersistenceIssue,
  PersistenceIssueCode,
} from "./shopping-storage-codec";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type RestoreHistoryResult =
  | {
      readonly health: "healthy";
      readonly trips: readonly CompletedTrip[];
      readonly savedAt?: IsoTimestamp;
    }
  | {
      readonly health: "degraded";
      readonly trips: readonly CompletedTrip[];
      readonly issue: PersistenceIssue;
      readonly raw?: string;
    };

export type CompletionPersistenceResult =
  | {
      readonly ok: true;
      readonly trips: readonly CompletedTrip[];
    }
  | {
      readonly ok: false;
      readonly stage: "history-read" | "history-write" | "active-clear";
      readonly issue: PersistenceIssue;
      readonly historyPersisted: boolean;
      readonly trips?: readonly CompletedTrip[];
    };

export type RestoreActiveTripResult =
  | {
      readonly health: "healthy";
      readonly status: "empty";
      readonly trip: null;
    }
  | {
      readonly health: "healthy";
      readonly status: "restored";
      readonly trip: ActiveTrip;
      readonly savedAt: IsoTimestamp;
    }
  | {
      readonly health: "degraded";
      readonly status: "recovery-required";
      readonly trip: null;
      readonly issue: PersistenceIssue;
      readonly raw?: string;
    };

export type PersistenceWriteResult =
  | {
      readonly health: "healthy";
      readonly savedAt?: IsoTimestamp;
    }
  | {
      readonly health: "degraded";
      readonly issue: PersistenceIssue;
      readonly historyUnreadable?: true;
    };

export type LegacyRetirementResult =
  | {
      readonly health: "healthy";
      readonly retired: true;
    }
  | {
      readonly health: "degraded";
      readonly retired: false;
      readonly issue: PersistenceIssue;
    };

export type ShoppingPersistenceBootstrap =
  | {
      readonly health: "healthy";
      readonly activeTrip: ActiveTrip | null;
      readonly completedTrips: readonly CompletedTrip[];
      readonly legacyKeysRetired: boolean;
      readonly restoredSavedAt?: IsoTimestamp;
      readonly historySavedAt?: IsoTimestamp;
      readonly historyIssue?: PersistenceIssue;
      readonly reconciledCompletion?: true;
      readonly completionCleanupPending: boolean;
    }
  | {
      readonly health: "degraded";
      readonly activeTrip: ActiveTrip | null;
      readonly completedTrips: readonly CompletedTrip[];
      readonly legacyKeysRetired: boolean;
      readonly issue: PersistenceIssue;
      readonly activeTripUnreadable: boolean;
      readonly recoveryRaw?: string;
      readonly restoredSavedAt?: IsoTimestamp;
      readonly historySavedAt?: IsoTimestamp;
      readonly historyIssue?: PersistenceIssue;
      readonly reconciledCompletion?: true;
      readonly completionCleanupPending: boolean;
    };

export type SetAsideHistoryResult =
  | {
      readonly health: "healthy";
      readonly trips: readonly CompletedTrip[];
      readonly backupKey: string | null;
    }
  | {
      readonly health: "degraded";
      readonly issue: PersistenceIssue;
    };

export type SetAsideActiveTripResult =
  | {
      readonly health: "healthy";
      readonly backupKey: string | null;
    }
  | {
      readonly health: "degraded";
      readonly issue: PersistenceIssue;
    };

export const restoreActiveTrip = (
  storage: StorageLike | null | undefined,
): RestoreActiveTripResult => {
  if (storage === null || storage === undefined) {
    return {
      health: "degraded",
      status: "recovery-required",
      trip: null,
      issue: persistenceIssue("storage-unavailable"),
    };
  }

  let raw: string | null;

  try {
    raw = storage.getItem(ACTIVE_TRIP_STORAGE_KEY);
  } catch {
    return {
      health: "degraded",
      status: "recovery-required",
      trip: null,
      issue: persistenceIssue("read-failed"),
    };
  }

  if (raw === null) {
    return {
      health: "healthy",
      status: "empty",
      trip: null,
    };
  }

  const decoded = decodeActiveTripSnapshot(raw);

  if (!decoded.ok) {
    return {
      health: "degraded",
      status: "recovery-required",
      trip: null,
      issue: decoded.issue,
      raw,
    };
  }

  return {
    health: "healthy",
    status: "restored",
    trip: decoded.trip,
    savedAt: decoded.savedAt,
  };
};

export const restoreHistory = (
  storage: StorageLike | null | undefined,
): RestoreHistoryResult => {
  if (storage === null || storage === undefined) {
    return {
      health: "degraded",
      trips: [],
      issue: persistenceIssue(
        "storage-unavailable",
        HISTORY_STORAGE_KEY,
      ),
    };
  }

  let raw: string | null;

  try {
    raw = storage.getItem(HISTORY_STORAGE_KEY);
  } catch {
    return {
      health: "degraded",
      trips: [],
      issue: persistenceIssue("read-failed", HISTORY_STORAGE_KEY),
    };
  }

  if (raw === null) {
    return {
      health: "healthy",
      trips: [],
    };
  }

  const decoded = decodeHistorySnapshot(raw);

  if (!decoded.ok) {
    return {
      health: "degraded",
      trips: [],
      issue: decoded.issue,
      raw,
    };
  }

  if (decoded.invalidEntryCount > 0) {
    return {
      health: "degraded",
      trips: decoded.trips,
      issue: persistenceIssue(
        "invalid-history-entry",
        HISTORY_STORAGE_KEY,
      ),
      raw,
    };
  }

  return {
    health: "healthy",
    trips: decoded.trips,
    savedAt: decoded.savedAt,
  };
};

const writeFailureCode = (error: unknown): "storage-full" | "write-failed" =>
  error instanceof DOMException &&
  (error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ? "storage-full"
    : "write-failed";

const writeHistory = (
  storage: StorageLike | null | undefined,
  trips: readonly CompletedTrip[],
  savedAt: string,
): PersistenceWriteResult => {
  if (storage === null || storage === undefined) {
    return {
      health: "degraded",
      issue: persistenceIssue(
        "storage-unavailable",
        HISTORY_STORAGE_KEY,
      ),
    };
  }

  const encoded = encodeHistorySnapshot(trips, savedAt);

  if (!encoded.ok) {
    return {
      health: "degraded",
      issue: encoded.issue,
    };
  }

  try {
    storage.setItem(HISTORY_STORAGE_KEY, encoded.raw);
  } catch (error) {
    return {
      health: "degraded",
      issue: persistenceIssue(writeFailureCode(error), HISTORY_STORAGE_KEY),
    };
  }

  return {
    health: "healthy",
    savedAt: encoded.savedAt,
  };
};

const appendCompletedTripForCompletion = (
  history: readonly CompletedTrip[],
  trip: CompletedTrip,
):
  | { readonly ok: true; readonly trips: readonly CompletedTrip[] }
  | { readonly ok: false; readonly issue: PersistenceIssue } => {
  const existing = history.find((candidate) => candidate.id === trip.id);

  if (existing === undefined) {
    return {
      ok: true,
      trips: [...history, trip],
    };
  }

  if (!sameTripContents(existing, trip)) {
    return {
      ok: false,
      issue: persistenceIssue("history-conflict", HISTORY_STORAGE_KEY),
    };
  }

  return {
    ok: true,
    trips: history,
  };
};

export const completeTripPersistence = (
  storage: StorageLike | null | undefined,
  trip: CompletedTrip,
  savedAt: string,
): CompletionPersistenceResult => {
  const history = restoreHistory(storage);

  if (history.health === "degraded") {
    return {
      ok: false,
      stage: "history-read",
      issue: history.issue,
      historyPersisted: false,
    };
  }

  const appended = appendCompletedTripForCompletion(history.trips, trip);

  if (!appended.ok) {
    return {
      ok: false,
      stage: "history-write",
      issue: appended.issue,
      historyPersisted: false,
    };
  }

  const historyWrite = writeHistory(storage, appended.trips, savedAt);

  if (historyWrite.health === "degraded") {
    return {
      ok: false,
      stage: "history-write",
      issue: historyWrite.issue,
      historyPersisted: false,
    };
  }

  const activeClear = clearActiveTrip(storage);

  if (activeClear.health === "degraded") {
    return {
      ok: false,
      stage: "active-clear",
      issue: activeClear.issue,
      historyPersisted: true,
      trips: appended.trips,
    };
  }

  return { ok: true, trips: appended.trips };
};

export const replaceReadableHistory = (
  storage: StorageLike | null | undefined,
  trips: readonly CompletedTrip[],
  savedAt: string,
): PersistenceWriteResult => {
  const history = restoreHistory(storage);

  if (history.health === "degraded") {
    return {
      health: "degraded",
      issue: history.issue,
      historyUnreadable: true,
    };
  }

  return writeHistory(storage, trips, savedAt);
};

export const updateCompletedTripPersistence = (
  storage: StorageLike | null | undefined,
  trip: CompletedTrip,
  savedAt: string,
): PersistenceWriteResult => {
  const history = restoreHistory(storage);

  if (history.health === "degraded") {
    return {
      health: "degraded",
      issue: history.issue,
      historyUnreadable: true,
    };
  }

  const index = history.trips.findIndex(
    (candidate) => candidate.id === trip.id,
  );

  if (index < 0) {
    return {
      health: "degraded",
      issue: persistenceIssue("history-conflict", HISTORY_STORAGE_KEY),
    };
  }

  const nextTrips = history.trips.map((candidate, candidateIndex) =>
    candidateIndex === index ? trip : candidate,
  );

  return writeHistory(storage, nextTrips, savedAt);
};

export const writeActiveTrip = (
  storage: StorageLike | null | undefined,
  trip: ActiveTrip,
  savedAt: string,
): PersistenceWriteResult => {
  if (storage === null || storage === undefined) {
    return {
      health: "degraded",
      issue: persistenceIssue("storage-unavailable"),
    };
  }

  const encoded = encodeActiveTripSnapshot(trip, savedAt);

  if (!encoded.ok) {
    return {
      health: "degraded",
      issue: encoded.issue,
    };
  }

  try {
    storage.setItem(ACTIVE_TRIP_STORAGE_KEY, encoded.raw);
  } catch (error) {
    return {
      health: "degraded",
      issue: persistenceIssue(writeFailureCode(error)),
    };
  }

  return {
    health: "healthy",
    savedAt: encoded.savedAt,
  };
};

export const clearActiveTrip = (
  storage: StorageLike | null | undefined,
): PersistenceWriteResult => {
  if (storage === null || storage === undefined) {
    return {
      health: "degraded",
      issue: persistenceIssue("storage-unavailable"),
    };
  }

  try {
    storage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
  } catch {
    return {
      health: "degraded",
      issue: persistenceIssue("remove-failed"),
    };
  }

  return {
    health: "healthy",
  };
};

export const retireHistoricalNonShoppingKeys = (
  storage: StorageLike | null | undefined,
): LegacyRetirementResult => {
  if (storage === null || storage === undefined) {
    return {
      health: "degraded",
      retired: false,
      issue: persistenceIssue(
        "storage-unavailable",
        HISTORICAL_NON_SHOPPING_STORAGE_KEYS[0],
      ),
    };
  }

  let failedKey: string | null = null;

  for (const key of HISTORICAL_NON_SHOPPING_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      failedKey ??= key;
    }
  }

  if (failedKey !== null) {
    return {
      health: "degraded",
      retired: false,
      issue: persistenceIssue("legacy-retirement-failed", failedKey),
    };
  }

  return {
    health: "healthy",
    retired: true,
  };
};

export const bootstrapShoppingPersistence = (
  storage: StorageLike | null | undefined,
): ShoppingPersistenceBootstrap => {
  const restored = restoreActiveTrip(storage);
  const history = restoreHistory(storage);
  const historyFields =
    history.health === "degraded"
      ? { historyIssue: history.issue }
      : history.savedAt === undefined
        ? {}
        : { historySavedAt: history.savedAt };

  if (restored.health === "degraded") {
    return {
      health: "degraded",
      activeTrip: null,
      completedTrips: history.trips,
      legacyKeysRetired: false,
      completionCleanupPending: false,
      issue: restored.issue,
      activeTripUnreadable: true,
      ...(restored.raw === undefined
        ? {}
        : { recoveryRaw: restored.raw }),
      ...historyFields,
    };
  }

  const openTrip = restored.trip;
  let activeTrip = openTrip;
  let reconciledCompletion = false;
  let reconciliationIssue: PersistenceIssue | null = null;

  if (
    openTrip !== null &&
    history.trips.some((trip) => sameTripContents(openTrip, trip))
  ) {
    const clearResult = clearActiveTrip(storage);
    activeTrip = null;
    reconciledCompletion = true;

    if (clearResult.health === "degraded") {
      reconciliationIssue = clearResult.issue;
    }
  }

  const restoredFields = {
    ...(restored.status === "restored"
      ? { restoredSavedAt: restored.savedAt }
      : {}),
    ...historyFields,
    ...(reconciledCompletion ? { reconciledCompletion: true as const } : {}),
  };

  const retirement =
    history.health === "healthy"
      ? retireHistoricalNonShoppingKeys(storage)
      : null;

  if (reconciliationIssue !== null) {
    return {
      health: "degraded",
      activeTrip,
      completedTrips: history.trips,
      legacyKeysRetired: retirement?.health === "healthy",
      completionCleanupPending: true,
      issue: reconciliationIssue,
      activeTripUnreadable: false,
      ...restoredFields,
    };
  }

  if (retirement?.health === "degraded") {
    return {
      health: "degraded",
      activeTrip,
      completedTrips: history.trips,
      legacyKeysRetired: false,
      completionCleanupPending: false,
      issue: retirement.issue,
      activeTripUnreadable: false,
      ...restoredFields,
    };
  }

  return {
    health: "healthy",
    activeTrip,
    completedTrips: history.trips,
    legacyKeysRetired: retirement !== null,
    completionCleanupPending: false,
    ...restoredFields,
  };
};

export const SET_ASIDE_STORAGE_KEY_PREFIX = "budget-cart:set-aside:";

const setAsideKeyFor = (
  storage: StorageLike,
  sourceKey: string,
  setAsideAt: string,
): string => {
  const base = `${SET_ASIDE_STORAGE_KEY_PREFIX}${sourceKey.replace(
    /^budget-cart:/,
    "",
  )}:${setAsideAt}`;
  let candidate = base;

  for (let attempt = 2; storage.getItem(candidate) !== null; attempt += 1) {
    candidate = `${base}:${attempt}`;
  }

  return candidate;
};

const preserveRawRecord = (
  storage: StorageLike,
  sourceKey: string,
  raw: string,
  reason: PersistenceIssueCode,
  setAsideAt: string,
):
  | { readonly ok: true; readonly backupKey: string }
  | { readonly ok: false; readonly issue: PersistenceIssue } => {
  let backupKey: string;

  try {
    backupKey = setAsideKeyFor(storage, sourceKey, setAsideAt);
  } catch {
    return { ok: false, issue: persistenceIssue("read-failed", sourceKey) };
  }

  const backup = JSON.stringify({
    schemaVersion: 1,
    setAsideAt,
    sourceKey,
    reason,
    raw,
  });

  try {
    storage.setItem(backupKey, backup);

    if (storage.getItem(backupKey) !== backup) {
      return { ok: false, issue: persistenceIssue("write-failed", backupKey) };
    }
  } catch {
    return { ok: false, issue: persistenceIssue("write-failed", backupKey) };
  }

  return { ok: true, backupKey };
};

export const setAsideDamagedHistory = (
  storage: StorageLike | null | undefined,
  setAsideAtInput: string,
): SetAsideHistoryResult => {
  if (storage === null || storage === undefined) {
    return {
      health: "degraded",
      issue: persistenceIssue("storage-unavailable", HISTORY_STORAGE_KEY),
    };
  }

  const setAsideAt = isoTimestamp(setAsideAtInput);

  if (!setAsideAt.ok) {
    return {
      health: "degraded",
      issue: persistenceIssue("serialization-failed", HISTORY_STORAGE_KEY),
    };
  }

  let raw: string | null;

  try {
    raw = storage.getItem(HISTORY_STORAGE_KEY);
  } catch {
    return {
      health: "degraded",
      issue: persistenceIssue("read-failed", HISTORY_STORAGE_KEY),
    };
  }

  if (raw === null) {
    return { health: "healthy", trips: [], backupKey: null };
  }

  const decoded = decodeHistorySnapshot(raw);

  if (decoded.ok && decoded.invalidEntryCount === 0) {
    return { health: "healthy", trips: decoded.trips, backupKey: null };
  }

  const kept = decoded.ok ? decoded.trips : [];
  const preserved = preserveRawRecord(
    storage,
    HISTORY_STORAGE_KEY,
    raw,
    decoded.ok ? "invalid-history-entry" : decoded.issue.code,
    setAsideAt.value,
  );

  if (!preserved.ok) {
    return { health: "degraded", issue: preserved.issue };
  }

  const written = writeHistory(storage, kept, setAsideAt.value);

  if (written.health === "degraded") {
    return { health: "degraded", issue: written.issue };
  }

  return { health: "healthy", trips: kept, backupKey: preserved.backupKey };
};

export const setAsideUnreadableActiveTrip = (
  storage: StorageLike | null | undefined,
  setAsideAtInput: string,
): SetAsideActiveTripResult => {
  if (storage === null || storage === undefined) {
    return {
      health: "degraded",
      issue: persistenceIssue("storage-unavailable"),
    };
  }

  const setAsideAt = isoTimestamp(setAsideAtInput);

  if (!setAsideAt.ok) {
    return {
      health: "degraded",
      issue: persistenceIssue("serialization-failed"),
    };
  }

  let raw: string | null;

  try {
    raw = storage.getItem(ACTIVE_TRIP_STORAGE_KEY);
  } catch {
    return { health: "degraded", issue: persistenceIssue("read-failed") };
  }

  if (raw === null) {
    return { health: "healthy", backupKey: null };
  }

  const decoded = decodeActiveTripSnapshot(raw);

  if (decoded.ok) {
    return { health: "healthy", backupKey: null };
  }

  const preserved = preserveRawRecord(
    storage,
    ACTIVE_TRIP_STORAGE_KEY,
    raw,
    decoded.issue.code,
    setAsideAt.value,
  );

  if (!preserved.ok) {
    return { health: "degraded", issue: preserved.issue };
  }

  const cleared = clearActiveTrip(storage);

  if (cleared.health === "degraded") {
    return { health: "degraded", issue: cleared.issue };
  }

  return { health: "healthy", backupKey: preserved.backupKey };
};
