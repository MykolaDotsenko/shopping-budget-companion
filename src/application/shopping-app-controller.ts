import {
  createBarcodeLink,
  findBarcodeLink,
  rememberedPriceForLabel,
  upsertBarcodeLink,
} from "../domain/barcode-link";
import type { MinorUnits } from "../domain/money";
import {
  parseProductCode,
  type BarcodeSymbology,
  type Gtin,
} from "../domain/product-code";
import {
  createActiveTrip,
  createCartItem,
  latestTripTimestamp,
  laterTimestamp,
  reduceTrip,
  sameTripContents,
  type ActiveTrip,
  type CompletedTrip,
  type IsoTimestamp,
  type ItemId,
  type TripId,
} from "../domain/shopping-trip";
import {
  EMPTY_BARCODE_LINK_PERSISTENCE_PORT,
  type BarcodeLinkPersistencePort,
} from "./barcode-ports";
import { EMPTY_PRICE_MEMORY_PERSISTENCE_PORT } from "./price-memory-port";
import {
  SESSION_ONLY_BARCODE_LINK_PORT,
  SESSION_ONLY_ISSUE,
  SESSION_ONLY_PERSISTENCE_PORT,
  SESSION_ONLY_PRICE_MEMORY_PORT,
} from "./session-only-persistence";
import {
  createCompletionUseCases,
  type CompletionPorts,
} from "./shopping-app-completion";
import {
  EMPTY_BARCODE_LINKS,
  EMPTY_PRICE_MEMORIES,
  HEALTHY_PERSISTENCE,
  applicationError,
  canSetAsideActiveTrip,
  canSetAsideHistory,
  degradedPersistence,
  failure,
  freezeState,
  initialState,
  lifecycleBlock,
  recoveryState,
  requireActiveTrip,
  success,
  upsertCompletedTrip,
  withUnreadableHistory,
} from "./shopping-app-support";
import type {
  ActiveTripCommand,
  AddManualItemInput,
  AddRememberedItemInput,
  AppCommandResult,
  BarcodeIdentification,
  PersistenceProblem,
  ShoppingAppController,
  ShoppingAppControllerDependencies,
  ShoppingAppState,
  StartTripInput,
  UndoState,
  UpdateManualItemInput,
  UpdateSpendingPlanInput,
} from "./shopping-app-contracts";

export type {
  BarcodeIdentification,
  ActiveTripBootstrapResult,
  ActiveTripCommand,
  ActiveTripPersistencePort,
  ActiveTripSaveResult,
  AddManualItemInput,
  AddRememberedItemInput,
  AppCommandResult,
  AppLifecycle,
  ApplicationError,
  Clock,
  CompletedHistoryReadResult,
  CompletionSaveResult,
  Durability,
  HistorySetAsideResult,
  IdGenerator,
  PersistenceHealth,
  PersistenceProblem,
  RecoveryState,
  ShoppingAppController,
  ShoppingAppControllerDependencies,
  ShoppingAppState,
  ShoppingPersistencePort,
  StartTripInput,
  UndoState,
  UpdateManualItemInput,
  UpdateSpendingPlanInput,
} from "./shopping-app-contracts";

