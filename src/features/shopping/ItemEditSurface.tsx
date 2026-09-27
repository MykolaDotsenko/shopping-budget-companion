import { useEffect, useMemo, useRef, useState } from "react";

import {
  formatEur,
  moneyInputValue,
  signedMinorUnits,
  type MinorUnits,
  type SignedMinorUnits,
} from "../../domain/money";
import {
  MAX_ITEM_LABEL_CODE_POINTS,
  cartTotal,
  reduceTrip,
  remaining,
  safeRemaining,
  type ActiveTrip,
  type CartItem,
} from "../../domain/shopping-trip";
import {
  classifyPriceEntryDraft,
  replacePriceEntryRaw,
  type PriceEntryDraft,
} from "./price-entry-draft";
import {
  canIncreaseQuantity,
  canDecreaseQuantity,
  decreaseQuantity,
  increaseQuantity,
} from "./quantity-draft";
import { trustLabel } from "./item-trust";
import styles from "./ItemEditSurface.module.css";
import { SHOPPING_LOCALE } from "./shopping-locale";
import { englishTranslate, type Translate } from "./translation";

export interface ItemEditIntent {
  readonly unitPriceMinor: MinorUnits;
  readonly quantity: number;
  readonly label?: string | null;
}

export interface ItemEditSurfaceProps {
  readonly trip: ActiveTrip;
  readonly item: CartItem;
  readonly onCancel: () => void;
  readonly onSave: (intent: ItemEditIntent) => boolean | void;
  readonly onRemove: () => boolean | void;
  readonly locale?: string;
  readonly t?: Translate;
}

const absoluteMoney = (value: number): SignedMinorUnits => {
  const result = signedMinorUnits(Math.abs(value));

  if (!result.ok) {
    throw new RangeError("Edited shopping amount exceeded safe integer bounds");
  }

  return result.value;
};

const GHOST_TAP_MS = 500;

