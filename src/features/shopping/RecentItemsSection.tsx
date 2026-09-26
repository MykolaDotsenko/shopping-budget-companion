import { useEffect, useMemo, useRef, useState } from "react";

import { formatEur, signedMinorUnits } from "../../domain/money";
import {
  lastBoughtByProduct,
  productIdFromLabel,
  recentPriceMemories,
  type PriceMemoryRecord,
} from "../../domain/price-memory";
import {
  isoTimestamp,
  projectAddItem,
  type ActiveTrip,
  type CompletedTrip,
  type IsoTimestamp,
} from "../../domain/shopping-trip";
import styles from "./RecentItemsSection.module.css";
import { SHOPPING_LOCALE } from "./shopping-locale";

export interface RecentItemsSectionProps {
  readonly trip: ActiveTrip;
  readonly records: readonly PriceMemoryRecord[];
  readonly completedTrips?: readonly CompletedTrip[];
  readonly now?: IsoTimestamp;
  readonly onUseRemembered: (
    record: PriceMemoryRecord,
  ) => boolean | void;
  readonly onEnterCurrentPrice: (
    record: PriceMemoryRecord,
  ) => void;
  readonly locale?: string;
  readonly limit?: number;
  readonly persistenceDegraded?: boolean;
  readonly activeTripSaving?: boolean;
}

