import type { RefObject } from "react";

import { formatEur, type MinorUnits } from "../../domain/money";
import type { PriceTagCandidate } from "../../domain/shelf-price";
import {
  candidateContextLabel,
  priceProblemCopy,
  type PriceReadProblem,
} from "./scan-copy";
import styles from "./ScanSurface.module.css";
import { englishTranslate, type Translate } from "./translation";

const MAX_SHOWN_PRICE_CANDIDATES = 4;

export type PriceReadOutcome =
  | {
      readonly kind: "prices";
      readonly candidates: readonly PriceTagCandidate[];
    }
  | { readonly kind: "problem"; readonly problem: PriceReadProblem };

export interface ScanPriceResultProps {
  readonly outcome: PriceReadOutcome;
  readonly productLabel: string | null;
  readonly capturedUrl: string | null;
  readonly locale: string;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onChoose: (price: MinorUnits) => void;
  readonly onRetake: () => void;
  readonly onTypePrice: () => void;
  readonly t?: Translate;
}

export function ScanPriceResult({
  outcome,
  productLabel,
  capturedUrl,
  locale,
  headingRef,
  onChoose,
  onRetake,
  onTypePrice,
  t = englishTranslate,
}: ScanPriceResultProps) {
  const snapshot =
    capturedUrl === null ? null : (
      <img
        className={styles.snapshot}
        src={capturedUrl}
        alt={t("The price tag as captured")}
      />
    );

  if (outcome.kind === "problem") {
    return (
      <section className={styles.result} aria-labelledby="scan-result-title">
        <h2 id="scan-result-title" ref={headingRef} tabIndex={-1}>
          {outcome.problem === "engine-failed"
            ? t("Price reader unavailable")
            : t("No price found")}
        </h2>
        {snapshot}
        <p>{priceProblemCopy(outcome.problem, t)}</p>
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={onRetake}>
            {t("Try again")}
          </button>
          <button type="button" className={styles.secondary} onClick={onTypePrice}>
            {t("Type price")}
          </button>
        </div>
      </section>
    );
  }

  const shown = outcome.candidates.slice(0, MAX_SHOWN_PRICE_CANDIDATES);

  return (
    <section className={styles.result} aria-labelledby="scan-result-title">
      <h2 id="scan-result-title" ref={headingRef} tabIndex={-1}>
        {productLabel === null
          ? t("Choose the price")
          : t("Price for {item}", { item: productLabel })}
      </h2>
      {snapshot}
      <p>
        {t("Tap the amount that matches the shelf. You’ll check it once more before it’s added.")}
      </p>
      <ul className={styles.candidates} aria-label={t("Prices found on the tag")}>
        {shown.map((candidate, index) => {
          const tag = candidateContextLabel(candidate, t);

          return (
            <li key={Number(candidate.minorUnits)}>
              <button
                type="button"
                className={index === 0 ? styles.candidatePrimary : styles.candidate}
                onClick={() => {
                  onChoose(candidate.minorUnits);
                }}
              >
                <span className={styles.amount}>
                  {formatEur(candidate.minorUnits, locale)}
                </span>
                {tag === null ? null : (
                  <span className={styles.tag}>{tag}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.row}>
        <button type="button" className={styles.secondary} onClick={onRetake}>
          {t("Retake")}
        </button>
        <button type="button" className={styles.secondary} onClick={onTypePrice}>
          {t("Type price")}
        </button>
      </div>
    </section>
  );
}
