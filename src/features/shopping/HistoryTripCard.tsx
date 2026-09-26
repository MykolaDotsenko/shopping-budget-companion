import { useEffect, useId, useRef, useState, type RefObject } from "react";

import {
  formatEur,
  moneyInputValue,
  parseEurDraft,
  type MinorUnits,
} from "../../domain/money";
import {
  cartTotal,
  checkoutDifference,
  itemCount,
  lineTotal,
  type CompletedTrip,
} from "../../domain/shopping-trip";
import styles from "./HistoryScreen.module.css";
import {
  budgetOutcome,
  formatAbsoluteEur,
  moneyInputErrorMessage,
} from "./shopping-feedback";

export interface HistoryTripCardProps {
  readonly trip: CompletedTrip;
  readonly locale: string;
  readonly canChangeHistory: boolean;
  readonly canRepeat: boolean;
  readonly deleting: boolean;
  readonly confirmationCancelRef: RefObject<HTMLButtonElement | null>;
  readonly onStartSimilar: (trip: CompletedTrip) => void;
  readonly onRequestDelete: (trip: CompletedTrip) => void;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: (trip: CompletedTrip) => void;
  readonly onSaveCheckout: (
    trip: CompletedTrip,
    actualCheckoutMinor: MinorUnits,
  ) => boolean;
}

const differenceLabel = (
  trip: CompletedTrip,
  locale: string,
): string | null => {
  const difference = checkoutDifference(trip);

  if (difference === null) {
    return null;
  }

  if (difference === 0) {
    return "Receipt matched";
  }

  return difference > 0
    ? `Paid ${formatAbsoluteEur(difference, locale)} more`
    : `Paid ${formatAbsoluteEur(difference, locale)} less`;
};

