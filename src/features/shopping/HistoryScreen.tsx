import { useEffect, useRef, useState } from "react";

import { useShoppingAppState } from "../../application/react/use-shopping-app-state";
import {
  isSessionOnly,
  needsSaveAttention,
} from "../../application/session-only-persistence";
import type { ShoppingAppController } from "../../application/shopping-app-controller";
import {
  type CompletedTrip,
  type TripId,
} from "../../domain/shopping-trip";
import {
  HistoryDataControls,
  type HistoryDataConfirmation,
} from "./HistoryDataControls";
import { HistoryTripCard } from "./HistoryTripCard";
import { HistoryIntegrityNotice } from "./HistoryIntegrityNotice";
import { PersistenceHealthNotice } from "./PersistenceHealthNotice";
import styles from "./HistoryScreen.module.css";
import { SHOPPING_LOCALE } from "./shopping-locale";

export interface HistoryScreenProps {
  readonly controller: ShoppingAppController;
  readonly onBack: () => void;
  readonly onTripStarted?: () => void;
  readonly locale?: string;
}

type ConfirmationState =
  | { readonly kind: "none" }
  | { readonly kind: "delete-trip"; readonly tripId: TripId }
  | { readonly kind: "clear-history" }
  | { readonly kind: "clear-price-memory" };

