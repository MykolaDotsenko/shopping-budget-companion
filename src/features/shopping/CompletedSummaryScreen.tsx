import { useMemo, useState } from "react";

import { useShoppingAppState } from "../../application/react/use-shopping-app-state";
import type { ShoppingAppController } from "../../application/shopping-app-controller";
import { formatEur, moneyInputValue, parseEurDraft } from "../../domain/money";
import {
  cartTotal,
  checkoutDifference,
  itemCount,
  type CompletedTrip,
} from "../../domain/shopping-trip";
import { HistoryIntegrityNotice } from "./HistoryIntegrityNotice";
import { PersistenceHealthNotice } from "./PersistenceHealthNotice";
import styles from "./CompletedSummaryScreen.module.css";
import {
  budgetOutcome,
  formatAbsoluteEur,
  moneyInputErrorMessage,
} from "./shopping-feedback";
import { SHOPPING_LOCALE } from "./shopping-locale";

export interface CompletedSummaryScreenProps {
  readonly controller: ShoppingAppController;
  readonly trip: CompletedTrip;
  readonly onDone: () => void;
  readonly onShopAgain: () => void;
  readonly onViewHistory: () => void;
  readonly locale?: string;
}

const reconciliationCopy = (
  trip: CompletedTrip,
  locale: string,
): string | null => {
  const difference = checkoutDifference(trip);

  if (difference === null) {
    return null;
  }

  if (difference === 0) {
    return "Your receipt matches your cart total exactly.";
  }

  if (difference > 0) {
    return `You paid ${formatAbsoluteEur(
      difference,
      locale,
    )} more than your cart total.`;
  }

  return `You paid ${formatAbsoluteEur(
    difference,
    locale,
  )} less than your cart total.`;
};

export function CompletedSummaryScreen({
  controller,
  trip,
  onDone,
  onShopAgain,
  onViewHistory,
  locale = SHOPPING_LOCALE,
}: CompletedSummaryScreenProps) {
  const state = useShoppingAppState(controller);
  const [checkoutRaw, setCheckoutRaw] = useState(() =>
    trip.actualCheckoutMinor === undefined
      ? ""
      : moneyInputValue(trip.actualCheckoutMinor),
  );
  const [inputError, setInputError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const currentTrip =
    state.completedSummary?.id === trip.id
      ? state.completedSummary
      : trip;
  const total = cartTotal(currentTrip);
  const quantity = itemCount(currentTrip);
  const reconciliation = reconciliationCopy(currentTrip, locale);
  const paidMore = (checkoutDifference(currentTrip) ?? 0) > 0;
  const outcome = budgetOutcome(currentTrip, locale);

  const parsedCheckout = useMemo(() => {
    if (checkoutRaw.trim() === "") {
      return null;
    }

    return parseEurDraft({
      raw: checkoutRaw,
      mode: "decimal",
    });
  }, [checkoutRaw]);

  const saveCheckout = (): void => {
    setInputError("");
    setStatusMessage("");

    if (parsedCheckout === null) {
      setInputError("Enter the receipt total first.");
      return;
    }

    if (!parsedCheckout.ok) {
      setInputError(moneyInputErrorMessage(parsedCheckout.error.code));
      return;
    }

    const result = controller.setActualCheckout(parsedCheckout.value);

    if (!result.ok) {
      setInputError(
        result.error.kind === "application" &&
          result.error.code === "completed-trip-not-found"
          ? "This trip was deleted from history, so its receipt total can’t be saved."
          : "Could not save that receipt total.",
      );
      return;
    }

    if (!result.changed) {
      setStatusMessage("This receipt total is already saved.");
      return;
    }

    setStatusMessage(
      result.durability === "persisted"
        ? "Receipt total saved."
        : "Receipt total updated here, but it isn’t saved yet.",
    );
  };

  const shopAgain = (): void => {
    setStatusMessage("");
    const result = controller.startTripFromCompleted(currentTrip.id);

    if (!result.ok) {
      setStatusMessage(
        result.error.kind === "application" &&
        result.error.code === "repeat-source-unavailable"
          ? "Retry saving before starting another trip from this budget."
          : "Could not start another trip from this budget.",
      );
      return;
    }

    onShopAgain();
  };

  const done = (): void => {
    setStatusMessage("");
    const result = controller.dismissCompletedSummary();

    if (!result.ok) {
      setStatusMessage(
        "Retry saving before leaving this completed-trip summary.",
      );
      return;
    }

    onDone();
  };

  return (
    <main className={styles.screen} aria-labelledby="completed-title">
      <section className={styles.shell}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Trip finished</p>
          <h1 id="completed-title" tabIndex={-1}>
            Your shopping trip is complete
          </h1>
          <p>
            Saved to History. Add your receipt total to see how close you
            were.
          </p>
        </header>

        <PersistenceHealthNotice
          controller={controller}
          health={state.persistence}
          context="completed"
        />
        <HistoryIntegrityNotice controller={controller} />

        <section className={styles.hero} aria-label="Completed trip summary">
          <span>Cart total</span>
          <strong>{formatEur(total, locale)}</strong>
          <small>
            {quantity} {quantity === 1 ? "item" : "items"} · budget{" "}
            {formatEur(currentTrip.budgetMinor, locale)}
          </small>
          <p className={styles.outcome} data-outcome={outcome.status}>
            {outcome.label}
          </p>
        </section>

        <section
          className={styles.reconciliation}
          aria-labelledby="checkout-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionKicker}>Optional</p>
              <h2 id="checkout-title">What did you pay?</h2>
            </div>
            {currentTrip.actualCheckoutMinor !== undefined ? (
              <strong>
                {formatEur(currentTrip.actualCheckoutMinor, locale)}
              </strong>
            ) : null}
          </div>

          <p className={styles.supporting}>
            Enter the total from your receipt to compare it with your cart.
            Your cart stays as it is.
          </p>

          <div className={styles.checkoutRow}>
            <label className={styles.field}>
              <span>Receipt total</span>
              <div className={styles.inputShell}>
                <span aria-hidden="true">€</span>
                <input
                  value={checkoutRaw}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  aria-invalid={Boolean(inputError)}
                  onChange={(event) => {
                    setCheckoutRaw(event.currentTarget.value);
                    setInputError("");
                    setStatusMessage("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveCheckout();
                    }
                  }}
                />
              </div>
            </label>
            <button
              type="button"
              className={styles.saveButton}
              onClick={saveCheckout}
            >
              Save receipt total
            </button>
          </div>

          {inputError ? (
            <p className={styles.error} role="alert">
              {inputError}
            </p>
          ) : null}

          {reconciliation ? (
            <p
              className={styles.difference}
              role="status"
              data-direction={paidMore ? "more" : "within"}
            >
              {reconciliation}
            </p>
          ) : null}
        </section>

        {statusMessage ? (
          <p className={styles.status} role="status" aria-live="polite">
            {statusMessage}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.repeatButton}
            onClick={shopAgain}
          >
            Shop again
          </button>
          <button
            type="button"
            className={styles.historyButton}
            onClick={onViewHistory}
          >
            View trip history
          </button>
          <button
            type="button"
            className={styles.doneButton}
            onClick={done}
          >
            Done
          </button>
        </div>
      </section>
    </main>
  );
}
