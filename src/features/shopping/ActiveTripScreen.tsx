import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import { useShoppingAppState } from "../../application/react/use-shopping-app-state";
import { needsSaveAttention } from "../../application/session-only-persistence";
import type { ShoppingAppController } from "../../application/shopping-app-controller";
import { formatEur, signedMinorUnits } from "../../domain/money";
import type { PriceMemoryRecord } from "../../domain/price-memory";
import {
  cartTotal,
  itemCount,
  lineTotal,
  remaining,
  safeLimit,
  safeRemaining,
  type CartItem,
} from "../../domain/shopping-trip";
import { HistoryIntegrityNotice } from "./HistoryIntegrityNotice";
import { PersistenceHealthNotice } from "./PersistenceHealthNotice";
import { RecentItemsSection } from "./RecentItemsSection";
import { trustLabel } from "./item-trust";
import styles from "./ActiveTripScreen.module.css";
import { SHOPPING_LOCALE } from "./shopping-locale";

export interface ActiveTripScreenProps {
  readonly controller: ShoppingAppController;
  readonly onAddPrice: () => void;
  readonly onScan?: () => void;
  readonly scanLabel?: string;
  readonly scanButtonRef?: Ref<HTMLButtonElement>;
  readonly onFinishTrip?: () => void;
  readonly onAdjustBudget?: () => void;
  readonly addPriceButtonRef?: Ref<HTMLButtonElement>;
  readonly finishTripButtonRef?: Ref<HTMLButtonElement>;
  readonly adjustBudgetButtonRef?: Ref<HTMLButtonElement>;
  readonly feedbackMessage?: string;
  readonly onUndo?: () => void;
  readonly onEditItem?: (item: CartItem) => void;
  readonly onRemoveItem?: (item: CartItem) => void;
  readonly onUseRemembered?: (
    record: PriceMemoryRecord,
  ) => boolean | void;
  readonly onEnterCurrentPrice?: (record: PriceMemoryRecord) => void;
  readonly utilityControl?: ReactNode;
  readonly locale?: string;
}

const clampPercentage = (value: number): number =>
  Math.min(100, Math.max(0, value));

const settleRemaining = (element: HTMLParagraphElement | null): void => {
  if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    element?.animate?.({ opacity: [0.8, 1] }, { duration: 160 });
  }
};

const formatSignedAmount = (
  value: number,
  locale: string,
): string => {
  const amount = signedMinorUnits(value);

  if (!amount.ok) {
    throw new RangeError("Shopping summary amount exceeded safe integer bounds");
  }

  return formatEur(amount.value, locale);
};

const GHOST_TAP_MS = 600;

const UNDO_LABELS = {
  add: "Undo last add",
  edit: "Undo last edit",
  remove: "Undo last removal",
} as const;

