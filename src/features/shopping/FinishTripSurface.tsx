import { useEffect, useRef, useState, type ReactNode } from "react";

import { formatEur } from "../../domain/money";
import {
  cartTotal,
  itemCount,
  type ActiveTrip,
} from "../../domain/shopping-trip";
import styles from "./FinishTripSurface.module.css";
import { SHOPPING_LOCALE } from "./shopping-locale";

export type FinishTripFailure = "not-saved" | "history-unreadable" | "storage-full";

export interface FinishTripSurfaceProps {
  readonly trip: ActiveTrip;
  readonly onCancel: () => void;
  readonly onConfirm: () => boolean | void | FinishTripFailure;
  readonly onDiscard?: () => boolean;
  readonly locale?: string;
  readonly historyNotice?: ReactNode;
  readonly historyNeedsAttention?: boolean;
}

const failureMessage = (failure: FinishTripFailure): string => {
  switch (failure) {
    case "history-unreadable":
      return "Saved trip history needs attention before this trip can be added to it. The trip is still open here.";
    case "not-saved":
      return "Trip history could not be saved. Your active trip is still intact.";
    case "storage-full":
      return "Storage for this app is full, so the trip was not saved to History. It is still open: choose Keep shopping to make room, then finish again.";
    default: {
      const exhaustive: never = failure;
      return exhaustive;
    }
  }
};

export function FinishTripSurface({
  trip,
  onCancel,
  onConfirm,
  onDiscard,
  locale = SHOPPING_LOCALE,
  historyNotice,
  historyNeedsAttention = false,
}: FinishTripSurfaceProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [failure, setFailure] = useState<FinishTripFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [discardFailed, setDiscardFailed] = useState(false);
  const visibleFailure =
    failure === "history-unreadable" && !historyNeedsAttention
      ? null
      : failure;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const total = cartTotal(trip);
  const quantity = itemCount(trip);
  const discard =
    onDiscard !== undefined && trip.items.length === 0 ? onDiscard : null;

  const finish = (): void => {
    if (submitting) {
      return;
    }

    setFailure(null);
    setSubmitting(true);
    const outcome = onConfirm();

    if (outcome === true || outcome === undefined) {
      return;
    }

    setSubmitting(false);
    setFailure(outcome === false ? "not-saved" : outcome);
  };

  const keepShopping = (
    <button
      ref={cancelRef}
      type="button"
      className={styles.cancelButton}
      onClick={onCancel}
    >
      Keep shopping
    </button>
  );

  return (
    <main
      className={styles.screen}
      aria-labelledby="finish-trip-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {discard !== null ? (
        <section className={styles.panel}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Finish shopping</p>
            <h1 id="finish-trip-title">Nothing to finish yet</h1>
            <p>
              This trip has no items, so there is nothing to save. Cancel it
              to go back to the start.
            </p>
          </header>

          {discardFailed ? (
            <p className={styles.error} role="alert">
              The trip could not be cancelled. Try again.
            </p>
          ) : null}

          <div className={styles.actions}>
            {keepShopping}
            <button
              type="button"
              className={styles.finishButton}
              onClick={() => {
                setDiscardFailed(!discard());
              }}
            >
              Cancel trip
            </button>
          </div>
        </section>
      ) : (
        <section className={styles.panel}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Finish shopping</p>
            <h1 id="finish-trip-title">Ready to finish this trip?</h1>
            <p>
              Your trip will be saved to History on this device. You can add
              the receipt total next.
            </p>
          </header>

          <section className={styles.summary} aria-label="Trip review">
            <div>
              <span>Cart total</span>
              <strong>{formatEur(total, locale)}</strong>
            </div>
            <div>
              <span>Budget</span>
              <strong>{formatEur(trip.budgetMinor, locale)}</strong>
            </div>
            <div>
              <span>Items</span>
              <strong>{quantity}</strong>
            </div>
          </section>

          <p className={styles.safety}>
            Items can’t be changed after finishing. If saving fails, the trip
            stays open.
          </p>

          {visibleFailure !== null ? (
            <p className={styles.error} role="alert">
              {failureMessage(visibleFailure)}
            </p>
          ) : null}

          {historyNotice}

          <div className={styles.actions}>
            {keepShopping}
            <button
              type="button"
              className={styles.finishButton}
              disabled={submitting}
              onClick={finish}
            >
              {submitting ? "Finishing…" : "Finish trip"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
