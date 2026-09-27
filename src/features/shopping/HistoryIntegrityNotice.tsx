import { useEffect, useRef, useState } from "react";

import { useShoppingAppState } from "../../application/react/use-shopping-app-state";
import type {
  PersistenceProblem,
  ShoppingAppController,
} from "../../application/shopping-app-controller";
import { isSessionOnly } from "../../application/session-only-persistence";
import { focusNextScreen } from "./focus-next-screen";
import styles from "./PersistenceHealthNotice.module.css";
import {
  englishPluralTranslate,
  englishTranslate,
  type Translate,
  type TranslatePlural,
} from "./translation";

export interface HistoryIntegrityNoticeProps {
  readonly controller: ShoppingAppController;
  readonly t?: Translate;
  readonly tp?: TranslatePlural;
}

const SET_ASIDE_CODES = [
  "invalid-history-entry",
  "history-conflict",
  "malformed-json",
  "invalid-envelope",
  "invalid-data",
  "unsupported-version",
];

const historyCopy = (
  issue: PersistenceProblem,
  keptTripCount: number,
  t: Translate,
  tp: TranslatePlural,
): { readonly title: string; readonly body: string } => {
  switch (issue.code) {
    case "invalid-history-entry":
      return {
        title: t("Some trip history could not be restored"),
        body: tp(
          "{count} completed trip is still available. The damaged part was preserved rather than guessed or overwritten, so finished trips can't be added to history until it is set aside.",
          "{count} completed trips are still available. The damaged part was preserved rather than guessed or overwritten, so finished trips can't be added to history until it is set aside.",
          keptTripCount,
        ),
      };
    case "unsupported-version":
      return {
        title: t("Trip history was saved by a newer version"),
        body:
          t("This version can't read it, so it was preserved unchanged. Update the app to use it, or set it aside to keep finishing trips here."),
      };
    case "read-failed":
    case "storage-unavailable":
      return {
        title: t("Trip history can't be read right now"),
        body:
          t("Browser storage did not return the saved history. Nothing was changed; try reading it again."),
      };
    default:
      return {
        title: t("Trip history could not be read safely"),
        body:
          t("Saved history was preserved unchanged instead of being guessed. Finished trips can't be added to it until it is set aside."),
      };
  }
};

type Resolution = "set-aside" | "read";

const resolvedCopy = (resolution: Resolution, t: Translate): string =>
  resolution === "set-aside"
    ? t("Any unreadable record was kept as a backup copy on this device.")
    : t("Saved trip history was read successfully.");

export function HistoryIntegrityNotice({
  controller,
  t = englishTranslate,
  tp = englishPluralTranslate,
}: HistoryIntegrityNoticeProps) {
  const state = useShoppingAppState(controller);
  const [confirming, setConfirming] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [resolved, setResolved] = useState<Resolution | null>(null);
  const resolvedRef = useRef<HTMLParagraphElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const episode =
    state.historyIntegrity.status === "degraded"
      ? `${state.historyIntegrity.since}:${state.historyIntegrity.issue.code}`
      : null;
  const [seenEpisode, setSeenEpisode] = useState(episode);

  if (episode !== seenEpisode) {
    setSeenEpisode(episode);

    if (episode !== null) {
      setConfirming(false);
      setResolved(null);
      setStatusMessage("");
    }
  }

  useEffect(() => {
    if (resolved !== null) {
      resolvedRef.current?.focus();
    }
  }, [resolved]);

  const sessionOnly = isSessionOnly(state.persistence);

  if (state.historyIntegrity.status === "healthy") {
    return resolved === null ? null : (
      <aside
        className={styles.notice}
        data-risk="cleanup"
        aria-labelledby="history-integrity-title"
      >
        <span className={styles.marker} aria-hidden="true">
          ✓
        </span>
        <div className={styles.copy}>
          <strong id="history-integrity-title">{t("Trip history is readable again")}</strong>
          <p ref={resolvedRef} tabIndex={-1} role="status">
            {resolvedCopy(resolved, t)}
          </p>
        </div>
      </aside>
    );
  }

  if (sessionOnly) {
    return null;
  }

  const issue = state.historyIntegrity.issue;
  const copy = historyCopy(issue, state.completedTrips.length, t, tp);
  const settable = SET_ASIDE_CODES.includes(issue.code);
  const retryable =
    issue.code === "read-failed" || issue.code === "storage-unavailable";
  const inSummary = state.lifecycle === "completed-summary";
  const confirmingSetAside = confirming && settable;
  const keptCount = state.completedTrips.length;
  const afterSetAside = inSummary
    ? t(" The trip you just finished will then be saved to history again.")
    : state.activeTrip === null
      ? ""
      : t(" Your current trip is not affected.");
  const confirmation = t(
    "The unreadable record will be moved to a backup copy on this device and {history}.{after} Choose Set aside now to confirm, or Keep as is to leave it unchanged.",
    {
      history:
        keptCount === 0
          ? t("history will start empty")
          : tp(
              "{count} readable trip will be kept",
              "{count} readable trips will be kept",
              keptCount,
            ),
      after: afterSetAside,
    },
  );

  const retry = (): void => {
    setStatusMessage("");
    const lifecycle = state.lifecycle;
    const result = controller.retryHistoryRead();

    if (result.state.historyIntegrity.status === "degraded") {
      setStatusMessage(t("History still can't be read. Nothing was changed."));
      return;
    }

    if (result.state.lifecycle === lifecycle) {
      setResolved("read");
      return;
    }

    focusNextScreen();
  };

  const setAside = (): void => {
    setStatusMessage("");
    const result = controller.setAsideDamagedHistory();

    if (result.ok) {
      setResolved("set-aside");
      return;
    }

    setConfirming(false);
    setStatusMessage(
      t("History could not be set aside safely, so it was left unchanged."),
    );
    toggleRef.current?.focus();
  };

  return (
    <aside
      className={styles.notice}
      data-risk="trip"
      aria-labelledby="history-integrity-title"
    >
      <span className={styles.marker} aria-hidden="true">
        !
      </span>
      <div className={styles.copy}>
        <strong id="history-integrity-title">{copy.title}</strong>
        <p>
          {copy.body}
          <span aria-live="polite">
            {confirmingSetAside ? ` ${confirmation}` : ""}
          </span>
        </p>
        {confirmingSetAside ? (
          <button
            type="button"
            className={styles.retryButton}
            onClick={setAside}
          >
            {t("Set aside now")}
          </button>
        ) : null}
        {statusMessage ? (
          <p className={styles.retryStatus} role="status" aria-live="polite">
            {statusMessage}
          </p>
        ) : null}
      </div>
      {settable ? (
        <button
          ref={toggleRef}
          type="button"
          className={styles.retryButton}
          onClick={() => {
            setStatusMessage("");
            setConfirming((current) => !current);
          }}
        >
          {confirming ? t("Keep as is") : t("Set aside…")}
        </button>
      ) : null}
      {retryable ? (
        <button type="button" className={styles.retryButton} onClick={retry}>
          {t("Retry")}
        </button>
      ) : null}
    </aside>
  );
}