export function ActiveTripScreen({
  controller,
  onAddPrice,
  onScan,
  scanLabel = "Scan barcode",
  scanButtonRef,
  onFinishTrip,
  onAdjustBudget,
  addPriceButtonRef,
  finishTripButtonRef,
  adjustBudgetButtonRef,
  feedbackMessage,
  onUndo,
  onEditItem,
  onRemoveItem,
  onUseRemembered,
  onEnterCurrentPrice,
  utilityControl,
  locale = SHOPPING_LOCALE,
}: ActiveTripScreenProps) {
  const lastRemovalAt = useRef(Number.NEGATIVE_INFINITY);
  const state = useShoppingAppState(controller);
  const [heroVisible, setHeroVisible] = useState(true);
  const observeHero = useCallback((hero: HTMLElement | null) => {
    if (hero === null || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setHeroVisible(entry?.isIntersecting ?? true);
    });
    observer.observe(hero);

    return () => {
      observer.disconnect();
    };
  }, []);
  const trip = state.activeTrip;
  if (state.lifecycle !== "active" || trip === null) {
    return null;
  }

  const total = cartTotal(trip);
  const nominalRemaining = remaining(trip);
  const protectedRemaining = safeRemaining(trip);
  const protectedLimit = safeLimit(trip);
  const hasBuffer = trip.safetyBufferMinor > 0;
  const nominalOverBudget = nominalRemaining < 0;
  const reserveInUse =
    hasBuffer && protectedRemaining < 0 && !nominalOverBudget;

  const heroAmount = nominalOverBudget
    ? Math.abs(nominalRemaining)
    : reserveInUse
      ? 0
      : hasBuffer
        ? protectedRemaining
        : nominalRemaining;

  const heroLabel = nominalOverBudget
    ? "over your limit"
    : reserveInUse
      ? "safe to spend"
      : hasBuffer
        ? "safe to spend"
        : "left";

  const spentPercent = clampPercentage(
    (total / trip.budgetMinor) * 100,
  );
  const safeBoundaryPercent = clampPercentage(
    (protectedLimit / trip.budgetMinor) * 100,
  );
  const reservePercent = hasBuffer
    ? clampPercentage(
        (trip.safetyBufferMinor / trip.budgetMinor) * 100,
      )
    : 0;

  const capacityStyle = {
    "--spent-percent": `${spentPercent}%`,
    "--safe-boundary-percent": `${safeBoundaryPercent}%`,
    "--reserve-percent": `${reservePercent}%`,
  } as CSSProperties;

  const totalQuantity = itemCount(trip);
  const status = nominalOverBudget
    ? "over"
    : reserveInUse
      ? "reserve"
      : "within";
  const heroContext =
    !hasBuffer || nominalOverBudget
      ? null
      : reserveInUse
        ? `${formatSignedAmount(nominalRemaining, locale)} of your ${formatEur(
            trip.safetyBufferMinor,
            locale,
          )} safety buffer left`
        : `plus a ${formatEur(trip.safetyBufferMinor, locale)} safety buffer`;
  const statusSentence = `${formatSignedAmount(heroAmount, locale)} ${heroLabel}${
    heroContext === null ? "" : `, ${heroContext}`
  }`;

  return (
    <main className={styles.screen}>
      {heroVisible ? null : (
        <p className={styles.stickyRemaining} data-status={status} aria-hidden="true">
          <strong>{formatSignedAmount(heroAmount, locale)}</strong> {heroLabel}
        </p>
      )}
      <section className={styles.shell} aria-labelledby="active-trip-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Shopping trip</p>
            <h1 id="active-trip-title" className={styles.title} tabIndex={-1}>
              Know what’s left
            </h1>
          </div>
          <p className={styles.itemCount}>
            {totalQuantity === 0
              ? "No items yet"
              : `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"}`}
          </p>
        </header>

        <section
          ref={observeHero}
          className={styles.hero}
          aria-label="Current spending status"
          data-status={status}
        >
          <p
            key={heroAmount}
            ref={settleRemaining}
            className={styles.heroAmount}
          >
            {formatSignedAmount(heroAmount, locale)}
          </p>
          <p className={styles.heroLabel}>{heroLabel}</p>
          {heroContext === null ? null : (
            <p className={styles.heroContext}>{heroContext}</p>
          )}
        </section>

        <PersistenceHealthNotice
          controller={controller}
          health={state.persistence}
        />
        <HistoryIntegrityNotice controller={controller} />

        <section className={styles.summary} aria-label="Budget summary">
          <div className={styles.summaryRow}>
            <span>Cart</span>
            <strong>
              {formatEur(total, locale)} of {formatEur(trip.budgetMinor, locale)}
            </strong>
          </div>

          <div
            className={styles.capacity}
            role="progressbar"
            aria-label="Shopping budget used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(spentPercent)}
            aria-valuetext={`${formatEur(total, locale)} in cart of ${formatEur(
              trip.budgetMinor,
              locale,
            )}. ${statusSentence}.`}
            data-status={status}
            style={capacityStyle}
          >
            <span className={styles.capacityFill} aria-hidden="true" />
            {hasBuffer ? (
              <span
                className={styles.reserveZone}
                data-consumed={reserveInUse || nominalOverBudget}
                aria-hidden="true"
              />
            ) : null}
          </div>

          {hasBuffer ? (
            <div className={styles.capacityLabels} aria-hidden="true">
              <span>Safe limit {formatEur(protectedLimit, locale)}</span>
              <span>
                Safety buffer {formatEur(trip.safetyBufferMinor, locale)}
              </span>
            </div>
          ) : null}
        </section>

        {feedbackMessage || (state.undo !== null && onUndo) ? (
          <div className={styles.feedback} data-status={status}>
            {feedbackMessage ? <p>{feedbackMessage}</p> : null}
            {state.undo !== null && onUndo ? (
              <button
                type="button"
                className={styles.undoButton}
                onClick={onUndo}
              >
                {feedbackMessage ? "Undo" : UNDO_LABELS[state.undo.description]}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className={styles.tripActions}>
          <button
            ref={addPriceButtonRef}
            type="button"
            className={styles.addButton}
            onClick={onAddPrice}
          >
            <span aria-hidden="true">+</span>
            <span>Add price</span>
          </button>
          {onScan ? (
            <button
              ref={scanButtonRef}
              type="button"
              className={styles.finishButton}
              onClick={onScan}
            >
              {scanLabel}
            </button>
          ) : null}
          {onAdjustBudget || onFinishTrip ? (
            <div className={styles.secondaryTripActions}>
              {onAdjustBudget ? (
                <button
                  ref={adjustBudgetButtonRef}
                  type="button"
                  className={styles.finishButton}
                  onClick={onAdjustBudget}
                >
                  Adjust budget
                </button>
              ) : null}
              {onFinishTrip ? (
                <button
                  ref={finishTripButtonRef}
                  type="button"
                  className={styles.finishButton}
                  onClick={onFinishTrip}
                >
                  Finish trip
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {state.priceMemories.length > 0 &&
        onUseRemembered &&
        onEnterCurrentPrice ? (
          <RecentItemsSection
            trip={trip}
            records={state.priceMemories}
            completedTrips={state.completedTrips}
            persistenceDegraded={needsSaveAttention(
              state.priceMemoryPersistence,
            )}
            activeTripSaving={state.persistence.status === "healthy"}
            onUseRemembered={onUseRemembered}
            onEnterCurrentPrice={onEnterCurrentPrice}
            locale={locale}
          />
        ) : null}

        <section className={styles.cart} aria-labelledby="cart-title">
          <div className={styles.cartHeading}>
            <div>
              <p className={styles.sectionKicker}>Current cart</p>
              <h2 id="cart-title">What you have added</h2>
            </div>
            <strong>{formatEur(total, locale)}</strong>
          </div>

          {trip.items.length === 0 ? (
            <div className={styles.emptyState}>
              <p>Nothing in your cart yet.</p>
              <span>
                Add each price as you shop. A name is optional.
              </span>
            </div>
          ) : (
            <ul className={styles.itemList}>
              {trip.items.map((item, index) => {
                const itemTotal = lineTotal(item);
                const itemName = item.label ?? `Item ${index + 1}`;

                return (
                  <li key={item.id} className={styles.item}>
                    <div className={styles.itemIdentity}>
                      <strong>{itemName}</strong>
                      {item.quantity > 1 ? (
                        <span>
                          {formatEur(item.unitPriceMinor, locale)} × {item.quantity}
                        </span>
                      ) : null}
                      {item.priceConfidence.kind !== "confirmed" ||
                      item.priceSource.kind !== "manual" ? (
                        <small
                          className={styles.itemTrust}
                          data-confidence={item.priceConfidence.kind}
                        >
                          {trustLabel(item)}
                        </small>
                      ) : null}
                    </div>

                    <div className={styles.itemActions}>
                      <strong className={styles.itemTotal}>
                        {formatEur(itemTotal, locale)}
                      </strong>
                      {onEditItem || onRemoveItem ? (
                        <div className={styles.itemButtons}>
                          {onEditItem ? (
                            <button
                              type="button"
                              className={styles.itemActionButton}
                              aria-label={`Edit ${itemName}`}
                              data-edit-item-id={item.id}
                              onClick={(event) => {
                                if (event.timeStamp - lastRemovalAt.current < GHOST_TAP_MS) {
                                  return;
                                }

                                onEditItem(item);
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                          {onRemoveItem ? (
                            <button
                              type="button"
                              className={styles.removeButton}
                              aria-label={`Remove ${itemName}`}
                              onClick={(event) => {
                                if (event.timeStamp - lastRemovalAt.current < GHOST_TAP_MS) {
                                  return;
                                }

                                lastRemovalAt.current = event.timeStamp;
                                onRemoveItem(item);
                              }}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {utilityControl}
      </section>
    </main>
  );
}