export function ItemEditSurface({
  trip,
  item,
  onCancel,
  onSave,
  onRemove,
  locale = SHOPPING_LOCALE,
  t = englishTranslate,
}: ItemEditSurfaceProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openedAt = useRef(Number.POSITIVE_INFINITY);

  useEffect(() => {
    openedAt.current = performance.now();
  }, []);

  const [draft, setDraft] = useState<PriceEntryDraft>(() => ({
    raw: moneyInputValue(item.unitPriceMinor),
    mode: "decimal",
  }));
  const [quantity, setQuantity] = useState(item.quantity);
  const [label, setLabel] = useState(item.label ?? "");
  const [labelNotice, setLabelNotice] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const priceState = useMemo(
    () => classifyPriceEntryDraft(draft),
    [draft],
  );
  const validPrice =
    priceState.kind === "valid" ? priceState.value : null;

  const projectedTrip = useMemo(() => {
    if (validPrice === null) {
      return null;
    }

    const result = reduceTrip(trip, {
      type: "update-item",
      itemId: item.id,
      patch: {
        unitPriceMinor: validPrice,
        quantity,
      },
      now: item.updatedAt,
    });

    return result.ok && result.value.status === "active"
      ? result.value
      : null;
  }, [item.id, item.updatedAt, quantity, trip, validPrice]);

  const normalizedLabel = label.trim();
  const canonicalLabel = normalizedLabel === "" ? undefined : normalizedLabel;
  const changed =
    validPrice !== null &&
    (validPrice !== item.unitPriceMinor ||
      quantity !== item.quantity ||
      canonicalLabel !== item.label);

  const submit = (): void => {
    if (validPrice === null || !changed || submitted) {
      return;
    }

    setSubmissionError("");
    const accepted = onSave({
      unitPriceMinor: validPrice,
      quantity,
      ...(canonicalLabel === item.label
        ? {}
        : { label: canonicalLabel ?? null }),
    });

    if (accepted === false) {
      setSubmissionError(t("Could not save these changes. Try again."));
      return;
    }

    setSubmitted(true);
  };

  let projectionPrimary = "";
  let projectionSecondary = "";

  if (projectedTrip !== null) {
    const nominal = remaining(projectedTrip);
    const safe = safeRemaining(projectedTrip);

    if (nominal < 0) {
      projectionPrimary = t("After saving: {amount} over your limit", {
        amount: formatEur(absoluteMoney(nominal), locale),
      });
    } else if (projectedTrip.safetyBufferMinor > 0 && safe < 0) {
      projectionPrimary = t("After saving: {amount} safe to spend", {
        amount: formatEur(absoluteMoney(0), locale),
      });
      projectionSecondary = t("{amount} of your {buffer} safety buffer would be left.", {
        amount: formatEur(absoluteMoney(nominal), locale),
        buffer: formatEur(projectedTrip.safetyBufferMinor, locale),
      });
    } else if (projectedTrip.safetyBufferMinor > 0) {
      projectionPrimary = t("After saving: {amount} safe to spend", {
        amount: formatEur(absoluteMoney(safe), locale),
      });
      projectionSecondary = t("Your {buffer} safety buffer stays untouched.", {
        buffer: formatEur(projectedTrip.safetyBufferMinor, locale),
      });
    } else {
      projectionPrimary = t("After saving: {amount} left", {
        amount: formatEur(absoluteMoney(nominal), locale),
      });
    }

    if (projectionSecondary === "") {
      projectionSecondary = t("Cart would be {cart} of {budget}.", {
        cart: formatEur(cartTotal(projectedTrip), locale),
        budget: formatEur(projectedTrip.budgetMinor, locale),
      });
    }
  }

  const invalidMessage =
    priceState.kind === "invalid"
      ? t("Enter a valid price above €0 with no more than two decimals.")
      : priceState.kind === "incomplete"
        ? t("Finish the price.")
        : "";

  return (
    <main
      className={styles.screen}
      aria-labelledby="edit-item-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <section className={styles.sheet}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t("Edit item")}</p>
            <h1 id="edit-item-title">
              {item.label ?? t("Edit price and quantity")}
            </h1>
          </div>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            {t("Cancel")}
          </button>
        </header>

        <p className={styles.trust}>
          {trustLabel(item, t)}
        </p>

        <label className={styles.field}>
          <span>{t("Item name")} <small>{t("Optional · helps Recent Items")}</small></span>
          <input
            value={label}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. Milk 1L"
            onChange={(event) => {
              const characters = [...event.currentTarget.value];
              const tooLong = characters.length > MAX_ITEM_LABEL_CODE_POINTS;

              setLabel(characters.slice(0, MAX_ITEM_LABEL_CODE_POINTS).join(""));
              setLabelNotice(
                tooLong
                  ? t("Names stop at {max} characters; the rest was left out.", {
                      max: MAX_ITEM_LABEL_CODE_POINTS,
                    })
                  : "",
              );
            }}
          />
          {labelNotice ? (
            <small className={styles.error} role="status">
              {labelNotice}
            </small>
          ) : null}
        </label>

        <label className={styles.field}>
          <span>{t("Price")}</span>
          <div className={styles.priceInput}>
            <span aria-hidden="true">€</span>
            <input
              ref={inputRef}
              value={draft.raw}
              inputMode="decimal"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(invalidMessage)}
              onChange={(event) => {
                const nextRaw = event.currentTarget.value;

                setDraft((current) =>
                  replacePriceEntryRaw(current, nextRaw),
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          {invalidMessage ? (
            <small className={styles.error} role="status">
              {invalidMessage}
            </small>
          ) : null}
        </label>

        <section
          className={styles.quantitySection}
          aria-labelledby="edit-quantity-title"
        >
          <div>
            <span id="edit-quantity-title">{t("Quantity")}</span>
          </div>
          <div className={styles.stepper}>
            <button
              type="button"
              aria-label={t("Decrease edited quantity")}
              disabled={!canDecreaseQuantity(quantity)}
              onClick={() => {
                setQuantity((current) => decreaseQuantity(current));
              }}
            >
              −
            </button>
            <output aria-label={t("Edited quantity")}>{quantity}</output>
            <button
              type="button"
              aria-label={t("Increase edited quantity")}
              disabled={!canIncreaseQuantity(quantity)}
              onClick={() => {
                setQuantity((current) => increaseQuantity(current));
              }}
            >
              +
            </button>
          </div>
        </section>

        {projectionPrimary ? (
          <section className={styles.projection} aria-live="polite">
            <strong>{projectionPrimary}</strong>
            <span>{projectionSecondary}</span>
          </section>
        ) : null}

        {submissionError ? (
          <p className={styles.error} role="alert">
            {submissionError}
          </p>
        ) : null}

        <button
          type="button"
          className={styles.saveButton}
          disabled={!changed || validPrice === null || submitted}
          onClick={submit}
        >
          {submitted ? t("Saving…") : t("Save changes")}
        </button>

        <button
          type="button"
          className={styles.removeButton}
          onClick={(event) => {
            if (event.timeStamp - openedAt.current >= GHOST_TAP_MS) {
              onRemove();
            }
          }}
        >
          {t("Remove item")}
        </button>
      </section>
    </main>
  );
}
