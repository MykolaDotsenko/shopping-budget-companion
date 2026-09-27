import type { Ref } from "react";

import type { VisualProductCandidate } from "../../application/visual-recognition-ports";
import styles from "./ScanSurface.module.css";
import { englishTranslate, type Translate } from "./translation";

export type VisualRecognitionProblem =
  | "no-frame"
  | "no-match"
  | "timeout"
  | "engine-failed";

export type VisualRecognitionOutcome =
  | {
      readonly kind: "candidates";
      readonly candidates: readonly VisualProductCandidate[];
    }
  | { readonly kind: "problem"; readonly problem: VisualRecognitionProblem };

export interface ScanVisualResultProps {
  readonly outcome: VisualRecognitionOutcome;
  readonly capturedUrl: string | null;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly onChoose: (label: string) => void;
  readonly onRetake: () => void;
  readonly onTypePrice: () => void;
  readonly t?: Translate;
}

const problemCopy = (
  problem: VisualRecognitionProblem,
  t: Translate,
): string => {
  switch (problem) {
    case "no-frame":
      return t("The camera didn't give a picture. Try again.");
    case "no-match":
      return t("No useful match was found. Try a clearer view, or enter the product manually.");
    case "timeout":
      return t("Recognition took too long. Try again, or enter the product manually.");
    case "engine-failed":
      return t("The product recognizer couldn't start. Check your connection and try again, or enter the product manually.");
    default: {
      const exhaustive: never = problem;
      return exhaustive;
    }
  }
};

export function ScanVisualResult({
  outcome,
  capturedUrl,
  headingRef,
  onChoose,
  onRetake,
  onTypePrice,
  t = englishTranslate,
}: ScanVisualResultProps) {
  const candidates = outcome.kind === "candidates" ? outcome.candidates : [];
  const heading =
    outcome.kind === "candidates"
      ? candidates.length === 1
        ? t("Check the product")
        : t("Choose the product")
      : outcome.problem === "no-match"
        ? t("No product match")
        : t("Recognition unavailable");

  return (
    <section className={styles.result} aria-labelledby="scan-result-title">
      <h2 id="scan-result-title" ref={headingRef} tabIndex={-1}>
        {heading}
      </h2>

      {capturedUrl !== null ? (
        <img
          className={styles.snapshot}
          src={capturedUrl}
          alt={t("Captured product used for recognition")}
        />
      ) : null}

      {outcome.kind === "candidates" ? (
        <>
          <p>
            {t("Choose what you are holding. Suggestions are ranked, not certainties.")}
          </p>
          <ul className={styles.candidates}>
            {candidates.map((candidate, index) => (
              <li key={candidate.label}>
                <button
                  type="button"
                  className={index === 0 ? styles.candidatePrimary : styles.candidate}
                  onClick={() => {
                    onChoose(candidate.label);
                  }}
                >
                  <span>{candidate.label}</span>
                  <span className={styles.tag}>
                    {index === 0 ? t("Best match") : t("Alternative")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{problemCopy(outcome.problem, t)}</p>
      )}

      <p className={styles.note}>
        {t("Recognition is on-device. The photo is not uploaded.")}
      </p>

      <div className={styles.row}>
        <button type="button" className={styles.secondary} onClick={onRetake}>
          {t("Try again")}
        </button>
        <button type="button" className={styles.secondary} onClick={onTypePrice}>
          {outcome.kind === "candidates" ? t("None of these") : t("Enter manually")}
        </button>
      </div>
    </section>
  );
}