const localDay = (timestamp: string): number => {
  const date = new Date(timestamp);
  return Math.floor(
    (date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000,
  );
};

const ageLabel = (
  record: PriceMemoryRecord,
  now: IsoTimestamp,
): string => {
  const days = Math.max(0, localDay(now) - localDay(record.observedAt));

  if (days === 0) {
    return "Seen today";
  }

  if (days === 1) {
    return "Seen 1 day ago";
  }

  return `Seen ${days} days ago`;
};

const absoluteMoney = (
  value: number,
  locale: string,
): string => {
  const amount = signedMinorUnits(Math.abs(value));

  if (!amount.ok) {
    throw new RangeError("Recent-item projection exceeded safe integer bounds");
  }

  return formatEur(amount.value, locale);
};

const REPEAT_TAP_WINDOW_MS = 800;

const NO_TRIPS: readonly CompletedTrip[] = [];

const currentTimestamp = (): IsoTimestamp => {
  const parsed = isoTimestamp(new Date().toISOString());

  if (!parsed.ok) {
    throw new RangeError("Browser produced an invalid canonical timestamp");
  }

  return parsed.value;
};

export function RecentItemsSection({
  trip,
  records,
  completedTrips = NO_TRIPS,
  now,
  onUseRemembered,
  onEnterCurrentPrice,
  locale = SHOPPING_LOCALE,
  limit = 4,
  persistenceDegraded = false,
  activeTripSaving = true,
}: RecentItemsSectionProps) {
  const effectiveNow = now ?? currentTimestamp();
  const lastBoughtAt = useMemo(
    () => lastBoughtByProduct(completedTrips),
    [completedTrips],
  );
  const remembered = useMemo(
    () => recentPriceMemories(records, { limit: records.length, lastBoughtAt }),
    [lastBoughtAt, records],
  );
  const inCart = useMemo(
    () =>
      new Set(
        trip.items.flatMap((item) => {
          const productId =
            item.label === undefined ? null : productIdFromLabel(item.label);

          return productId?.ok === true ? [productId.value] : [];
        }),
      ),
    [trip.items],
  );
  const [showAll, setShowAll] = useState(false);
  const recent = showAll ? remembered : remembered.slice(0, limit);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const confirmationCancelRef = useRef<HTMLButtonElement>(null);
  const lastUseRef = useRef<{ readonly id: string; readonly at: number } | null>(
    null,
  );

  const addRemembered = (record: PriceMemoryRecord, now: number): boolean => {
    const last = lastUseRef.current;

    if (
      last !== null &&
      last.id === record.id &&
      now - last.at < REPEAT_TAP_WINDOW_MS
    ) {
      return true;
    }

    setErrorMessage("");
    const accepted = onUseRemembered(record);

    if (accepted === false) {
      setErrorMessage(
        `Could not add ${record.label}. Try again or enter the current price.`,
      );
      return false;
    }

    lastUseRef.current = { id: record.id, at: now };
    return true;
  };

  const restoreRememberedTrigger = (memoryId: string): void => {
    queueMicrotask(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        "[data-use-remembered-memory-id]",
      );

      for (const button of buttons) {
        if (button.dataset.useRememberedMemoryId === memoryId) {
          button.focus();
          break;
        }
      }
    });
  };

  const cancelPending = (memoryId: string): void => {
    setPendingId(null);
    restoreRememberedTrigger(memoryId);
  };

  useEffect(() => {
    if (pendingId !== null) {
      confirmationCancelRef.current?.focus();
    }
  }, [pendingId]);

  if (recent.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby="recent-items-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>Faster repeat shopping</p>
          <h2 id="recent-items-title">Recent Items</h2>
        </div>
        <span>{remembered.length} remembered</span>
      </div>

      <p className={styles.intro}>
        Prices from past trips. Check the shelf, or enter today’s price.
      </p>

      {persistenceDegraded ? (
        <p className={styles.memoryWarning} role="status">
          Recent Items are available now, but price-memory changes are not
          safely saving.
          {activeTripSaving ? " Your active cart is still saved independently." : ""}
        </p>
      ) : null}

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <ul className={styles.list}>
        {recent.map((record) => {
          const projection = projectAddItem(trip, {
            unitPriceMinor: record.unitPriceMinor,
            quantity: 1,
          });
          const crossesNominalBudget =
            projection.ok && projection.value.crossesNominalBudget;
          const isPending = pendingId === record.id;

          return (
            <li key={record.id} className={styles.item}>
              <div className={styles.identity}>
                <strong>{record.label}</strong>
                <span className={styles.price}>
                  {formatEur(record.unitPriceMinor, locale)}
                </span>
                <small>
                  Remembered · {ageLabel(record, effectiveNow)}
                  {record.storeId === undefined ? "" : " · Store-specific"}
                  {inCart.has(record.productId) ? " · In this cart" : ""}
                </small>
              </div>

              {isPending && projection.ok ? (
                <div
                  className={styles.confirmation}
                  role="group"
                  aria-label={`Confirm remembered price for ${record.label}`}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelPending(record.id);
                    }
                  }}
                >
                  <p>
                    This remembered price would put you{" "}
                    <strong>
                      {absoluteMoney(
                        projection.value.nominalOverageMinor,
                        locale,
                      )}
                    </strong>{" "}
                    over your limit.
                  </p>
                  <div className={styles.confirmationActions}>
                    <button
                      ref={confirmationCancelRef}
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        cancelPending(record.id);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={(event) => {
                        if (!addRemembered(record, event.timeStamp)) {
                          return;
                        }

                        setPendingId(null);
                        restoreRememberedTrigger(record.id);
                      }}
                    >
                      Add anyway
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.rememberedButton}
                    aria-label={`Use remembered price for ${record.label}`}
                    data-use-remembered-memory-id={record.id}
                    onClick={(event) => {
                      if (crossesNominalBudget) {
                        setErrorMessage("");
                        setPendingId(record.id);
                        return;
                      }

                      addRemembered(record, event.timeStamp);
                    }}
                  >
                    Use remembered price
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    aria-label={`Enter current price for ${record.label}`}
                    data-current-price-memory-id={record.id}
                    onClick={() => {
                      setPendingId(null);
                      setErrorMessage("");
                      onEnterCurrentPrice(record);
                    }}
                  >
                    Enter current price
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {remembered.length > limit ? (
        <button
          type="button"
          className={styles.moreButton}
          aria-expanded={showAll}
          onClick={() => {
            setShowAll((current) => !current);
          }}
        >
          {showAll ? "Show fewer" : `Show all ${remembered.length}`}
        </button>
      ) : null}
    </section>
  );
}
