import type { RefObject } from "react";

import styles from "./HistoryScreen.module.css";
import {
  englishPluralTranslate,
  englishTranslate,
  type Translate,
  type TranslatePlural,
} from "./translation";

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
  readonly t?: Translate;
  readonly tp?: TranslatePlural;
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
  t = englishTranslate,
  tp = englishPluralTranslate,
}: HistoryDataControlsProps) {
  return (
    <section
      className={styles.dataControls}
      aria-labelledby="data-controls-title"
    >
      <div>
        <p className={styles.sectionKicker}>{t("Local data")}</p>
        <h2 id="data-controls-title">{t("Data controls")}</h2>
        <p>
          {t("Clear either one on its own. Both are stored only on this device.")}
        </p>
      </div>

      {sessionOnly && (tripCount > 0 || priceMemoryCount > 0) ? (
        <p className={styles.controlNote}>
          {t("This session is not saving, so stored trips and remembered prices stay as they are.")}
        </p>
      ) : !canChangeHistory && tripCount > 0 ? (
        <p className={styles.controlNote}>
          {t("Fix the local-save warning before changing trip history.")}
        </p>
      ) : null}

      {confirmation === "clear-history" ? (
        <section
          className={styles.confirmation}
          aria-label={t("Confirm clearing trip history")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        >
          <div>
            <strong>{t("Clear all trip history?")}</strong>
            <p>
              {t("This removes {trips}. Remembered item prices will stay available.", {
                trips: tp(
                  "{count} completed trip",
                  "{count} completed trips",
                  tripCount,
                ),
              })}
            </p>
          </div>
          <div className={styles.confirmationActions}>
            <button
              ref={confirmationCancelRef}
              type="button"
              className={styles.secondaryButton}
              onClick={onCancel}
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={onConfirmClearHistory}
            >
              {t("Clear trip history")}
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
            <strong>{t("Clear trip history")}</strong>
            <small>
              {tripCount === 0
                ? t("No completed trips stored")
                : tp(
                    "{count} completed trip",
                    "{count} completed trips",
                    tripCount,
                  )}
            </small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      {confirmation === "clear-price-memory" ? (
        <section
          className={styles.confirmation}
          aria-label={t("Confirm clearing remembered prices")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        >
          <div>
            <strong>{t("Clear remembered prices?")}</strong>
            <p>
              {t("This removes remembered item names, prices and barcode names used for faster repeat shopping. Completed trip history will stay.")}
            </p>
          </div>
          <div className={styles.confirmationActions}>
            <button
              ref={confirmationCancelRef}
              type="button"
              className={styles.secondaryButton}
              onClick={onCancel}
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={onConfirmClearPriceMemory}
            >
              {t("Clear remembered prices")}
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
            <strong>{t("Clear remembered prices")}</strong>
            <small>
              {priceMemoryCount > 0
                ? tp(
                    "{count} remembered item",
                    "{count} remembered items",
                    priceMemoryCount,
                  )
                : barcodeNameCount > 0
                  ? tp(
                      "{count} remembered barcode name",
                      "{count} remembered barcode names",
                      barcodeNameCount,
                    )
                  : priceMemoryDegraded
                    ? t("Reset the damaged remembered-price record")
                    : t("No remembered prices stored")}
            </small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      )}
    </section>
  );
}
