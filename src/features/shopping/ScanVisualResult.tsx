import type { Ref } from "react";

import type { VisualProductCandidate } from "../../application/visual-recognition-ports";
import styles from "./ScanSurface.module.css";

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
}

const problemCopy = (problem: VisualRecognitionProblem): string => {
  switch (problem) {
    case "no-frame":
      return "The camera didn't give a picture. Try again.";
    case "no-match":
      return "No useful match was found. Try a clearer view, or enter the product manually.";
    case "timeout":
      return "Recognition took too long. Try again, or enter the product manually.";
    case "engine-failed":
      return "The product recognizer couldn't start. Check your connection and try again, or enter the product manually.";
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
}: ScanVisualResultProps) {
  const candidates = outcome.kind === "candidates" ? outcome.candidates : [];
  const heading =
    outcome.kind === "candidates"
      ? candidates.length === 1
        ? "Check the product"
        : "Choose the product"
      : outcome.problem === "no-match"
        ? "No product match"
        : "Recognition unavailable";

  return (
    <section className={styles.result} aria-labelledby="scan-result-title">
      <h2 id="scan-result-title" ref={headingRef} tabIndex={-1}>
        {heading}
      </h2>

      {capturedUrl !== null ? (
        <img
          className={styles.snapshot}
          src={capturedUrl}
          alt="Captured product used for recognition"
        />
      ) : null}

      {outcome.kind === "candidates" ? (
        <>
          <p>
            Pick the product that matches what you are holding. These are
            ranked suggestions from a closed set, not certainty estimates.
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
                    {index === 0 ? "Best match" : "Alternative"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{problemCopy(outcome.problem)}</p>
      )}

      <p className={styles.note}>
        Recognition runs on this device. The photo is not uploaded; the model
        files may be downloaded on first use.
      </p>

      <div className={styles.row}>
        <button type="button" className={styles.secondary} onClick={onRetake}>
          Try again
        </button>
        <button type="button" className={styles.secondary} onClick={onTypePrice}>
          {outcome.kind === "candidates" ? "None of these" : "Enter manually"}
        </button>
      </div>
    </section>
  );
}
