import type {
  ActiveTripBootstrapResult,
  ActiveTripPersistencePort,
  ActiveTripSaveResult,
  CompletedHistoryReadResult,
  CompletionSaveResult,
  HistorySetAsideResult,
  PersistenceProblem,
} from "../../application/shopping-app-controller";
import type {
  ActiveTrip,
  CompletedTrip,
  IsoTimestamp,
} from "../../domain/shopping-trip";
import {
  bootstrapShoppingPersistence,
  clearActiveTrip,
  completeTripPersistence,
  restoreHistory,
  setAsideDamagedHistory,
  setAsideUnreadableActiveTrip,
  replaceReadableHistory,
  updateCompletedTripPersistence,
  writeActiveTrip,
  type PersistenceIssue,
  type PersistenceWriteResult,
  type StorageLike,
} from "./shopping-storage";
import {
  ACTIVE_TRIP_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
} from "./shopping-storage-schema";
import { createStorageRevision } from "./storage-revision";

const toSaveResult = (
  result: PersistenceWriteResult,
): ActiveTripSaveResult => {
  if (result.health === "healthy") {
    return { ok: true };
  }

  return {
    ok: false,
    issue: toPersistenceProblem(result.issue),
    ...(result.historyUnreadable === true ? { stage: "history-read" } : {}),
  };
};

const toPersistenceProblem = (
  issue: PersistenceIssue,
): PersistenceProblem => ({
  code: issue.code,
  storageKey: issue.storageKey,
  ...(issue.schemaVersion === undefined
    ? {}
    : { schemaVersion: issue.schemaVersion }),
});


export const createActiveTripPersistencePort = (
  storage: StorageLike | null | undefined,
): ActiveTripPersistencePort => {
  const revision = createStorageRevision(storage, [
    ACTIVE_TRIP_STORAGE_KEY,
    HISTORY_STORAGE_KEY,
  ]);
  const tracked = <T>(result: T): T => {
    revision.remember();
    return result;
  };

  return {
    isCurrent(): boolean {
      return revision.isCurrent();
    },

    bootstrap(): ActiveTripBootstrapResult {
      const result = tracked(bootstrapShoppingPersistence(storage));

      const historyFields =
        result.historyIssue === undefined
          ? {}
          : { historyIssue: toPersistenceProblem(result.historyIssue) };

      if (result.health === "healthy") {
        return {
          ok: true,
          activeTrip: result.activeTrip,
          completedTrips: result.completedTrips,
          completionCleanupPending:
            result.completionCleanupPending,
          ...historyFields,
        };
      }

      return {
        ok: false,
        activeTrip: result.activeTrip,
        completedTrips: result.completedTrips,
        completionCleanupPending:
          result.completionCleanupPending,
        issue: toPersistenceProblem(result.issue),
        recoveryRequired: result.activeTripUnreadable,
        ...(result.recoveryRaw === undefined
          ? {}
          : { recoveryRaw: result.recoveryRaw }),
        ...historyFields,
      };
    },

    readCompletedHistory(): CompletedHistoryReadResult {
      const result = tracked(restoreHistory(storage));

      if (result.health === "healthy") {
        return { ok: true, completedTrips: result.trips };
      }

      return {
        ok: false,
        completedTrips: result.trips,
        issue: toPersistenceProblem(result.issue),
      };
    },

    setAsideDamagedHistory(setAsideAt: IsoTimestamp): HistorySetAsideResult {
      const result = tracked(setAsideDamagedHistory(storage, setAsideAt));

      if (result.health === "healthy") {
        return { ok: true, completedTrips: result.trips };
      }

      return { ok: false, issue: toPersistenceProblem(result.issue) };
    },

    setAsideUnreadableActiveTrip(
      setAsideAt: IsoTimestamp,
    ): ActiveTripSaveResult {
      const result = tracked(setAsideUnreadableActiveTrip(storage, setAsideAt));

      if (result.health === "healthy") {
        return { ok: true };
      }

      return { ok: false, issue: toPersistenceProblem(result.issue) };
    },

    save(
      trip: ActiveTrip,
      savedAt: IsoTimestamp,
    ): ActiveTripSaveResult {
      const result = tracked(writeActiveTrip(storage, trip, savedAt));

      if (result.health === "healthy") {
        return { ok: true };
      }

      return {
        ok: false,
        issue: toPersistenceProblem(result.issue),
      };
    },

    complete(
      trip: CompletedTrip,
      savedAt: IsoTimestamp,
    ): CompletionSaveResult {
      const result = tracked(completeTripPersistence(storage, trip, savedAt));

      if (result.ok) {
        return { ok: true, completedTrips: result.trips };
      }

      return {
        ok: false,
        stage: result.stage,
        issue: toPersistenceProblem(result.issue),
        historyPersisted: result.historyPersisted,
        ...(result.trips === undefined ? {} : { completedTrips: result.trips }),
      };
    },

    saveCompleted(
      trip: CompletedTrip,
      savedAt: IsoTimestamp,
    ): ActiveTripSaveResult {
      const result = tracked(
        updateCompletedTripPersistence(storage, trip, savedAt),
      );

      return toSaveResult(result);
    },

    replaceCompletedHistory(
      trips: readonly CompletedTrip[],
      savedAt: IsoTimestamp,
    ): ActiveTripSaveResult {
      return toSaveResult(
        tracked(replaceReadableHistory(storage, trips, savedAt)),
      );
    },

    clearCompletedActive(): ActiveTripSaveResult {
      const result = tracked(clearActiveTrip(storage));

      if (result.health === "healthy") {
        return { ok: true };
      }

      return {
        ok: false,
        issue: toPersistenceProblem(result.issue),
      };
    },
  };
};