export function HistoryScreen({
  controller,
  onBack,
  onTripStarted,
  locale = SHOPPING_LOCALE,
}: HistoryScreenProps) {
  const state = useShoppingAppState(controller);
  const ordered = [...state.completedTrips].sort(
    (left, right) =>
      Date.parse(right.completedAt) - Date.parse(left.completedAt),
  );
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    kind: "none",
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const confirmationCancelRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const canRepeat =
    (state.persistence.status === "healthy" ||
      isSessionOnly(state.persistence)) &&
    !state.completionCleanupPending;
  const canChangeHistory =
    state.persistence.status === "healthy" &&
    state.historyIntegrity.status === "healthy" &&
    !state.completionCleanupPending;

  useEffect(() => {
    if (confirmation.kind !== "none") {
      confirmationCancelRef.current?.focus();
    }
  }, [confirmation]);

  const resetMessages = (): void => {
    setStatusMessage("");
    setErrorMessage("");
  };

  const restoreDeleteTripFocus = (tripId: TripId): void => {
    queueMicrotask(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        "[data-delete-trip-id]",
      );

      for (const button of buttons) {
        if (button.dataset.deleteTripId === tripId) {
          button.focus();
          return;
        }
      }
    });
  };

  const restoreDataControlFocus = (
    selector: string,
  ): void => {
    queueMicrotask(() => {
      document.querySelector<HTMLButtonElement>(selector)?.focus();
    });
  };

  const cancelConfirmation = (): void => {
    const previous = confirmation;
    setConfirmation({ kind: "none" });

    if (previous.kind === "delete-trip") {
      restoreDeleteTripFocus(previous.tripId);
      return;
    }

    if (previous.kind === "clear-history") {
      restoreDataControlFocus("[data-clear-trip-history-trigger]");
      return;
    }

    if (previous.kind === "clear-price-memory") {
      restoreDataControlFocus("[data-clear-price-memory-trigger]");
    }
  };

  const startSimilarTrip = (trip: CompletedTrip): void => {
    resetMessages();
    const result = controller.startTripFromCompleted(trip.id);

    if (!result.ok) {
      setErrorMessage(
        "A new trip could not be started from this budget. Check local saving and try again.",
      );
      return;
    }

    onTripStarted?.();
  };

  const deleteTrip = (trip: CompletedTrip): void => {
    resetMessages();
    const result = controller.deleteCompletedTrip(trip.id);

    if (!result.ok) {
      setErrorMessage(
        "This trip could not be deleted safely. Nothing was removed.",
      );
      return;
    }

    setConfirmation({ kind: "none" });
    setStatusMessage("Trip deleted from this device.");
    queueMicrotask(() => {
      statusRef.current?.focus();
    });
  };

  const clearHistory = (): void => {
    resetMessages();
    const result = controller.clearCompletedHistory();

    if (!result.ok) {
      setErrorMessage(
        "Trip history could not be cleared safely. Nothing was removed.",
      );
      return;
    }

    setConfirmation({ kind: "none" });
    setStatusMessage("Trip history cleared from this device.");
    queueMicrotask(() => {
      statusRef.current?.focus();
    });
  };

  const clearPriceMemory = (): void => {
    resetMessages();
    const result = controller.clearPriceMemory();

    if (!result.ok) {
      setErrorMessage(
        "Remembered prices could not be cleared safely. Nothing was removed.",
      );
      return;
    }

    setConfirmation({ kind: "none" });
    setStatusMessage("Remembered item prices cleared from this device.");
    queueMicrotask(() => {
      statusRef.current?.focus();
    });
  };

  const dataConfirmation: HistoryDataConfirmation =
    confirmation.kind === "clear-history" ||
    confirmation.kind === "clear-price-memory"
      ? confirmation.kind
      : "none";

  return (
    <main className={styles.screen} aria-labelledby="history-title">
      <section className={styles.shell}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={onBack}
          >
            Back
          </button>
          <div>
            <p className={styles.eyebrow}>Trip history</p>
            <h1 id="history-title" tabIndex={-1}>
              Past shopping trips
            </h1>
            <p>
              Your past trips and, when you added one, the receipt total.
            </p>
          </div>
        </header>

        <PersistenceHealthNotice
          controller={controller}
          health={state.persistence}
          context="idle"
        />
        <HistoryIntegrityNotice controller={controller} />

        {statusMessage ? (
          <p
            ref={statusRef}
            className={styles.status}
            role="status"
            aria-live="polite"
            tabIndex={-1}
          >
            {statusMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}

        {ordered.length === 0 ? (
          <section className={styles.emptyState}>
            <strong>No completed trips yet.</strong>
            <span>Finish a shopping trip and it will appear here.</span>
          </section>
        ) : (
          <ol className={styles.tripList}>
            {ordered.map((trip) => (
              <HistoryTripCard
                key={trip.id}
                trip={trip}
                locale={locale}
                canChangeHistory={canChangeHistory}
                canRepeat={canRepeat}
                deleting={
                  confirmation.kind === "delete-trip" &&
                  confirmation.tripId === trip.id
                }
                confirmationCancelRef={confirmationCancelRef}
                onStartSimilar={startSimilarTrip}
                onRequestDelete={(candidate) => {
                  resetMessages();
                  setConfirmation({
                    kind: "delete-trip",
                    tripId: candidate.id,
                  });
                }}
                onCancelDelete={cancelConfirmation}
                onConfirmDelete={deleteTrip}
                onSaveCheckout={(candidate, actualCheckoutMinor) => {
                  resetMessages();
                  return controller.setCompletedTripCheckout(
                    candidate.id,
                    actualCheckoutMinor,
                  ).ok;
                }}
              />
            ))}
          </ol>
        )}

        <HistoryDataControls
          tripCount={state.completedTrips.length}
          priceMemoryCount={state.priceMemories.length}
          priceMemoryDegraded={
            needsSaveAttention(state.priceMemoryPersistence) ||
            needsSaveAttention(state.barcodeLinkPersistence)
          }
          barcodeNameCount={state.barcodeLinks.length}
          canChangeHistory={canChangeHistory}
          sessionOnly={isSessionOnly(state.persistence)}
          confirmation={dataConfirmation}
          confirmationCancelRef={confirmationCancelRef}
          onRequestClearHistory={() => {
            resetMessages();
            setConfirmation({ kind: "clear-history" });
          }}
          onConfirmClearHistory={clearHistory}
          onRequestClearPriceMemory={() => {
            resetMessages();
            setConfirmation({ kind: "clear-price-memory" });
          }}
          onConfirmClearPriceMemory={clearPriceMemory}
          onCancel={cancelConfirmation}
        />
      </section>
    </main>
  );
}
