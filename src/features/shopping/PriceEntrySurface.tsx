import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  formatEur,
  type MinorUnits,
  type MoneyDraftMode,
} from "../../domain/money";
import {
  MAX_ITEM_LABEL_CODE_POINTS,
  projectAddItem,
  type ActiveTrip,
  type TripProjection,
} from "../../domain/shopping-trip";
import {
  appendPriceDigit,
  appendPriceSeparator,
  backspacePriceEntry,
  classifyPriceEntryDraft,
  clearPriceEntry,
  initialPriceEntryDraft,
  priceEntryDraftFor,
  replacePriceEntryRaw,
  setPriceEntryMode,
  type PriceEntryDraft,
} from "./price-entry-draft";
import {
  canDecreaseQuantity,
  canIncreaseQuantity,
  decreaseQuantity,
  defaultQuantity,
  increaseQuantity,
} from "./quantity-draft";
import { PriceKeypad } from "./PriceKeypad";
import {
  errorMessage,
  formatAbsoluteSigned,
  projectionCopy,
} from "./price-entry-presentation";
import styles from "./PriceEntrySurface.module.css";
import { SHOPPING_LOCALE } from "./shopping-locale";

export interface ValidatedItemIntent {
  readonly unitPriceMinor: MinorUnits;
  readonly quantity: number;
  readonly label?: string;
}

export interface PriceTagDraft {
  readonly label?: string;
  readonly quantity: number;
}

export interface PriceEntrySurfaceProps {
  readonly trip: ActiveTrip;
  readonly onCancel: () => void;
  readonly onValidatedItem: (
    intent: ValidatedItemIntent,
  ) => boolean | void;
  readonly initialLabel?: string;
  readonly initialPrice?: MinorUnits;
  readonly initialQuantity?: number;
  readonly onReadPriceTag?: (draft: PriceTagDraft) => void;
  readonly initialMode?: MoneyDraftMode;
  readonly onModeChange?: (mode: MoneyDraftMode) => void;
  readonly locale?: string;
}

const prefersCustomKeypad = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

interface OverBudgetConfirmation {
  readonly intent: ValidatedItemIntent;
  readonly projection: TripProjection;
  readonly sourceTrip: ActiveTrip;
}