export const createShoppingAppController = ({
  persistence,
  clock,
  ids,
  priceMemoryPersistence = EMPTY_PRICE_MEMORY_PERSISTENCE_PORT,
  barcodeLinkPersistence = EMPTY_BARCODE_LINK_PERSISTENCE_PORT,
}: ShoppingAppControllerDependencies): ShoppingAppController => {
  let state = initialState();
  const listeners = new Set<() => void>();
  const ports: CompletionPorts & { barcodeLinks: BarcodeLinkPersistencePort } = {
    persistence,
    priceMemory: priceMemoryPersistence,
    barcodeLinks: barcodeLinkPersistence,
  };

  const publish = (nextState: ShoppingAppState): ShoppingAppState => {
    state = freezeState(nextState);

    for (const listener of listeners) {
      listener();
    }

    return state;
  };

  const getSnapshot = (): ShoppingAppState => state;

  const tripCommandTime = (trip: ActiveTrip): IsoTimestamp =>
    laterTimestamp(clock.now(), latestTripTimestamp(trip));

  const sessionOnly = (): boolean =>
    ports.persistence === SESSION_ONLY_PERSISTENCE_PORT;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  const {
    completeTrip,
    setActualCheckout,
    dismissCompletedSummary,
  } = createCompletionUseCases({
    getState: () => state,
    publish,
    ports,
    clock,
    ids,
  });

  const loadPersistedState = (): ShoppingAppState => {
    const result = ports.persistence.bootstrap();
    const memoryResult = ports.priceMemory.bootstrap();
    const linkResult = ports.barcodeLinks.bootstrap();
    const bootstrapIssueTime =
      !result.ok ||
      !memoryResult.ok ||
      !linkResult.ok ||
      result.historyIssue !== undefined
        ? clock.now()
        : null;
    const memoryHealth = memoryResult.ok
      ? HEALTHY_PERSISTENCE
      : degradedPersistence(
          memoryResult.issue,
          bootstrapIssueTime ?? clock.now(),
        );
    const linkHealth = linkResult.ok
      ? HEALTHY_PERSISTENCE
      : degradedPersistence(
          linkResult.issue,
          bootstrapIssueTime ?? clock.now(),
        );
    const historyIntegrity =
      result.historyIssue === undefined
        ? HEALTHY_PERSISTENCE
        : degradedPersistence(
            result.historyIssue,
            bootstrapIssueTime ?? clock.now(),
          );

    if (result.ok) {
      return {
        lifecycle: result.activeTrip === null ? "idle" : "active",
        activeTrip: result.activeTrip,
        completedSummary: null,
        completedTrips: result.completedTrips,
        completionCleanupPending: result.completionCleanupPending,
        persistence: HEALTHY_PERSISTENCE,
        historyIntegrity,
        priceMemories: memoryResult.records,
        priceMemoryPersistence: memoryHealth,
        barcodeLinks: linkResult.links,
        barcodeLinkPersistence: linkHealth,
        undo: null,
        recovery: null,
      };
    }

    const since = bootstrapIssueTime ?? clock.now();
    const persistenceHealth = degradedPersistence(result.issue, since);

    if (result.recoveryRequired) {
      return {
        lifecycle: "recovery",
        activeTrip: null,
        completedSummary: null,
        completedTrips: result.completedTrips,
        completionCleanupPending: result.completionCleanupPending,
        persistence: persistenceHealth,
        historyIntegrity,
        priceMemories: memoryResult.records,
        priceMemoryPersistence: memoryHealth,
        barcodeLinks: linkResult.links,
        barcodeLinkPersistence: linkHealth,
        undo: null,
        recovery: recoveryState(
          result.issue,
          result.recoveryRaw,
        ),
      };
    }

    return {
      lifecycle: result.activeTrip === null ? "idle" : "active",
      activeTrip: result.activeTrip,
      completedSummary: null,
      completedTrips: result.completedTrips,
      completionCleanupPending: result.completionCleanupPending,
      persistence: persistenceHealth,
      historyIntegrity,
      priceMemories: memoryResult.records,
      priceMemoryPersistence: memoryHealth,
      barcodeLinks: linkResult.links,
      barcodeLinkPersistence: linkHealth,
      undo: null,
      recovery: null,
    };
  };

  const bootstrap = (): ShoppingAppState => {
    if (
      state.lifecycle !== "booting" &&
      state.lifecycle !== "recovery"
    ) {
      return state;
    }

    return publish(loadPersistedState());
  };

  const changedElsewhere = (): boolean =>
    ports.persistence.isCurrent?.() === false ||
    ports.priceMemory.isCurrent?.() === false ||
    ports.barcodeLinks.isCurrent?.() === false;

  const refreshFromStorage = (): AppCommandResult => {
    if (
      state.lifecycle === "booting" ||
      state.lifecycle === "recovery" ||
      sessionOnly() ||
      state.persistence.status !== "healthy" ||
      state.completionCleanupPending ||
      !changedElsewhere()
    ) {
      return success(state, false, "unchanged");
    }

    const previous = state;
    const loaded = loadPersistedState();

    if (loaded.lifecycle === "recovery") {
      return success(publish(loaded), true, "persisted");
    }

    const open = previous.activeTrip;

    if (
      open !== null &&
      open.items.length > 0 &&
      loaded.activeTrip === null &&
      !loaded.completedTrips.some(
        (trip) => trip.id === open.id || sameTripContents(trip, open),
      )
    ) {
      const now = clock.now();
      const saveResult = ports.persistence.save(open, now);
      const nextState = publish({
        ...loaded,
        lifecycle: "active",
        activeTrip: open,
        completedSummary: null,
        persistence: saveResult.ok
          ? HEALTHY_PERSISTENCE
          : degradedPersistence(saveResult.issue, now),
        undo: previous.undo,
      });

      return success(
        nextState,
        true,
        saveResult.ok ? "persisted" : "memory-only",
      );
    }

    const summary =
      loaded.activeTrip === null && previous.completedSummary !== null
        ? (loaded.completedTrips.find(
            (trip) => trip.id === previous.completedSummary?.id,
          ) ?? previous.completedSummary)
        : null;
    const keepUndo =
      previous.undo !== null &&
      previous.activeTrip !== null &&
      loaded.activeTrip !== null &&
      previous.activeTrip.id === loaded.activeTrip.id &&
      sameTripContents(previous.activeTrip, loaded.activeTrip);
    const nextState = publish({
      ...loaded,
      lifecycle:
        loaded.activeTrip !== null
          ? "active"
          : summary !== null && previous.lifecycle === "completed-summary"
            ? "completed-summary"
            : "idle",
      completedSummary:
        previous.lifecycle === "completed-summary" ? summary : null,
      undo: keepUndo ? previous.undo : null,
    });

    return success(nextState, true, "persisted");
  };

  const synced =
    <A extends readonly unknown[], R>(command: (...args: A) => R) =>
    (...args: A): R => {
      refreshFromStorage();
      return command(...args);
    };

  const createAndPersistActiveTrip = (
    input: StartTripInput,
  ): AppCommandResult => {
    const now = clock.now();
    const tripResult = createActiveTrip({
      id: ids.tripId(),
      budgetMinor: input.budgetMinor,
      ...(input.safetyBufferMinor === undefined
        ? {}
        : { safetyBufferMinor: input.safetyBufferMinor }),
      startedAt: now,
    });

    if (!tripResult.ok) {
      return failure(state, tripResult.error);
    }

    const saveResult = ports.persistence.save(tripResult.value, now);
    const nextState = publish({
      lifecycle: "active",
      activeTrip: tripResult.value,
      completedSummary: null,
      completedTrips: state.completedTrips,
      completionCleanupPending: false,
      persistence: saveResult.ok
        ? HEALTHY_PERSISTENCE
        : degradedPersistence(saveResult.issue, now),
      historyIntegrity: state.historyIntegrity,
      priceMemories: state.priceMemories,
      priceMemoryPersistence: state.priceMemoryPersistence,
      barcodeLinks: state.barcodeLinks,
      barcodeLinkPersistence: state.barcodeLinkPersistence,
      undo: null,
      recovery: null,
    });

    return success(
      nextState,
      true,
      saveResult.ok ? "persisted" : "memory-only",
    );
  };

  const startTrip = (input: StartTripInput): AppCommandResult => {
    const blocked = lifecycleBlock(state);

    if (blocked !== null) {
      return failure(state, blocked);
    }

    if (state.lifecycle === "completed-summary") {
      return failure(state, applicationError("completed-summary-open"));
    }

    if (state.activeTrip !== null) {
      return failure(state, applicationError("active-trip-exists"));
    }

    return createAndPersistActiveTrip(input);
  };

  const startTripFromCompleted = (tripId: TripId): AppCommandResult => {
    const blocked = lifecycleBlock(state);

    if (blocked !== null) {
      return failure(state, blocked);
    }

    if (state.activeTrip !== null) {
      return failure(state, applicationError("active-trip-exists"));
    }

    if (
      (state.persistence.status === "degraded" && !sessionOnly()) ||
      state.completionCleanupPending
    ) {
      return failure(
        state,
        applicationError("repeat-source-unavailable"),
      );
    }

    const source =
      state.completedTrips.find((trip) => trip.id === tripId) ??
      (state.completedSummary?.id === tripId
        ? state.completedSummary
        : undefined);

    if (source === undefined) {
      return failure(
        state,
        applicationError("completed-trip-not-found"),
      );
    }

    return createAndPersistActiveTrip({
      budgetMinor: source.budgetMinor,
      safetyBufferMinor: source.safetyBufferMinor,
    });
  };

  const discardEmptyTrip = (): AppCommandResult => {
    const active = requireActiveTrip(state);

    if (!active.ok) {
      return failure(state, active.error);
    }

    if (active.trip.items.length > 0) {
      return failure(state, applicationError("trip-not-empty"));
    }

    const keepsStorage = sessionOnly();

    if (!keepsStorage && !ports.persistence.clearCompletedActive().ok) {
      return failure(state, applicationError("discard-not-saved"));
    }

    const nextState = publish({
      ...state,
      lifecycle: "idle",
      activeTrip: null,
      persistence: keepsStorage ? state.persistence : HEALTHY_PERSISTENCE,
      undo: null,
    });

    return success(nextState, true, keepsStorage ? "memory-only" : "persisted");
  };

  const addManualItem = (
    input: AddManualItemInput,
  ): AppCommandResult => {
    const active = requireActiveTrip(state);

    if (!active.ok) {
      return failure(state, active.error);
    }

    const now = tripCommandTime(active.trip);
    const itemResult = createCartItem({
      id: ids.itemId(),
      unitPriceMinor: input.unitPriceMinor,
      quantity: input.quantity,
      ...(input.label === undefined ? {} : { label: input.label }),
      priceSource: { kind: "manual" },
      priceConfidence: {
        kind: "confirmed",
        confirmedAt: now,
      },
      createdAt: now,
    });

    if (!itemResult.ok) {
      return failure(state, itemResult.error);
    }

    return rememberBarcode(
      dispatch({
        type: "add-item",
        item: itemResult.value,
      }),
      input.barcode,
    );
  };

  const addRememberedItem = (
    input: AddRememberedItemInput,
  ): AppCommandResult => {
    const active = requireActiveTrip(state);

    if (!active.ok) {
      return failure(state, active.error);
    }

    const memory = state.priceMemories.find(
      (candidate) => candidate.id === input.memoryId,
    );

    if (memory === undefined) {
      return failure(
        state,
        applicationError("price-memory-not-found"),
      );
    }

    const now = tripCommandTime(active.trip);
    const itemResult = createCartItem({
      id: ids.itemId(),
      unitPriceMinor: memory.unitPriceMinor,
      quantity: input.quantity ?? 1,
      label: memory.label,
      priceSource: {
        kind: "price-memory",
        memoryId: memory.id,
      },
      priceConfidence: {
        kind: "remembered",
        observedAt: memory.observedAt,
        ...(memory.storeId === undefined
          ? {}
          : { storeId: memory.storeId }),
      },
      createdAt: now,
    });

    if (!itemResult.ok) {
      return failure(state, itemResult.error);
    }

    return rememberBarcode(
      dispatch({
        type: "add-item",
        item: itemResult.value,
      }),
      input.barcode,
    );
  };

  const rememberBarcode = (
    result: AppCommandResult,
    barcode: Gtin | undefined,
  ): AppCommandResult => {
    if (barcode === undefined || !result.ok || !result.changed) {
      return result;
    }

    const label = result.state.activeTrip?.items.at(-1)?.label;

    if (label === undefined) {
      return result;
    }

    const now = clock.now();
    const current = findBarcodeLink(state.barcodeLinks, barcode);
    const link = createBarcodeLink({
      gtin: barcode,
      label,
      linkedAt:
        current === null ? now : laterTimestamp(now, current.linkedAt),
    });

    if (!link.ok) {
      return result;
    }

    const barcodeLinks = upsertBarcodeLink(state.barcodeLinks, link.value);

    if (barcodeLinks === state.barcodeLinks) {
      return result;
    }

    const canWrite =
      state.barcodeLinkPersistence.status === "healthy" ||
      state.barcodeLinkPersistence.issue.code === "write-failed";

    if (!canWrite) {
      return { ...result, state: publish({ ...state, barcodeLinks }) };
    }

    const saved = ports.barcodeLinks.save(barcodeLinks, now);

    return {
      ...result,
      state: publish({
        ...state,
        barcodeLinks,
        barcodeLinkPersistence: saved.ok
          ? HEALTHY_PERSISTENCE
          : degradedPersistence(saved.issue, now),
      }),
    };
  };

  const identifyBarcode = (
    rawValue: string,
    symbology: BarcodeSymbology | null,
  ): BarcodeIdentification => {
    const parsed = parseProductCode(rawValue, symbology);

    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    if (parsed.value.kind !== "trade-item") {
      return { ok: true, code: parsed.value, label: null, remembered: null };
    }

    const link = findBarcodeLink(state.barcodeLinks, parsed.value.gtin);

    return {
      ok: true,
      code: parsed.value,
      label: link?.label ?? null,
      remembered:
        link === null
          ? null
          : rememberedPriceForLabel(state.priceMemories, link.label),
    };
  };

  const updateSpendingPlan = (
    input: UpdateSpendingPlanInput,
  ): AppCommandResult =>
    dispatch({
      type: "set-spending-plan",
      budgetMinor: input.budgetMinor,
      safetyBufferMinor: input.safetyBufferMinor,
    });

  const updateManualItem = (
    input: UpdateManualItemInput,
  ): AppCommandResult => {
    const active = requireActiveTrip(state);

    if (!active.ok) {
      return failure(state, active.error);
    }

    const current = active.trip.items.find(
      (item) => item.id === input.itemId,
    );

    if (current === undefined) {
      return failure(state, {
        kind: "domain",
        code: "item-not-found",
      });
    }

    const now = tripCommandTime(active.trip);
    const priceChanged =
      current.unitPriceMinor !== input.unitPriceMinor;

    return dispatch({
      type: "update-item",
      itemId: input.itemId,
      patch: {
        unitPriceMinor: input.unitPriceMinor,
        quantity: input.quantity,
        ...(input.label === undefined ? {} : { label: input.label }),
        ...(priceChanged
          ? {
              priceSource: { kind: "manual" as const },
              priceConfidence: {
                kind: "confirmed" as const,
                confirmedAt: now,
              },
            }
          : {}),
      },
      now,
    });
  };

  const removeItem = (itemId: ItemId): AppCommandResult =>
    dispatch({
      type: "remove-item",
      itemId,
    });

  const undoStateForCommand = (
    previousTrip: ActiveTrip,
    command: ActiveTripCommand,
  ): UndoState | null => {
    switch (command.type) {
      case "add-item":
        return Object.freeze({
          previousTrip,
          description: "add",
        });
      case "update-item":
        return Object.freeze({
          previousTrip,
          description: "edit",
        });
      case "remove-item":
        return Object.freeze({
          previousTrip,
          description: "remove",
        });
      case "set-spending-plan":
      case "set-budget":
      case "set-buffer":
        return null;
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  };

  const markHistoryUnreadable = (
    issue: PersistenceProblem,
    completedTrips: readonly CompletedTrip[],
  ): ShoppingAppState =>
    publish(withUnreadableHistory(state, issue, completedTrips, clock.now()));

  const replaceCompletedHistory = (
    nextFrom: (durable: readonly CompletedTrip[]) => readonly CompletedTrip[],
  ): AppCommandResult => {
    const blocked = lifecycleBlock(state);

    if (blocked !== null) {
      return failure(state, blocked);
    }

    if (state.activeTrip !== null) {
      return failure(state, applicationError("active-trip-exists"));
    }

    if (
      state.persistence.status === "degraded" ||
      state.historyIntegrity.status === "degraded" ||
      state.completionCleanupPending ||
      sessionOnly()
    ) {
      return failure(
        state,
        applicationError("history-write-unavailable"),
      );
    }

    const durable = ports.persistence.readCompletedHistory();

    if (!durable.ok) {
      return failure(
        markHistoryUnreadable(durable.issue, durable.completedTrips),
        applicationError("history-write-unavailable"),
      );
    }

    const nextTrips = nextFrom(durable.completedTrips);
    const now = clock.now();
    const saveResult = ports.persistence.replaceCompletedHistory(
      nextTrips,
      now,
    );

    if (!saveResult.ok) {
      return failure(
        saveResult.stage === "history-read"
          ? markHistoryUnreadable(saveResult.issue, durable.completedTrips)
          : state,
        applicationError("history-write-unavailable"),
      );
    }

    const completedSummaryStillExists =
      state.completedSummary === null ||
      nextTrips.some((trip) => trip.id === state.completedSummary?.id);

    const nextState = publish({
      ...state,
      lifecycle:
        completedSummaryStillExists ? state.lifecycle : "idle",
      completedSummary: completedSummaryStillExists
        ? state.completedSummary
        : null,
      completedTrips: Object.freeze([...nextTrips]),
      persistence: HEALTHY_PERSISTENCE,
      undo: null,
      recovery: null,
    });

    return success(nextState, true, "persisted");
  };

  const deleteCompletedTrip = (tripId: TripId): AppCommandResult => {
    const existing = state.completedTrips.find(
      (trip) => trip.id === tripId,
    );

    if (existing === undefined) {
      return failure(
        state,
        applicationError("completed-trip-not-found"),
      );
    }

    return replaceCompletedHistory((durable) =>
      durable.filter((trip) => trip.id !== tripId),
    );
  };

  const setCompletedTripCheckout = (
    tripId: TripId,
    actualCheckoutMinor: MinorUnits,
  ): AppCommandResult => {
    const existing = state.completedTrips.find(
      (trip) => trip.id === tripId,
    );

    if (existing === undefined) {
      return failure(
        state,
        applicationError("completed-trip-not-found"),
      );
    }

    if (existing.actualCheckoutMinor === actualCheckoutMinor) {
      return success(state, false, "unchanged");
    }

    const updated = reduceTrip(existing, {
      type: "set-actual-checkout",
      actualCheckoutMinor,
    });

    if (!updated.ok) {
      return failure(state, updated.error);
    }

    const trip: CompletedTrip = { ...existing, actualCheckoutMinor };
    const result = replaceCompletedHistory((durable) =>
      durable.map((candidate) => (candidate.id === tripId ? trip : candidate)),
    );

    if (!result.ok || state.completedSummary?.id !== tripId) {
      return result;
    }

    return success(
      publish({ ...state, completedSummary: trip }),
      true,
      result.durability,
    );
  };

  const deleteOldestCompletedTrips = (count: number): AppCommandResult => {
    const blocked = lifecycleBlock(state);

    if (blocked !== null) {
      return failure(state, blocked);
    }

    if (
      sessionOnly() ||
      state.historyIntegrity.status === "degraded" ||
      state.completionCleanupPending
    ) {
      return failure(
        state,
        applicationError("history-write-unavailable"),
      );
    }

    const durable = ports.persistence.readCompletedHistory();

    if (!durable.ok) {
      return failure(
        markHistoryUnreadable(durable.issue, durable.completedTrips),
        applicationError("history-write-unavailable"),
      );
    }

    const keptSummaryId = state.completedSummary?.id;
    const removed = new Set(
      durable.completedTrips
        .filter((trip) => trip.id !== keptSummaryId)
        .sort(
          (left, right) =>
            Date.parse(left.completedAt) - Date.parse(right.completedAt),
        )
        .slice(0, Math.max(0, count))
        .map((trip) => trip.id),
    );

    if (removed.size === 0) {
      return failure(
        state,
        applicationError("completed-trip-not-found"),
      );
    }

    const nextTrips = durable.completedTrips.filter(
      (trip) => !removed.has(trip.id),
    );
    const saveResult = ports.persistence.replaceCompletedHistory(
      nextTrips,
      clock.now(),
    );

    if (!saveResult.ok) {
      return failure(
        saveResult.stage === "history-read"
          ? markHistoryUnreadable(saveResult.issue, durable.completedTrips)
          : state,
        applicationError("history-write-unavailable"),
      );
    }

    publish({ ...state, completedTrips: Object.freeze([...nextTrips]) });

    return state.persistence.status === "healthy"
      ? success(state, true, "persisted")
      : retryPersistence();
  };

  const clearCompletedHistory = (): AppCommandResult => {
    if (state.completedTrips.length === 0) {
      return success(state, false, "unchanged");
    }

    return replaceCompletedHistory(() => []);
  };

  const clearPriceMemory = (): AppCommandResult => {
    const blocked = lifecycleBlock(state);

    if (blocked !== null) {
      return failure(state, blocked);
    }

    if (state.activeTrip !== null) {
      return failure(state, applicationError("active-trip-exists"));
    }

    if (
      state.priceMemories.length === 0 &&
      state.priceMemoryPersistence.status === "healthy" &&
      state.barcodeLinks.length === 0 &&
      state.barcodeLinkPersistence.status === "healthy"
    ) {
      return success(state, false, "unchanged");
    }

    const now = clock.now();
    const saveResult = ports.priceMemory.save([], now);

    if (!saveResult.ok) {
      return failure(
        state,
        applicationError("price-memory-write-unavailable"),
      );
    }

    const linksCleared = ports.barcodeLinks.save([], now);
    const nextState = publish({
      ...state,
      priceMemories: EMPTY_PRICE_MEMORIES,
      priceMemoryPersistence: HEALTHY_PERSISTENCE,
      barcodeLinks: linksCleared.ok ? EMPTY_BARCODE_LINKS : state.barcodeLinks,
      barcodeLinkPersistence: linksCleared.ok
        ? HEALTHY_PERSISTENCE
        : degradedPersistence(linksCleared.issue, now),
    });

    return success(nextState, true, "persisted");
  };

  const retryPersistence = (): AppCommandResult => {
    const blocked = lifecycleBlock(state);

    if (blocked !== null) {
      return failure(state, blocked);
    }

    if (
      sessionOnly() ||
      (state.persistence.status === "healthy" &&
        !state.completionCleanupPending)
    ) {
      return success(state, false, "unchanged");
    }

    const since =
      state.persistence.status === "degraded"
        ? state.persistence.since
        : clock.now();
    const now = clock.now();

    if (state.activeTrip !== null) {
      const saveResult = ports.persistence.save(state.activeTrip, now);
      const nextState = publish({
        ...state,
        persistence: saveResult.ok
          ? HEALTHY_PERSISTENCE
          : degradedPersistence(saveResult.issue, since),
      });

      return success(
        nextState,
        true,
        saveResult.ok ? "persisted" : "memory-only",
      );
    }

    if (state.completedSummary !== null) {
      return persistCompletedSummary(state.completedSummary, since, now);
    }

    if (state.completionCleanupPending) {
      const cleanup = ports.persistence.clearCompletedActive();
      const nextState = publish({
        ...state,
        persistence: cleanup.ok
          ? HEALTHY_PERSISTENCE
          : degradedPersistence(cleanup.issue, since),
        completionCleanupPending: !cleanup.ok,
      });

      return success(
        nextState,
        true,
        cleanup.ok ? "persisted" : "memory-only",
      );
    }

    return failure(state, applicationError("no-active-trip"));
  };

  const persistCompletedSummary = (
    summary: CompletedTrip,
    since: IsoTimestamp,
    now: IsoTimestamp,
  ): AppCommandResult => {
    const durable = ports.persistence.readCompletedHistory();

    if (!durable.ok) {
      const nextState = publish(
        withUnreadableHistory(
          state,
          durable.issue,
          durable.completedTrips,
          now,
        ),
      );

      return success(nextState, true, "memory-only");
    }

    const recorded = durable.completedTrips.some(
      (trip) => trip.id === summary.id,
    );

    if (!recorded) {
      const completion = ports.persistence.complete(summary, now);

      if (!completion.ok && !completion.historyPersisted) {
        const nextState = publish({
          ...state,
          completedTrips: Object.freeze([...durable.completedTrips]),
          historyIntegrity: HEALTHY_PERSISTENCE,
          persistence: degradedPersistence(completion.issue, since),
        });

        return success(nextState, true, "memory-only");
      }

      const nextState = publish({
        ...state,
        completedTrips:
          completion.completedTrips === undefined
            ? upsertCompletedTrip(durable.completedTrips, summary)
            : Object.freeze([...completion.completedTrips]),
        historyIntegrity: HEALTHY_PERSISTENCE,
        persistence: completion.ok
          ? HEALTHY_PERSISTENCE
          : degradedPersistence(completion.issue, since),
        completionCleanupPending: !completion.ok,
      });

      return success(nextState, true, "persisted");
    }

    const historySave = ports.persistence.saveCompleted(summary, now);

    if (!historySave.ok) {
      const nextState = publish({
        ...state,
        completedTrips: Object.freeze([...durable.completedTrips]),
        historyIntegrity: HEALTHY_PERSISTENCE,
        persistence: degradedPersistence(historySave.issue, since),
      });

      return success(nextState, true, "memory-only");
    }

    const cleanup = state.completionCleanupPending
      ? ports.persistence.clearCompletedActive()
      : ({ ok: true } as const);
    const nextState = publish({
      ...state,
      completedTrips: upsertCompletedTrip(durable.completedTrips, summary),
      historyIntegrity: HEALTHY_PERSISTENCE,
      persistence: cleanup.ok
        ? HEALTHY_PERSISTENCE
        : degradedPersistence(cleanup.issue, since),
      completionCleanupPending: !cleanup.ok,
    });

    return success(nextState, true, "persisted");
  };

  const historyRepairBlock = (): AppCommandResult | null => {
    const blocked = lifecycleBlock(state);

    return blocked === null ? null : failure(state, blocked);
  };

  const retryHistoryRead = (): AppCommandResult => {
    const blocked = historyRepairBlock();

    if (blocked !== null) {
      return blocked;
    }

    if (state.historyIntegrity.status === "healthy" || sessionOnly()) {
      return success(state, false, "unchanged");
    }

    const since = state.historyIntegrity.since;
    const result = ports.persistence.readCompletedHistory();

    if (!result.ok) {
      const nextState = publish({
        ...state,
        completedTrips: Object.freeze([...result.completedTrips]),
        historyIntegrity: degradedPersistence(result.issue, since),
      });

      return success(nextState, true, "unchanged");
    }

    const activeTrip = state.activeTrip;
    const staleActive =
      activeTrip !== null &&
      result.completedTrips.some((trip) =>
        sameTripContents(activeTrip, trip),
      );

    if (!staleActive) {
      const nextState = publish({
        ...state,
        completedTrips: Object.freeze([...result.completedTrips]),
        historyIntegrity: HEALTHY_PERSISTENCE,
      });

      return success(nextState, true, "unchanged");
    }

    const cleanup = ports.persistence.clearCompletedActive();
    const nextState = publish({
      ...state,
      lifecycle: "idle",
      activeTrip: null,
      completedTrips: Object.freeze([...result.completedTrips]),
      historyIntegrity: HEALTHY_PERSISTENCE,
      completionCleanupPending: !cleanup.ok,
      persistence: cleanup.ok
        ? HEALTHY_PERSISTENCE
        : degradedPersistence(cleanup.issue, clock.now()),
      undo: null,
    });

    return success(nextState, true, cleanup.ok ? "persisted" : "memory-only");
  };

  const setAsideDamagedHistory = (): AppCommandResult => {
    const blocked = historyRepairBlock();

    if (blocked !== null) {
      return blocked;
    }

    if (
      state.historyIntegrity.status === "healthy" ||
      !canSetAsideHistory(state.historyIntegrity.issue)
    ) {
      return failure(state, applicationError("nothing-to-set-aside"));
    }

    const now = clock.now();
    const result = ports.persistence.setAsideDamagedHistory(now);

    if (!result.ok) {
      return failure(state, applicationError("set-aside-failed"));
    }

    const nextState = publish({
      ...state,
      completedTrips: Object.freeze([...result.completedTrips]),
      historyIntegrity: HEALTHY_PERSISTENCE,
    });

    if (
      nextState.lifecycle === "completed-summary" &&
      nextState.completedSummary !== null
    ) {
      return persistCompletedSummary(
        nextState.completedSummary,
        nextState.persistence.status === "degraded"
          ? nextState.persistence.since
          : now,
        now,
      );
    }

    return success(nextState, true, "persisted");
  };

  const setAsideUnreadableActiveTrip = (): AppCommandResult => {
    if (state.lifecycle !== "recovery" || state.recovery === null) {
      return failure(state, applicationError("recovery-not-open"));
    }

    if (!canSetAsideActiveTrip(state.recovery.issue)) {
      return failure(state, applicationError("nothing-to-set-aside"));
    }

    const result = ports.persistence.setAsideUnreadableActiveTrip(
      clock.now(),
    );

    if (!result.ok) {
      return failure(state, applicationError("set-aside-failed"));
    }

    const nextState = bootstrap();

    return success(nextState, true, "persisted");
  };

  const continueWithoutSaving = (): AppCommandResult => {
    if (state.lifecycle !== "recovery" || state.recovery === null) {
      return failure(state, applicationError("recovery-not-open"));
    }

    ports.persistence = SESSION_ONLY_PERSISTENCE_PORT;
    ports.priceMemory = SESSION_ONLY_PRICE_MEMORY_PORT;
    ports.barcodeLinks = SESSION_ONLY_BARCODE_LINK_PORT;

    const now = clock.now();
    const nextState = publish({
      ...state,
      lifecycle: "idle",
      activeTrip: null,
      completedSummary: null,
      completionCleanupPending: false,
      persistence: degradedPersistence(SESSION_ONLY_ISSUE, now),
      priceMemoryPersistence: degradedPersistence(SESSION_ONLY_ISSUE, now),
      barcodeLinkPersistence: degradedPersistence(SESSION_ONLY_ISSUE, now),
      undo: null,
      recovery: null,
    });

    return success(nextState, true, "memory-only");
  };

  const dispatch = (command: ActiveTripCommand): AppCommandResult => {
    const active = requireActiveTrip(state);

    if (!active.ok) {
      return failure(state, active.error);
    }

    const currentTrip = active.trip;
    const tripResult = reduceTrip(currentTrip, command);

    if (!tripResult.ok) {
      return failure(state, tripResult.error);
    }

    if (tripResult.value.status !== "active") {
      return failure(state, applicationError("no-active-trip"));
    }

    if (tripResult.value === currentTrip) {
      return success(state, false, "unchanged");
    }

    const now = clock.now();
    const saveResult = ports.persistence.save(tripResult.value, now);
    const nextState = publish({
      ...state,
      lifecycle: "active",
      activeTrip: tripResult.value,
      persistence: saveResult.ok
        ? HEALTHY_PERSISTENCE
        : degradedPersistence(saveResult.issue, now),
      undo: undoStateForCommand(currentTrip, command),
      recovery: null,
    });

    return success(
      nextState,
      true,
      saveResult.ok ? "persisted" : "memory-only",
    );
  };

  const undo = (): AppCommandResult => {
    const active = requireActiveTrip(state);

    if (!active.ok) {
      return failure(state, active.error);
    }

    if (state.undo === null) {
      return success(state, false, "unchanged");
    }

    const previousTrip = state.undo.previousTrip;
    const now = clock.now();
    const saveResult = ports.persistence.save(previousTrip, now);
    const nextState = publish({
      ...state,
      lifecycle: "active",
      activeTrip: previousTrip,
      persistence: saveResult.ok
        ? HEALTHY_PERSISTENCE
        : degradedPersistence(saveResult.issue, now),
      undo: null,
      recovery: null,
    });

    return success(
      nextState,
      true,
      saveResult.ok ? "persisted" : "memory-only",
    );
  };

  return Object.freeze({
    getSnapshot,
    subscribe,
    bootstrap,
    refreshFromStorage,
    startTrip: synced(startTrip),
    startTripFromCompleted: synced(startTripFromCompleted),
    discardEmptyTrip: synced(discardEmptyTrip),
    addManualItem: synced(addManualItem),
    addRememberedItem: synced(addRememberedItem),
    updateSpendingPlan: synced(updateSpendingPlan),
    updateManualItem: synced(updateManualItem),
    removeItem: synced(removeItem),
    undo: synced(undo),
    completeTrip: synced(completeTrip),
    setActualCheckout: synced(setActualCheckout),
    dismissCompletedSummary: synced(dismissCompletedSummary),
    deleteCompletedTrip: synced(deleteCompletedTrip),
    setCompletedTripCheckout: synced(setCompletedTripCheckout),
    deleteOldestCompletedTrips: synced(deleteOldestCompletedTrips),
    clearCompletedHistory: synced(clearCompletedHistory),
    clearPriceMemory: synced(clearPriceMemory),
    retryPersistence,
    retryHistoryRead: synced(retryHistoryRead),
    setAsideDamagedHistory,
    setAsideUnreadableActiveTrip,
    continueWithoutSaving,
    dispatch: synced(dispatch),
    identifyBarcode: synced(identifyBarcode),
  });
};
