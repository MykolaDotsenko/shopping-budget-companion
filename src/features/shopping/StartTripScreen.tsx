import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  PersistenceHealth,
  ShoppingAppController,
  StartTripInput,
} from "../../application/shopping-app-controller";
import {
  formatEur,
  mvpMinorUnits,
  parseEurDraft,
  type MinorUnits,
  type MoneyInputErrorCode,
} from "../../domain/money";
import type { CompletedTrip } from "../../domain/shopping-trip";
import { HistoryIntegrityNotice } from "./HistoryIntegrityNotice";
import { PersistenceHealthNotice } from "./PersistenceHealthNotice";
import styles from "./StartTripScreen.module.css";
import { SHOPPING_LOCALE } from "./shopping-locale";

interface QuickBudget {
  readonly label: string;
  readonly amount: MinorUnits;
}

const asMinorUnits = (value: number): MinorUnits => {
  const result = mvpMinorUnits(value);

  if (!result.ok) {
    throw new Error("Static budget fixture is outside the money contract");
  }

  return result.value;
};

const ZERO_MINOR = asMinorUnits(0);

const QUICK_BUDGETS: readonly QuickBudget[] = Object.freeze([
  { label: "€25", amount: asMinorUnits(2_500) },
  { label: "€50", amount: asMinorUnits(5_000) },
  { label: "€75", amount: asMinorUnits(7_500) },
  { label: "€100", amount: asMinorUnits(10_000) },
]);