export function PriceEntrySurface({
  trip,
  onCancel,
  onValidatedItem,
  initialLabel,
  initialPrice,
  initialQuantity,
  onReadPriceTag,
  initialMode = "decimal",
  onModeChange,
  locale = SHOPPING_LOCALE,
}: PriceEntrySurfaceProps) {
  const amountInputId = useId();
  const statusId = useId();
  const projectionId = useId();
  const modeHintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const confirmationCancelRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [overBudgetConfirmation, setOverBudgetConfirmation] =
    useState<OverBudgetConfirmation | null>(null);
  const [tagDraft] = useState<PriceEntryDraft | null>(() =>
    initialPrice === undefined ? null : priceEntryDraftFor(initialPrice),
  );
  const [draft, setDraft] = useState<PriceEntryDraft>(
    () => tagDraft ?? initialPriceEntryDraft(initialMode),
  );
  const [quantity, setQuantity] = useState(
    () => initialQuantity ?? defaultQuantity(),
  );
  const [label, setLabel] = useState(initialLabel ?? "");
  const [keypadPresses, setKeypadPresses] = useState(0);
  const [labelNotice, setLabelNotice] = useState("");
  const [modeNotice, setModeNotice] = useState(false);

  useEffect(() => {
    if (prefersCustomKeypad()) {
      titleRef.current?.focus();
      return;
    }

    inputRef.current?.focus();
  }, []);

  const focusInputUnlessCoarse = (): void => {
    if (!prefersCustomKeypad()) {
      inputRef.current?.focus();
    }
  };

  const restoreEntryFocus = (): void => {
    queueMicrotask(() => {
      if (prefersCustomKeypad()) {
        titleRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    });
  };

  const state = useMemo(
    () => classifyPriceEntryDraft(draft),
    [draft],
  );

  const validPrice =
    state.kind === "valid" ? state.value : null;

  const priceFromTag =
    tagDraft !== null &&
    draft.raw === tagDraft.raw &&
    draft.mode === tagDraft.mode;

  const projectionResult = useMemo(
    () =>
      validPrice === null
        ? null
        : projectAddItem(trip, {
            unitPriceMinor: validPrice,
            quantity,
          }),
    [trip, validPrice, quantity],
  );

  const projection =
    projectionResult?.ok === true
      ? projectionResult.value
      : null;

  const consequence =
    projection === null
      ? null
      : projectionCopy(trip, projection, locale);

  const activeConfirmation =
    overBudgetConfirmation?.sourceTrip === trip
      ? overBudgetConfirmation
      : null;

  useEffect(() => {
    if (activeConfirmation !== null) {
      confirmationCancelRef.current?.focus();
    }
  }, [activeConfirmation]);

  const submitValidatedItem = (intent: ValidatedItemIntent): void => {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmissionError("");

    const accepted = onValidatedItem(intent);

    if (accepted === false) {
      submittingRef.current = false;
      setSubmitted(false);
      setSubmissionError("Could not add this item. Check the trip and try again.");
      return;
    }

    setSubmitted(true);
  };

  const commit = (): void => {
    if (
      validPrice === null ||
      submittingRef.current ||
      activeConfirmation !== null
    ) {
      return;
    }

    const normalizedLabel = label.trim();
    const intent: ValidatedItemIntent = {
      unitPriceMinor: validPrice,
      quantity,
      ...(normalizedLabel === ""
        ? {}
        : { label: normalizedLabel }),
    };

    if (projection?.crossesNominalBudget === true) {
      setOverBudgetConfirmation({
        intent,
        projection,
        sourceTrip: trip,
      });
      return;
    }

    submitValidatedItem(intent);
  };

  const cancelOverBudgetConfirmation = (): void => {
    setOverBudgetConfirmation(null);
    restoreEntryFocus();
  };

  const confirmOverBudget = (): void => {
    if (activeConfirmation === null) {
      return;
    }

    submitValidatedItem(activeConfirmation.intent);
  };

  const modeLocked = draft.raw !== "";
  const modeHint = !modeLocked
    ? "Cents mode needs no decimal point."
    : draft.mode === "decimal"
      ? "Clear the price to switch to cents."
      : "Clear the price to switch to euros.";

  const chooseMode = (mode: MoneyDraftMode): void => {
    if (modeLocked) {
      setModeNotice(mode !== draft.mode);
      return;
    }

    setDraft((current) => setPriceEntryMode(current, mode));
    onModeChange?.(mode);
    focusInputUnlessCoarse();
  };

  const pressKey = (key: string): void => {
    setModeNotice(false);
    setKeypadPresses((count) => count + 1);
    setDraft((current) => {
      if (key === "backspace") {
        return backspacePriceEntry(current);
      }

      if (key === ".") {
        return appendPriceSeparator(current);
      }

      return appendPriceDigit(current, key);
    });

    focusInputUnlessCoarse();
  };

  const invalidCopy =
    state.kind === "invalid"
      ? errorMessage(state.reason, draft.mode)
      : "";

  return (
    <main
      className={styles.screen}
      aria-labelledby="price-entry-title"
      onKeyDown={(event) => {
        if (event.key !== "Escape") {
          return;
        }

        event.preventDefault();

        if (activeConfirmation !== null) {
          cancelOverBudgetConfirmation();
        } else {
          onCancel();
        }
      }}
    >
      <div className={styles.sheet}>
        <div className={styles.sheetBody}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Add price</p>
              <h1
                ref={titleRef}
                id="price-entry-title"
                tabIndex={-1}
              >
                What does this item cost?
              </h1>
            </div>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
            >
              Cancel
            </button>
          </header>

          {initialLabel !== undefined ? (
            <p className={styles.currentPriceContext}>
              Current price for <strong>{initialLabel}</strong>
            </p>
          ) : null}

          <div className={styles.modeGroup}>
            <div
              className={styles.segmented}
              role="group"
              aria-label="Price entry mode"
              aria-describedby={modeHintId}
            >
              <button
                type="button"
                className={styles.modeButton}
                aria-pressed={draft.mode === "decimal"}
                aria-disabled={modeLocked || undefined}
                disabled={activeConfirmation !== null}
                onClick={() => {
                  chooseMode("decimal");
                }}
              >
                Euros
              </button>
              <button
                type="button"
                className={styles.modeButton}
                aria-pressed={draft.mode === "auto-cents"}
                aria-disabled={modeLocked || undefined}
                disabled={activeConfirmation !== null}
                onClick={() => {
                  chooseMode("auto-cents");
                }}
              >
                Cents mode
              </button>
            </div>
            <p
              id={modeHintId}
              className={styles.modeHint}
              data-shown={modeNotice || undefined}
            >
              {modeHint}
            </p>
          </div>

          <div className={styles.amountBlock}>
            <div className={styles.amountLabelRow}>
              <label htmlFor={amountInputId} className={styles.amountLabel}>
                Price
              </label>
              {onReadPriceTag !== undefined && activeConfirmation === null ? (
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => {
                    const normalized = label.trim();
                    onReadPriceTag(
                      normalized === ""
                        ? { quantity }
                        : { label: normalized, quantity },
                    );
                  }}
                >
                  Read price tag
                </button>
              ) : null}
            </div>
            <div className={styles.amountShell}>
              <span aria-hidden="true">€</span>
              <input
                ref={inputRef}
                id={amountInputId}
                className={styles.amountInput}
                value={draft.raw}
                inputMode={
                  draft.mode === "decimal"
                    ? "decimal"
                    : "numeric"
                }
                readOnly={activeConfirmation !== null}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                aria-describedby={statusId}
                placeholder={
                  draft.mode === "decimal" ? "0.00" : "0"
                }
                onChange={(event) => {
                  const nextRaw = event.currentTarget.value;

                  setModeNotice(false);
                  setDraft((current) =>
                    replacePriceEntryRaw(current, nextRaw),
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();

                    if (activeConfirmation === null) {
                      commit();
                    }
                  }
                }}
              />
            </div>

            <div
              id={statusId}
              className={styles.status}
              aria-live={
                submissionError || invalidCopy ? "polite" : undefined
              }
            >
              {submissionError ? (
                <span className={styles.error}>{submissionError}</span>
              ) : state.kind === "valid" ? (
                <span className={styles.validPreview}>
                  {formatEur(state.value, locale) === `€${draft.raw}`
                    ? null
                    : formatEur(state.value, locale)}
                  {priceFromTag ? (
                    <span className={styles.tagSource}>
                      {" "}
                      Read from the price tag. Check it matches the shelf.
                    </span>
                  ) : null}
                </span>
              ) : invalidCopy ? (
                <span className={styles.error}>{invalidCopy}</span>
              ) : state.kind === "incomplete" ? (
                <span>Finish the amount.</span>
              ) : draft.mode === "auto-cents" ? (
                <span>Cents mode: type 249 for €2.49.</span>
              ) : (
                <span>Type the price, like 2.49. A name is optional.</span>
              )}
            </div>
          </div>

          {consequence && activeConfirmation === null ? (
            <section
              id={projectionId}
              className={styles.projection}
              data-status={consequence.status}
              aria-label="Projected cart result"
            >
              <strong>{consequence.primary}</strong>
              {consequence.secondary ? (
                <span>{consequence.secondary}</span>
              ) : null}
            </section>
          ) : null}

          {activeConfirmation === null ? (
            <details className={styles.labelDetails}>
              <summary>Name for next time <span>Optional</span></summary>
              <label className={styles.labelField}>
                <span>Item name</span>
                <input
                  value={label}
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  placeholder="e.g. Milk 1L"
                  onChange={(event) => {
                    const characters = [...event.currentTarget.value];
                    const tooLong = characters.length > MAX_ITEM_LABEL_CODE_POINTS;

                    setLabel(characters.slice(0, MAX_ITEM_LABEL_CODE_POINTS).join(""));
                    setLabelNotice(
                      tooLong
                        ? `Names stop at ${MAX_ITEM_LABEL_CODE_POINTS} characters; the rest was left out.`
                        : "",
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commit();
                    }
                  }}
                />
              </label>
              <p className={styles.labelHint}>
                Named items show up in Recent Items next time.
              </p>
              {labelNotice ? (
                <p className={styles.labelError} role="status">
                  {labelNotice}
                </p>
              ) : null}
            </details>
          ) : null}

          <section
            className={styles.quantitySection}
            aria-labelledby="quantity-title"
          >
            <div className={styles.quantityCopy}>
              <span id="quantity-title">Quantity</span>
            </div>

            <div className={styles.quantityStepper}>
              <button
                type="button"
                className={styles.quantityButton}
                aria-label="Decrease quantity"
                disabled={
                  activeConfirmation !== null ||
                  !canDecreaseQuantity(quantity)
                }
                onClick={() => {
                  setQuantity((current) => decreaseQuantity(current));
                }}
              >
                −
              </button>
              <output
                className={styles.quantityValue}
                aria-label="Current quantity"
                aria-live="polite"
              >
                {quantity}
              </output>
              <button
                type="button"
                className={styles.quantityButton}
                aria-label="Increase quantity"
                disabled={
                  activeConfirmation !== null ||
                  !canIncreaseQuantity(quantity)
                }
                onClick={() => {
                  setQuantity((current) => increaseQuantity(current));
                }}
              >
                +
              </button>
            </div>
          </section>

          {projection !== null && validPrice !== null && quantity > 1 ? (
            <p className={styles.lineTotal}>
              {formatEur(validPrice, locale)} × {quantity} ={" "}
              {formatAbsoluteSigned(projection.lineTotalMinor, locale)}
            </p>
          ) : null}
        </div>

        {activeConfirmation === null ? (
          <>
          <PriceKeypad mode={draft.mode} onPress={pressKey} />
          <p className={styles.keypadEcho} aria-live="polite">
            {modeNotice
              ? modeHint
              : keypadPresses === 0
                ? ""
                : draft.raw === ""
                  ? "Price cleared"
                  : `Price ${draft.raw}`}
          </p>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.clearButton}
              disabled={draft.raw === ""}
              onClick={() => {
                setModeNotice(false);
                setDraft((current) => clearPriceEntry(current));
                focusInputUnlessCoarse();
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className={styles.addButton}
              disabled={validPrice === null || submitted}
              aria-describedby={projection === null ? undefined : projectionId}
              onClick={commit}
            >
              {submitted
                ? "Adding…"
                : `Add${projection === null ? "" : ` · ${formatAbsoluteSigned(projection.lineTotalMinor, locale)}`}`}
            </button>
          </div>

          </>
        ) : (
          <section
            className={styles.overBudgetConfirmation}
            aria-labelledby="over-budget-title"
            aria-describedby="over-budget-detail"
          >
            <div className={styles.confirmationCopy}>
              <p className={styles.confirmationEyebrow}>Over budget</p>
              <h2 id="over-budget-title">
                Add this price anyway?
              </h2>
              <p id="over-budget-detail">
                This puts you{" "}
                <strong>
                  {formatAbsoluteSigned(
                    activeConfirmation.projection.nominalOverageMinor,
                    locale,
                  )}
                </strong>{" "}
                over your limit. The cart would be{" "}
                {formatAbsoluteSigned(
                  activeConfirmation.projection.cartTotalMinor,
                  locale,
                )}{" "}
                of {formatEur(trip.budgetMinor, locale)}. Nothing has been
                added yet.
              </p>
            </div>

            <div className={styles.confirmationActions}>
              <button
                ref={confirmationCancelRef}
                type="button"
                className={styles.confirmationCancel}
                aria-describedby="over-budget-detail"
                onClick={cancelOverBudgetConfirmation}
              >
                Change price
              </button>
              <button
                type="button"
                className={styles.addAnywayButton}
                aria-describedby="over-budget-detail"
                disabled={submitted}
                onClick={confirmOverBudget}
              >
                {submitted
                  ? "Adding…"
                  : `Add ${formatAbsoluteSigned(
                      activeConfirmation.projection.lineTotalMinor,
                      locale,
                    )} anyway`}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
