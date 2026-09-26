import type { MinorUnits } from "../domain/money";
import {
  mergePriceMemories,
  priceMemoryRecordsFromCompletedTrip,
} from "../domain/price-memory";
import {
  laterTimestamp,
  latestTripTimestamp,
  reduceTrip,
  tripId,
} from "../domain/shopping-trip";
import type { PriceMemoryPersistencePort } from "./price-memory-port";
import { SESSION_ONLY_PERSISTENCE_PORT } from "./session-only-persistence";
import type {
  AppCommandResult,
  Clock,
  IdGenerator,
  ShoppingAppState,
  ShoppingPersistencePort,
} from "./shopping-app-contracts";
import {
  HEALTHY_PERSISTENCE,
  applicationError,
  degradedPersistence,
  failure,
  lifecycleBlock,
  requireActiveTrip,
  success,
  upsertCompletedTrip,
  withUnreadableHistory,
} from "./shopping-app-support";

export interface CompletionPorts {
  persistence: ShoppingPersistencePort;
  priceMemory: PriceMemoryPersistencePort;
}

interface CompletionUseCaseDependencies {
  readonly getState: () => ShoppingAppState;
  readonly publish: (nextState: ShoppingAppState) => ShoppingAppState;
  readonly ports: Readonly<CompletionPorts>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface CompletionUseCases {
  readonly completeTrip: () => AppCommandResult;
  readonly setActualCheckout: (
    actualCheckoutMinor: MinorUnits,
  ) => AppCommandResult;
  readonly dismissCompletedSummary: () => AppCommandResult;
}

export const createCompletionUseCases = ({
  getState,
  publish,
  ports,
  clock,
  ids,
}: CompletionUseCaseDependencies): CompletionUseCases => {
  const completeTrip = (): AppCommandResult => {
    const state = getState();

    const active = requireActiveTrip(state);

    if (!active.ok) {
      return failure(state, active.error);
    }

    const completedAt = laterTimestamp(
      clock.now(),
      latestTripTimestamp(active.trip),
    );
    const tripResult = reduceTrip(active.trip, {
      type: "complete-trip",
      completedAt,
    });

    if (!tripResult.ok) {
      return failure(state, tripResult.error);
    }

    if (tripResult.value.status !== "completed") {
      return failure(state, applicationError("no-completed-summary"));
    }

    let openTrip = active.trip;
    let undo = state.undo;
    let completedTrip = tripResult.value;
    let persistenceResult = ports.persistence.complete(
      completedTrip,
      completedAt,
    );

    if (
      !persistenceResult.ok &&
      persistenceResult.stage === "history-write" &&
      persistenceResult.issue.code === "history-conflict"
    ) {
      const forkedId = tripId(ids.tripId());

      if (forkedId.ok) {
        const forkedOpenTrip = { ...openTrip, id: forkedId.value };
        const forkSave = ports.persistence.save(forkedOpenTrip, completedAt);

        if (forkSave.ok) {
          openTrip = forkedOpenTrip;
          undo =
            undo === null
              ? null
              : {
                  ...undo,
                  previousTrip: { ...undo.previousTrip, id: forkedId.value },
                };
          completedTrip = { ...completedTrip, id: forkedId.value };
          persistenceResult = ports.persistence.complete(
            completedTrip,
            completedAt,
          );
        } else {
          persistenceResult = {
            ok: false,
            stage: "history-write",
            issue: forkSave.issue,
            historyPersisted: false,
          };
        }
      }
    }

    if (
      !persistenceResult.ok &&
      persistenceResult.stage === "history-read"
    ) {
      const readable = ports.persistence.readCompletedHistory();
      const nextState = publish({
        ...withUnreadableHistory(
          state,
          persistenceResult.issue,
          readable.completedTrips,
          completedAt,
        ),
        activeTrip: openTrip,
        undo,
      });

      return failure(nextState, applicationError("history-unreadable"));
    }

    const sessionOnly = ports.persistence === SESSION_ONLY_PERSISTENCE_PORT;

    if (
      !persistenceResult.ok &&
      !persistenceResult.historyPersisted &&
      !sessionOnly
    ) {
      const nextState = publish({
        ...state,
        activeTrip: openTrip,
        undo,
        persistence: degradedPersistence(
          persistenceResult.issue,
          completedAt,
        ),
        completionCleanupPending: false,
      });

      return failure(
        nextState,
        applicationError("completion-not-saved"),
      );
    }

    const cleanupPending =
      !persistenceResult.ok &&
      persistenceResult.stage === "active-clear";
    const completedTrips =
      persistenceResult.completedTrips === undefined
        ? upsertCompletedTrip(state.completedTrips, completedTrip)
        : Object.freeze([...persistenceResult.completedTrips]);
    const completedSummary =
      completedTrips.find((trip) => trip.id === completedTrip.id) ??
      completedTrip;
    let nextState = publish({
      lifecycle: "completed-summary",
      activeTrip: null,
      completedSummary,
      completedTrips,
      completionCleanupPending: cleanupPending,
      historyIntegrity: HEALTHY_PERSISTENCE,
      persistence: persistenceResult.ok
        ? HEALTHY_PERSISTENCE
        : degradedPersistence(
            persistenceResult.issue,
            completedAt,
          ),
      priceMemories: state.priceMemories,
      priceMemoryPersistence: state.priceMemoryPersistence,
      barcodeLinks: state.barcodeLinks,
      barcodeLinkPersistence: state.barcodeLinkPersistence,
      undo: null,
      recovery: null,
    });

    const observedMemories =
      priceMemoryRecordsFromCompletedTrip(completedSummary);
    const mergedMemories = mergePriceMemories(
      nextState.priceMemories,
      observedMemories,
      clock.now(),
    );

    if (mergedMemories !== nextState.priceMemories) {
      const canAttemptMemoryWrite =
        nextState.priceMemoryPersistence.status === "healthy" ||
        nextState.priceMemoryPersistence.issue.code === "write-failed";

      if (canAttemptMemoryWrite) {
        const memorySavedAt = clock.now();
        const memorySave = ports.priceMemory.save(
          mergedMemories,
          memorySavedAt,
        );

        nextState = publish({
          ...nextState,
          priceMemories: mergedMemories,
          priceMemoryPersistence: memorySave.ok
            ? HEALTHY_PERSISTENCE
            : degradedPersistence(
                memorySave.issue,
                memorySavedAt,
              ),
        });
      } else {
        nextState = publish({
          ...nextState,
          priceMemories: mergedMemories,
        });
      }
    }

    return success(
      nextState,
      true,
      sessionOnly ? "memory-only" : "persisted",
    );
  };

  const setActualCheckout = (
    actualCheckoutMinor: MinorUnits,
  ): AppCommandResult => {
    const state = getState();

    const blocked = lifecycleBlock(state);

    if (blocked !== null) {
      return failure(state, blocked);
    }

    if (
      state.lifecycle !== "completed-summary" ||
      state.completedSummary === null
    ) {
      return failure(state, applicationError("no-completed-summary"));
    }

    if (
      state.completedSummary.actualCheckoutMinor ===
      actualCheckoutMinor
    ) {
      return success(state, false, "unchanged");
    }

    const tripResult = reduceTrip(state.completedSummary, {
      type: "set-actual-checkout",
      actualCheckoutMinor,
    });

    if (!tripResult.ok) {
      return failure(state, tripResult.error);
    }

    if (tripResult.value.status !== "completed") {
      return failure(state, applicationError("no-completed-summary"));
    }

    const now = clock.now();
    const saveResult = ports.persistence.saveCompleted(
      tripResult.value,
      now,
    );

    if (!saveResult.ok && saveResult.stage === "history-read") {
      const readable = ports.persistence.readCompletedHistory();
      const nextState = publish({
        ...withUnreadableHistory(
          state,
          saveResult.issue,
          readable.completedTrips,
          now,
        ),
        completedSummary: tripResult.value,
      });

      return success(nextState, true, "memory-only");
    }

    if (!saveResult.ok && saveResult.issue.code === "history-conflict") {
      return failure(state, applicationError("completed-trip-not-found"));
    }

    const completedTrips = upsertCompletedTrip(
      state.completedTrips,
      tripResult.value,
    );

    const shouldStayDegraded =
      state.completionCleanupPending || !saveResult.ok;
    const issue = !saveResult.ok
      ? saveResult.issue
      : state.persistence.status === "degraded"
        ? state.persistence.issue
        : null;
    const nextState = publish({
      ...state,
      completedSummary: tripResult.value,
      completedTrips,
      persistence:
        shouldStayDegraded && issue !== null
          ? degradedPersistence(
              issue,
              state.persistence.status === "degraded"
                ? state.persistence.since
                : now,
            )
          : HEALTHY_PERSISTENCE,
    });

    return success(
      nextState,
      true,
      saveResult.ok ? "persisted" : "memory-only",
    );
  };

  const dismissCompletedSummary = (): AppCommandResult => {
    const state = getState();

    if (
      state.lifecycle !== "completed-summary" ||
      state.completedSummary === null
    ) {
      return failure(state, applicationError("no-completed-summary"));
    }

    const sessionOnly = ports.persistence === SESSION_ONLY_PERSISTENCE_PORT;

    if (state.completionCleanupPending) {
      return failure(
        state,
        applicationError("completion-not-saved"),
      );
    }

    if (state.persistence.status === "degraded" && !sessionOnly) {
      const summaryId = state.completedSummary.id;
      const durable = ports.persistence.readCompletedHistory();

      if (
        !durable.ok ||
        !durable.completedTrips.some((trip) => trip.id === summaryId)
      ) {
        return failure(
          state,
          applicationError("completion-not-saved"),
        );
      }

      const nextState = publish({
        ...state,
        lifecycle: "idle",
        activeTrip: null,
        completedSummary: null,
        completedTrips: Object.freeze([...durable.completedTrips]),
        persistence: HEALTHY_PERSISTENCE,
        undo: null,
        recovery: null,
      });

      return success(nextState, true, "persisted");
    }

    const nextState = publish({
      ...state,
      lifecycle: "idle",
      activeTrip: null,
      completedSummary: null,
      undo: null,
      recovery: null,
    });

    return success(nextState, true, "unchanged");
  };

  return {
    completeTrip,
    setActualCheckout,
    dismissCompletedSummary,
  };
};