const inputErrorMessage = (code: MoneyInputErrorCode): string => {
  switch (code) {
    case "empty":
      return "Enter an amount.";
    case "incomplete":
      return "Finish the amount.";
    case "invalid-format":
      return "Use a valid euro amount, for example 37.50.";
    case "negative-not-allowed":
      return "Use an amount above zero.";
    case "too-many-fraction-digits":
      return "Use no more than two decimal places.";
    case "above-product-limit":
    case "unsafe-integer":
      return "That amount is too large.";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
};

const applicationErrorMessage = (
  result: ReturnType<ShoppingAppController["startTrip"]>,
): string => {
  if (result.ok) {
    return "";
  }

  if (result.error.kind === "domain") {
    switch (result.error.code) {
      case "invalid-budget":
        return "Set a budget above €0.";
      case "invalid-buffer":
        return "Keep the safety buffer within your budget.";
      default:
        return "Check the budget and try again.";
    }
  }

  switch (result.error.code) {
    case "not-ready":
      return "The shopping session is still starting.";
    case "active-trip-exists":
      return "A shopping trip is already active.";
    case "recovery-required":
      return "Resolve the saved-trip issue before starting a new trip.";
    case "no-active-trip":
      return "No active shopping trip is available.";
    case "completed-trip-not-found":
      return "That previous trip is no longer available.";
    case "repeat-source-unavailable":
      return "Your previous trip cannot be reused until saved data is healthy.";
    default:
      return "Unable to start the shopping trip.";
  }
};

interface ParsedBuffer {
  readonly ok: true;
  readonly value: MinorUnits;
}

interface InvalidBuffer {
  readonly ok: false;
  readonly message: string;
}

type BufferResult = ParsedBuffer | InvalidBuffer;

export interface StartTripScreenProps {
  readonly controller: ShoppingAppController;
  readonly onTripStarted?: (source: "new" | "repeat") => void;
  readonly completedTripCount?: number;
  readonly rememberedPriceCount?: number;
  readonly priceMemoryNeedsAttention?: boolean;
  readonly recentTrip?: CompletedTrip | null;
  readonly persistenceHealth?: PersistenceHealth;
  readonly onOpenHistory?: () => void;
  readonly locale?: string;
  readonly utilityControl?: ReactNode;
  readonly notice?: ReactNode;
  readonly footer?: ReactNode;
}

export function StartTripScreen({
  controller,
  onTripStarted,
  completedTripCount = 0,
  rememberedPriceCount = 0,
  priceMemoryNeedsAttention = false,
  recentTrip = null,
  persistenceHealth,
  onOpenHistory,
  locale = SHOPPING_LOCALE,
  utilityControl,
  notice,
  footer,
}: StartTripScreenProps) {
  const customRegionId = useId();
  const reserveInputId = useId();
  const customInputId = useId();
  const errorId = useId();

  const [customOpen, setCustomOpen] = useState(false);
  const [customBudget, setCustomBudget] = useState("");
  const [reserveRaw, setReserveRaw] = useState("");
  const [bufferOpen, setBufferOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (customOpen) {
      customInputRef.current?.focus();
      customInputRef.current
        ?.closest("form")
        ?.scrollIntoView?.({ block: "nearest" });
    }
  }, [customOpen]);

  const parseBuffer = (): BufferResult => {
    if (reserveRaw.trim() === "") {
      return {
        ok: true,
        value: ZERO_MINOR,
      };
    }

    const parsed = parseEurDraft({
      raw: reserveRaw,
      mode: "decimal",
    });

    if (!parsed.ok) {
      return {
        ok: false,
        message: inputErrorMessage(parsed.error.code),
      };
    }

    return {
      ok: true,
      value: parsed.value,
    };
  };

  const bufferPreview = parseBuffer();
  const bufferSummary = bufferPreview.ok
    ? formatEur(bufferPreview.value, locale)
    : "needs a valid amount";

  const start = (budgetMinor: MinorUnits): void => {
    setErrorMessage("");

    const buffer = parseBuffer();

    if (!buffer.ok) {
      setErrorMessage(
        `Safety buffer: ${buffer.message}`,
      );
      setBufferOpen(true);
      queueMicrotask(() => {
        document.getElementById(reserveInputId)?.focus();
      });
      return;
    }

    const input: StartTripInput = {
      budgetMinor,
      ...(buffer.value === ZERO_MINOR
        ? {}
        : { safetyBufferMinor: buffer.value }),
    };

    const result = controller.startTrip(input);

    if (!result.ok) {
      setErrorMessage(applicationErrorMessage(result));
      return;
    }

    onTripStarted?.("new");
  };

  const submitCustom = (): void => {
    setErrorMessage("");

    const parsedBudget = parseEurDraft({
      raw: customBudget,
      mode: "decimal",
    });

    if (!parsedBudget.ok) {
      setErrorMessage(inputErrorMessage(parsedBudget.error.code));
      return;
    }

    start(parsedBudget.value);
  };

  const repeatRecentTrip = (): void => {
    if (recentTrip === null) {
      return;
    }

    setErrorMessage("");
    const result = controller.startTripFromCompleted(recentTrip.id);

    if (!result.ok) {
      setErrorMessage(applicationErrorMessage(result));
      return;
    }

    onTripStarted?.("repeat");
  };

  return (
    <main className={styles.screen}>
      <section
        className={styles.panel}
        aria-labelledby="start-trip-title"
      >
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Shopping Budget Companion</p>
          <h1 id="start-trip-title" className={styles.title} tabIndex={-1}>
            How much can you spend today?
          </h1>
          <p className={styles.supporting}>
            Set your limit. Add prices. Always know what&apos;s left.
          </p>
        </div>

        {persistenceHealth ? (
          <PersistenceHealthNotice
            controller={controller}
            health={persistenceHealth}
            context="idle"
          />
        ) : null}
        <HistoryIntegrityNotice controller={controller} />

        {recentTrip !== null ? (
          <button
            type="button"
            className={styles.repeatButton}
            onClick={repeatRecentTrip}
          >
            <span className={styles.repeatCopy}>
              <span className={styles.repeatEyebrow}>Last trip</span>
              <strong>Shop again</strong>
              <small>
                {formatEur(recentTrip.budgetMinor, locale)} budget
                {recentTrip.safetyBufferMinor > 0
                  ? ` · ${formatEur(
                      recentTrip.safetyBufferMinor,
                      locale,
                    )} safety buffer`
                  : ""}
              </small>
            </span>
            <span className={styles.repeatArrow} aria-hidden="true">
              →
            </span>
          </button>
        ) : null}

        <div
          className={styles.quickGrid}
          aria-label="Quick budget choices"
        >
          {QUICK_BUDGETS.map((budget) => (
            <button
              key={budget.label}
              type="button"
              className={styles.quickButton}
              onClick={() => {
                start(budget.amount);
              }}
            >
              {budget.label}
            </button>
          ))}
        </div>

        <div className={styles.secondaryControls}>
          <button
            type="button"
            className={styles.customToggle}
            aria-expanded={customOpen}
            aria-controls={customRegionId}
            onClick={() => {
              setCustomOpen((open) => !open);
              setErrorMessage("");
            }}
          >
            Custom amount
          </button>

          {customOpen ? (
            <form
              id={customRegionId}
              className={styles.customRegion}
              onSubmit={(event) => {
                event.preventDefault();
                submitCustom();
              }}
            >
              <label
                htmlFor={customInputId}
                className={styles.label}
              >
                Custom budget
              </label>
              <div className={styles.inputShell}>
                <span aria-hidden="true" className={styles.currency}>
                  €
                </span>
                <input
                  ref={customInputRef}
                  id={customInputId}
                  className={styles.amountInput}
                  inputMode="decimal"
                  autoComplete="off"
                  value={customBudget}
                  placeholder="50.00"
                  aria-invalid={errorMessage !== ""}
                  aria-describedby={errorMessage ? errorId : undefined}
                  onChange={(event) => {
                    setCustomBudget(event.currentTarget.value);
                    setErrorMessage("");
                  }}
                />
              </div>
              <div
                id={errorId}
                className={styles.fieldError}
                role={errorMessage ? "alert" : undefined}
                aria-live="polite"
              >
                {errorMessage}
              </div>
              <button
                type="submit"
                className={styles.startButton}
              >
                Start shopping
              </button>
            </form>
          ) : null}

          <details
            className={styles.reserveDetails}
            open={bufferOpen}
            onToggle={(event) => {
              setBufferOpen(event.currentTarget.open);
            }}
          >
            <summary className={styles.reserveSummary}>
              {bufferOpen || reserveRaw.trim() === ""
                ? "Add a safety buffer"
                : `Safety buffer ${bufferSummary}`}
            </summary>
            <div className={styles.reserveField}>
              <label
                htmlFor={reserveInputId}
                className={styles.label}
              >
                Safety buffer
                <span className={styles.optional}>Optional</span>
              </label>
              <div className={styles.inputShell}>
                <span aria-hidden="true" className={styles.currency}>
                  €
                </span>
                <input
                  id={reserveInputId}
                  className={styles.amountInput}
                  inputMode="decimal"
                  autoComplete="off"
                  value={reserveRaw}
                  placeholder="0"
                  aria-describedby={errorMessage ? errorId : undefined}
                  onChange={(event) => {
                    setReserveRaw(event.currentTarget.value);
                    setErrorMessage("");
                  }}
                />
              </div>
              <p className={styles.hint}>
                Keep a little in reserve for weighed items, deposits,
                and small price differences.
              </p>
            </div>
          </details>
        </div>

        {customOpen ? null : (
          <div
            id={errorId}
            className={styles.error}
            role={errorMessage ? "alert" : undefined}
            aria-live="polite"
          >
            {errorMessage}
          </div>
        )}

        {(completedTripCount > 0 ||
          rememberedPriceCount > 0 ||
          priceMemoryNeedsAttention) &&
        onOpenHistory ? (
          <button
            type="button"
            className={styles.historyButton}
            onClick={onOpenHistory}
          >
            {completedTripCount > 0
              ? `View trip history · ${completedTripCount}`
              : rememberedPriceCount > 0
                ? `Manage remembered prices · ${rememberedPriceCount}`
                : "Repair remembered prices"}
          </button>
        ) : null}

        <p className={styles.trustNote}>
          No account. Your shopping data stays on this device.
        </p>

        {notice ?? null}
        {utilityControl ?? null}
        {footer ?? null}
      </section>
    </main>
  );
}
