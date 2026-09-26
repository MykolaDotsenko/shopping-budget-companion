import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  formatEur,
  moneyInputValue,
  parseEurDraft,
  type MinorUnits,
} from "../../domain/money";
import {
  cartTotal,
  projectSpendingPlan,
  type ActiveTrip,
} from "../../domain/shopping-trip";
import styles from "./BudgetSettingsSurface.module.css";
import { formatAbsoluteEur, moneyInputErrorMessage } from "./shopping-feedback";
import { SHOPPING_LOCALE } from "./shopping-locale";

export interface SpendingPlanIntent {
  readonly budgetMinor: MinorUnits;
  readonly safetyBufferMinor: MinorUnits;
}

export interface BudgetSettingsSurfaceProps {
  readonly trip: ActiveTrip;
  readonly onCancel: () => void;
  readonly onSave: (intent: SpendingPlanIntent) => boolean | void;
  readonly locale?: string;
}

export function BudgetSettingsSurface({
  trip,
  onCancel,
  onSave,
  locale = SHOPPING_LOCALE,
}: BudgetSettingsSurfaceProps) {
  const budgetId = useId();
  const bufferId = useId();
  const messageId = useId();
  const budgetRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<HTMLInputElement>(null);
  const [budgetRaw, setBudgetRaw] = useState(() => moneyInputValue(trip.budgetMinor));
  const [bufferRaw, setBufferRaw] = useState(() =>
    trip.safetyBufferMinor === 0 ? "" : moneyInputValue(trip.safetyBufferMinor),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    budgetRef.current?.focus();
  }, []);

  const parsedPlan = useMemo(() => {
    const budget = parseEurDraft({
      raw: budgetRaw,
      mode: "decimal",
    });

    if (!budget.ok) {
      return {
        ok: false as const,
        field: "budget" as const,
        message: moneyInputErrorMessage(budget.error.code),
      };
    }

    if (budget.value === 0) {
      return {
        ok: false as const,
        field: "budget" as const,
        message: "Budget must be above €0.",
      };
    }

    const normalizedBufferRaw =
      bufferRaw.trim() === "" ? "0" : bufferRaw;
    const buffer = parseEurDraft({
      raw: normalizedBufferRaw,
      mode: "decimal",
    });

    if (!buffer.ok) {
      return {
        ok: false as const,
        field: "buffer" as const,
        message: moneyInputErrorMessage(buffer.error.code),
      };
    }

    if (buffer.value > budget.value) {
      return {
        ok: false as const,
        field: "buffer" as const,
        message: "Safety buffer cannot be larger than the budget.",
      };
    }

    return {
      ok: true as const,
      budgetMinor: budget.value,
      safetyBufferMinor: buffer.value,
    };
  }, [budgetRaw, bufferRaw]);

  const preview = useMemo(() => {
    if (!parsedPlan.ok) {
      return null;
    }

    const projection = projectSpendingPlan(
      trip,
      parsedPlan.budgetMinor,
      parsedPlan.safetyBufferMinor,
    );

    if (!projection.ok) {
      return null;
    }

    if (projection.value.crossesNominalBudget) {
      return {
        status: "over" as const,
        primary: `Current cart will be ${formatAbsoluteEur(
          projection.value.remainingMinor,
          locale,
        )} over this budget.`,
        secondary:
          "You can still save it; the trip will show how far over you are.",
      };
    }

    if (projection.value.crossesSafeLimit) {
      return {
        status: "reserve" as const,
        primary: "The current cart already uses part of this safety buffer.",
        secondary: `${formatAbsoluteEur(
          projection.value.remainingMinor,
          locale,
        )} of this ${formatEur(
          parsedPlan.safetyBufferMinor,
          locale,
        )} safety buffer would be left.`,
      };
    }

    return {
      status: "within" as const,
      primary:
        parsedPlan.safetyBufferMinor > 0
          ? `${formatAbsoluteEur(
              projection.value.safeRemainingMinor,
              locale,
            )} safe to spend after saving`
          : `${formatAbsoluteEur(
              projection.value.remainingMinor,
              locale,
            )} left after saving`,
      secondary:
        parsedPlan.safetyBufferMinor > 0
          ? `${formatEur(
              parsedPlan.safetyBufferMinor,
              locale,
            )} is kept as your safety buffer.`
          : "No safety buffer will be held back.",
    };
  }, [locale, parsedPlan, trip]);

  const submit = (): void => {
    if (submitting) {
      return;
    }

    setErrorMessage("");

    if (!parsedPlan.ok) {
      setErrorMessage(
        `${parsedPlan.field === "budget" ? "Budget" : "Safety buffer"}: ${parsedPlan.message}`,
      );
      if (parsedPlan.field === "budget") {
        budgetRef.current?.focus();
      } else {
        bufferRef.current?.focus();
      }
      return;
    }

    setSubmitting(true);
    const accepted = onSave({
      budgetMinor: parsedPlan.budgetMinor,
      safetyBufferMinor: parsedPlan.safetyBufferMinor,
    });

    if (accepted === false) {
      setSubmitting(false);
      setErrorMessage(
        "Could not update the spending plan. Check the values and try again.",
      );
    }
  };

  return (
    <main
      className={styles.screen}
      aria-labelledby="budget-settings-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Trip settings</p>
            <h1 id="budget-settings-title">Adjust budget</h1>
          </div>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            Cancel
          </button>
        </header>

        <p className={styles.context}>
          Your cart stays as it is. Cart total:{" "}
          <strong>{formatEur(cartTotal(trip), locale)}</strong>.
        </p>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className={styles.field} htmlFor={budgetId}>
            <span>Budget</span>
            <div className={styles.inputShell}>
              <span aria-hidden="true">€</span>
              <input
                ref={budgetRef}
                id={budgetId}
                value={budgetRaw}
                inputMode="decimal"
                autoComplete="off"
                aria-describedby={messageId}
                onChange={(event) => {
                  setBudgetRaw(event.currentTarget.value);
                  setErrorMessage("");
                }}
              />
            </div>
          </label>

          <label className={styles.field} htmlFor={bufferId}>
            <span>
              Safety buffer <small>Optional</small>
            </span>
            <div className={styles.inputShell}>
              <span aria-hidden="true">€</span>
              <input
                ref={bufferRef}
                id={bufferId}
                value={bufferRaw}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-describedby={messageId}
                onChange={(event) => {
                  setBufferRaw(event.currentTarget.value);
                  setErrorMessage("");
                }}
              />
            </div>
          </label>

          <div id={messageId} className={styles.message}>
            {errorMessage ? (
              <p className={styles.error} role="alert">
                {errorMessage}
              </p>
            ) : preview ? (
              <div className={styles.preview} data-status={preview.status}>
                <strong>{preview.primary}</strong>
                <span>{preview.secondary}</span>
              </div>
            ) : (
              <p>Budget and buffer are saved together as one change.</p>
            )}
          </div>

          <button
            type="submit"
            className={styles.saveButton}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Save budget"}
          </button>
        </form>
      </section>
    </main>
  );
}
