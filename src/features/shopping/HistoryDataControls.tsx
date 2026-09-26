import type { RefObject } from "react";

import styles from "./HistoryScreen.module.css";

export type HistoryDataConfirmation =
  | "none"
  | "clear-history"
  | "clear-price-memory";

export interface HistoryDataControlsProps {
  readonly tripCount: number;
  readonly priceMemoryCount: number;
  readonly priceMemoryDegraded: boolean;
  readonly barcodeNameCount?: number;
  readonly canChangeHistory: boolean;
  readonly sessionOnly?: boolean;
  readonly confirmation: HistoryDataConfirmation;
  readonly confirmationCancelRef: RefObject<HTMLButtonElement | null>;
  readonly onRequestClearHistory: () => void;
  readonly onConfirmClearHistory: () => void;
  readonly onRequestClearPriceMemory: () => void;
  readonly onConfirmClearPriceMemory: () => void;
  readonly onCancel: () => void;
}

export function HistoryDataControls({
  tripCount,
  priceMemoryCount,
  priceMemoryDegraded,
  barcodeNameCount = 0,
  canChangeHistory,
  sessionOnly = false,
  confirmation,
  confirmationCancelRef,
  onRequestClearHistory,
  onConfirmClearHistory,
  onRequestClearPriceMemory,
  onConfirmClearPriceMemory,
  onCancel,
}: HistoryDataControlsProps) {
  return (
    <section
      className={styles.dataControls}
      aria-labelledby="data-controls-title"
    >
      <div>
        <p className={styles.sectionKicker}>Local data</p>
        <h2 id="data-controls-title">Data controls</h2>
        <p>
          Clear either one on its own. Both are stored only on this device.
        </p>
      </div>

      {sessionOnly && (tripCount > 0 || priceMemoryCount > 0) ? (
        <p className={styles.controlNote}>
          This session is not saving, so stored trips and remembered prices
          stay as they are.
        </p>
      ) : !canChangeHistory && tripCount > 0 ? (
        <p className={styles.controlNote}>
          Fix the local-save warning before changing trip history.
        </p>
      ) : null}

      {confirmation === "clear-history" ? (
        <section
          className={styles.confirmation}
          aria-label="Confirm clearing trip history"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        >
          <div>
            <strong>Clear all trip history?</strong>
            <p>
              This removes {tripCount} completed{" "}
              {tripCount === 1 ? "trip" : "trips"}.
              Remembered item prices will stay available.
            </p>
          </div>
          <div className={styles.confirmationActions}>
            <button
              ref={confirmationCancelRef}
              type="button"
              className={styles.secondaryButton}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={onConfirmClearHistory}
            >
              Clear trip history
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className={styles.dataAction}
          data-clear-trip-history-trigger
          disabled={tripCount === 0 || !canChangeHistory}
          onClick={onRequestClearHistory}
        >
          <span>
            <strong>Clear trip history</strong>
            <small>
              {tripCount === 0
                ? "No completed trips stored"
                : `${tripCount} completed ${tripCount === 1 ? "trip" : "trips"}`}
            </small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      {confirmation === "clear-price-memory" ? (
        <section
          className={styles.confirmation}
          aria-label="Confirm clearing remembered prices"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        >
          <div>
            <strong>Clear remembered prices?</strong>
            <p>
              This removes remembered item names, prices and barcode names
              used for faster repeat shopping. Completed trip history will
              stay.
            </p>
          </div>
          <div className={styles.confirmationActions}>
            <button
              ref={confirmationCancelRef}
              type="button"
              className={styles.secondaryButton}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={onConfirmClearPriceMemory}
            >
              Clear remembered prices
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className={styles.dataAction}
          data-clear-price-memory-trigger
          disabled={
            sessionOnly ||
            (priceMemoryCount === 0 &&
              barcodeNameCount === 0 &&
              !priceMemoryDegraded)
          }
          onClick={onRequestClearPriceMemory}
        >
          <span>
            <strong>Clear remembered prices</strong>
            <small>
              {priceMemoryCount > 0
                ? `${priceMemoryCount} remembered ${priceMemoryCount === 1 ? "item" : "items"}`
                : barcodeNameCount > 0
                  ? `${barcodeNameCount} remembered barcode ${barcodeNameCount === 1 ? "name" : "names"}`
                  : priceMemoryDegraded
                    ? "Reset the damaged remembered-price record"
                    : "No remembered prices stored"}
            </small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      )}
    </section>
  );
}
