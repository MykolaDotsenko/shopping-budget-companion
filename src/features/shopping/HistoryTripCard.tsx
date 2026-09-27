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
import {
  englishPluralTranslate,
  englishTranslate,
  type Translate,
  type TranslatePlural,
} from "./translation";

export interface HistoryTripCardProps {
  readonly trip: CompletedTrip;
  readonly locale: string;
  readonly t?: Translate;
  readonly tp?: TranslatePlural;
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
  t: Translate,
): string | null => {
  const difference = checkoutDifference(trip);

  if (difference === null) {
    return null;
  }

  if (difference === 0) {
    return t("Receipt matched");
  }

  return difference > 0
    ? t("Paid {amount} more", {
        amount: formatAbsoluteEur(difference, locale),
      })
    : t("Paid {amount} less", {
        amount: formatAbsoluteEur(difference, locale),
      });
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
  t = englishTranslate,
  tp = englishPluralTranslate,
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
  const difference = differenceLabel(trip, locale, t);
  const outcome = budgetOutcome(trip, locale, t);
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
      setCheckoutError(t("Enter the receipt total first."));
      return;
    }

    if (!parsed.ok) {
      setCheckoutError(moneyInputErrorMessage(parsed.error.code, t));
      return;
    }

    if (!onSaveCheckout(trip, parsed.value)) {
      setCheckoutError(t("The receipt total could not be saved. Nothing was changed."));
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
          <strong>{t("{amount} cart total", { amount: formatEur(tracked, locale) })}</strong>
        </div>
        <span className={styles.itemCount}>
          {tp("{count} item", "{count} items", quantity)}
        </span>
      </div>

      <dl className={styles.metrics}>
        <div>
          <dt>{t("Budget")}</dt>
          <dd>{formatEur(trip.budgetMinor, locale)}</dd>
        </div>
        <div>
          <dt>{t("Receipt")}</dt>
          <dd>
            {trip.actualCheckoutMinor === undefined
              ? t("Not added")
              : formatEur(trip.actualCheckoutMinor, locale)}
          </dd>
        </div>
        <div>
          <dt>{t("Budget outcome")}</dt>
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
            <span>{t("Receipt total")}</span>
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
              {t("Cancel")}
            </button>
            <button type="submit" className={styles.saveCheckoutButton}>
              {t("Save")}
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
            ? t("Add receipt total")
            : t("Change receipt total")}
        </button>
      ) : null}

      {checkoutSaved ? (
        <p className={styles.status} role="status">
          {t("Receipt total saved.")}
        </p>
      ) : null}

      {trip.items.length > 0 ? (
        <details className={styles.tripDetails}>
          <summary>
            {t("View {items}", {
              items: tp("{count} item", "{count} items", quantity),
            })}
          </summary>
          <ul>
            {trip.items.map((item, index) => (
              <li key={item.id}>
                <span>
                  {item.label ?? t("Item {number}", { number: index + 1 })}
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
          {t("Shop again")}
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
          {t("Delete trip")}
        </button>

        {deleting ? (
          <section
            className={styles.confirmation}
            aria-label={t("Confirm trip deletion")}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCancelDelete();
              }
            }}
          >
            <div>
              <strong>{t("Delete this trip?")}</strong>
              <p>
                {t("This removes the trip record from this device. Remembered item prices are stored separately.")}
              </p>
            </div>
            <div className={styles.confirmationActions}>
              <button
                ref={confirmationCancelRef}
                type="button"
                className={styles.secondaryButton}
                onClick={onCancelDelete}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => {
                  onConfirmDelete(trip);
                }}
              >
                {t("Yes, delete")}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </li>
  );
}
