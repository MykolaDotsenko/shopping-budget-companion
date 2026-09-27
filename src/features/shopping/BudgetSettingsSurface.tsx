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
import { decimalAmountPlaceholder, SHOPPING_LOCALE } from "./shopping-locale";
import { englishTranslate, type Translate } from "./translation";

export interface SpendingPlanIntent {
  readonly budgetMinor: MinorUnits;
  readonly safetyBufferMinor: MinorUnits;
}

export interface BudgetSettingsSurfaceProps {
  readonly trip: ActiveTrip;
  readonly onCancel: () => void;
  readonly onSave: (intent: SpendingPlanIntent) => boolean | void;
  readonly locale?: string;
  readonly t?: Translate;
}

export function BudgetSettingsSurface({
  trip,
  onCancel,
  onSave,
  locale = SHOPPING_LOCALE,
  t = englishTranslate,
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
        message: moneyInputErrorMessage(budget.error.code, t),
      };
    }

    if (budget.value === 0) {
      return {
        ok: false as const,
        field: "budget" as const,
        message: t("Budget must be above €0."),
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
        message: moneyInputErrorMessage(buffer.error.code, t),
      };
    }

    if (buffer.value > budget.value) {
      return {
        ok: false as const,
        field: "buffer" as const,
        message: t("Safety buffer cannot be larger than the budget."),
      };
    }

    return {
      ok: true as const,
      budgetMinor: budget.value,
      safetyBufferMinor: buffer.value,
    };
  }, [budgetRaw, bufferRaw, t]);

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
        primary: t("Current cart will be {amount} over this budget.", {
          amount: formatAbsoluteEur(
            projection.value.remainingMinor,
            locale,
          ),
        }),
        secondary:
          t("You can still save it; the trip will show how far over you are."),
      };
    }

    if (projection.value.crossesSafeLimit) {
      return {
        status: "reserve" as const,
        primary: t("The current cart already uses part of this safety buffer."),
        secondary: t("{amount} of this {buffer} safety buffer would be left.", {
          amount: formatAbsoluteEur(
            projection.value.remainingMinor,
            locale,
          ),
          buffer: formatEur(
            parsedPlan.safetyBufferMinor,
            locale,
          ),
        }),
      };
    }

    return {
      status: "within" as const,
      primary:
        parsedPlan.safetyBufferMinor > 0
          ? t("{amount} safe to spend after saving", {
              amount: formatAbsoluteEur(
                projection.value.safeRemainingMinor,
                locale,
              ),
            })
          : t("{amount} left after saving", {
              amount: formatAbsoluteEur(
                projection.value.remainingMinor,
                locale,
              ),
            }),
      secondary:
        parsedPlan.safetyBufferMinor > 0
          ? t("{amount} is kept as your safety buffer.", {
              amount: formatEur(
                parsedPlan.safetyBufferMinor,
                locale,
              ),
            })
          : t("No safety buffer will be held back."),
    };
  }, [locale, parsedPlan, t, trip]);

  const submit = (): void => {
    if (submitting) {
      return;
    }

    setErrorMessage("");

    if (!parsedPlan.ok) {
      setErrorMessage(
        t("{field}: {message}", {
          field: parsedPlan.field === "budget" ? t("Budget") : t("Safety buffer"),
          message: parsedPlan.message,
        }),
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
        t("Could not update the spending plan. Check the values and try again."),
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
            <p className={styles.eyebrow}>{t("Trip settings")}</p>
            <h1 id="budget-settings-title">{t("Adjust budget")}</h1>
          </div>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            {t("Cancel")}
          </button>
        </header>

        <p className={styles.context}>
          {t("Your cart stays as it is. Cart total: {amount}.", {
            amount: formatEur(cartTotal(trip), locale),
          })}
        </p>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className={styles.field} htmlFor={budgetId}>
            <span>{t("Budget")}</span>
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
              {t("Safety buffer")} <small>{t("Optional")}</small>
            </span>
            <div className={styles.inputShell}>
              <span aria-hidden="true">€</span>
              <input
                ref={bufferRef}
                id={bufferId}
                value={bufferRaw}
                inputMode="decimal"
                autoComplete="off"
                placeholder={decimalAmountPlaceholder(locale)}
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
              <p>{t("Budget and buffer are saved together as one change.")}</p>
            )}
          </div>

          <button
            type="submit"
            className={styles.saveButton}
            disabled={submitting}
          >
            {submitting ? t("Saving…") : t("Save budget")}
          </button>
        </form>
      </section>
    </main>
  );
}