const completedLabel = (
  trip: CompletedTrip,
  locale: string,
): string => {
  const date = new Date(trip.completedAt);

  if (!Number.isFinite(date.getTime())) {
    return trip.completedAt;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export function HistoryTripCard({
  trip,
  locale,
  canChangeHistory,
  canRepeat,
  deleting,
  confirmationCancelRef,
  onStartSimilar,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onSaveCheckout,
}: HistoryTripCardProps) {
  const tracked = cartTotal(trip);
  const quantity = itemCount(trip);
  const difference = differenceLabel(trip, locale);
  const outcome = budgetOutcome(trip, locale);
  const checkoutErrorId = useId();
  const [checkoutRaw, setCheckoutRaw] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutSaved, setCheckoutSaved] = useState(false);
  const checkoutInputRef = useRef<HTMLInputElement>(null);
  const checkoutToggleRef = useRef<HTMLButtonElement>(null);
  const editingCheckout = checkoutRaw !== null;
  const wasEditingCheckout = useRef(false);

  useEffect(() => {
    if (editingCheckout) {
      checkoutInputRef.current?.focus();
    } else if (wasEditingCheckout.current) {
      checkoutToggleRef.current?.focus();
    }

    wasEditingCheckout.current = editingCheckout;
  }, [editingCheckout]);

  const closeCheckout = (): void => {
    setCheckoutRaw(null);
    setCheckoutError("");
  };

  const saveCheckout = (): void => {
    const parsed =
      checkoutRaw === null || checkoutRaw.trim() === ""
        ? null
        : parseEurDraft({ raw: checkoutRaw, mode: "decimal" });

    if (parsed === null) {
      setCheckoutError("Enter the receipt total first.");
      return;
    }

    if (!parsed.ok) {
      setCheckoutError(moneyInputErrorMessage(parsed.error.code));
      return;
    }

    if (!onSaveCheckout(trip, parsed.value)) {
      setCheckoutError("The receipt total could not be saved. Nothing was changed.");
      return;
    }

    closeCheckout();
    setCheckoutSaved(true);
  };

  return (
    <li className={styles.trip}>
      <div className={styles.tripHeader}>
        <div>
          <span className={styles.completedAt}>
            {completedLabel(trip, locale)}
          </span>
          <strong>{formatEur(tracked, locale)} cart total</strong>
        </div>
        <span className={styles.itemCount}>
          {quantity} {quantity === 1 ? "item" : "items"}
        </span>
      </div>

      <dl className={styles.metrics}>
        <div>
          <dt>Budget</dt>
          <dd>{formatEur(trip.budgetMinor, locale)}</dd>
        </div>
        <div>
          <dt>Receipt</dt>
          <dd>
            {trip.actualCheckoutMinor === undefined
              ? "Not added"
              : formatEur(trip.actualCheckoutMinor, locale)}
          </dd>
        </div>
        <div>
          <dt>Budget outcome</dt>
          <dd data-outcome={outcome.status}>{outcome.label}</dd>
        </div>
      </dl>

      {difference ? (
        <p
          className={styles.difference}
          data-direction={(checkoutDifference(trip) ?? 0) > 0 ? "more" : "within"}
        >
          {difference}
        </p>
      ) : null}

      {editingCheckout ? (
        <form
          className={styles.checkoutForm}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            saveCheckout();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeCheckout();
            }
          }}
        >
          <label className={styles.checkoutField}>
            <span>Receipt total</span>
            <span className={styles.checkoutInput}>
              <span aria-hidden="true">€</span>
              <input
                ref={checkoutInputRef}
                value={checkoutRaw}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-invalid={checkoutError !== ""}
                aria-describedby={checkoutError === "" ? undefined : checkoutErrorId}
                onChange={(event) => {
                  setCheckoutRaw(event.currentTarget.value);
                  setCheckoutError("");
                }}
              />
            </span>
          </label>
          <div className={styles.confirmationActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={closeCheckout}
            >
              Cancel
            </button>
            <button type="submit" className={styles.saveCheckoutButton}>
              Save
            </button>
          </div>
          {checkoutError === "" ? null : (
            <p id={checkoutErrorId} className={styles.error} role="alert">
              {checkoutError}
            </p>
          )}
        </form>
      ) : canChangeHistory ? (
        <button
          ref={checkoutToggleRef}
          type="button"
          className={styles.checkoutToggle}
          onClick={() => {
            setCheckoutSaved(false);
            setCheckoutRaw(
              trip.actualCheckoutMinor === undefined
                ? ""
                : moneyInputValue(trip.actualCheckoutMinor),
            );
          }}
        >
          {trip.actualCheckoutMinor === undefined
            ? "Add receipt total"
            : "Change receipt total"}
        </button>
      ) : null}

      {checkoutSaved ? (
        <p className={styles.status} role="status">
          Receipt total saved.
        </p>
      ) : null}

      {trip.items.length > 0 ? (
        <details className={styles.tripDetails}>
          <summary>
            View {quantity} {quantity === 1 ? "item" : "items"}
          </summary>
          <ul>
            {trip.items.map((item, index) => (
              <li key={item.id}>
                <span>
                  {item.label ?? `Item ${index + 1}`}
                  {item.quantity > 1
                    ? ` · ${formatEur(item.unitPriceMinor, locale)} × ${item.quantity}`
                    : ""}
                </span>
                <strong>
                  {formatEur(lineTotal(item), locale)}
                </strong>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className={styles.tripActions}>
        <button
          type="button"
          className={styles.repeatTripButton}
          disabled={!canRepeat}
          onClick={() => {
            onStartSimilar(trip);
          }}
        >
          Shop again
        </button>

        <button
          type="button"
          className={styles.deleteTripButton}
          data-delete-trip-id={trip.id}
          aria-expanded={deleting}
          disabled={!canChangeHistory}
          onClick={() => {
            if (deleting) {
              onCancelDelete();
            } else {
              onRequestDelete(trip);
            }
          }}
        >
          Delete trip
        </button>

        {deleting ? (
          <section
            className={styles.confirmation}
            aria-label="Confirm trip deletion"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCancelDelete();
              }
            }}
          >
            <div>
              <strong>Delete this trip?</strong>
              <p>
                This removes the trip record from this device.
                Remembered item prices are stored separately.
              </p>
            </div>
            <div className={styles.confirmationActions}>
              <button
                ref={confirmationCancelRef}
                type="button"
                className={styles.secondaryButton}
                onClick={onCancelDelete}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => {
                  onConfirmDelete(trip);
                }}
              >
                Yes, delete
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </li>
  );
}
