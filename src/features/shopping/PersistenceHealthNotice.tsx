import { useEffect, useRef, useState } from "react";

import { useShoppingAppState } from "../../application/react/use-shopping-app-state";
import type {
  PersistenceHealth,
  PersistenceProblem,
  ShoppingAppController,
} from "../../application/shopping-app-controller";
import styles from "./PersistenceHealthNotice.module.css";

export interface PersistenceHealthNoticeProps {
  readonly controller: ShoppingAppController;
  readonly health: PersistenceHealth;
  readonly context?: "active" | "completed" | "idle";
}

const retryIsMeaningful = (issue: PersistenceProblem): boolean =>
  ![
    "session-only",
    "storage-unavailable",
    "legacy-retirement-failed",
    "invalid-history-entry",
    "history-conflict",
    "unsupported-version",
    "malformed-json",
    "invalid-envelope",
    "invalid-data",
  ].includes(issue.code);

const tripsToRemove = (removable: number): number =>
  Math.min(removable, Math.max(1, Math.ceil(removable / 10)));

const removalCopy = (
  removing: number,
  removable: number,
): { readonly action: string; readonly detail: string } => {
  if (removing === removable) {
    return removing === 1
      ? { action: "Remove the only trip", detail: "Your only trip in history" }
      : { action: `Remove all ${removing} trips`, detail: `All ${removing} trips in history` };
  }

  return removing === 1
    ? { action: "Remove the oldest trip", detail: "Your oldest trip" }
    : { action: `Remove ${removing} oldest trips`, detail: `Your ${removing} oldest trips` };
};

const noticeCopy = (
  issue: PersistenceProblem,
  context: "active" | "completed" | "idle",
): {
  readonly title: string;
  readonly body: string;
  readonly risk: "trip" | "cleanup";
} => {
  if (issue.code === "storage-full") {
    return {
      title: "Storage for this app is full",
      body:
        context === "active"
          ? "This trip can’t be saved until there is room. Your totals still work in this tab."
          : context === "completed"
            ? "The latest change to this trip can’t be saved until there is room. Done keeps the trip as it was last saved."
            : "Changes can’t be saved until there is room.",
      risk: "trip",
    };
  }

  if (context === "completed") {
    if (
      issue.code === "remove-failed" &&
      issue.storageKey === "budget-cart:active-trip"
    ) {
      return {
        title: "Trip saved — cleanup is incomplete",
        body:
          "Your completed trip is already in history, but an old active-trip copy could not be removed. Retry cleanup before leaving this summary.",
        risk: "cleanup",
      };
    }

    if (issue.storageKey === "budget-cart:history") {
      return {
        title: "Trip history is not fully saved",
        body:
          "The latest change to this trip could not be stored safely. Retry, or choose Done to keep the trip as it was last saved.",
        risk: "trip",
      };
    }
  }

  if (
    context === "idle" &&
    issue.code === "remove-failed" &&
    issue.storageKey === "budget-cart:active-trip"
  ) {
    return {
      title: "A finished trip left an old copy behind",
      body:
        "The finished trip is safe in history, but an old active copy of it could not be removed. Retry cleanup.",
      risk: "cleanup",
    };
  }

  if (context === "active" && issue.storageKey === "budget-cart:history") {
    return {
      title: "This trip could not be added to history",
      body:
        "Finishing did not save it to history, so the trip is still open here. Keep this page open and try finishing again.",
      risk: "trip",
    };
  }

  switch (issue.code) {
    case "session-only":
      return {
        title: "Not saving on this device",
        body:
          context === "active"
            ? "You chose to continue without saving, so saved data here stays untouched. Your totals work in this tab, but closing or reloading it loses this trip."
            : "You chose to continue without saving, so saved data here stays untouched. Reload the app to return to recovery.",
        risk: "trip",
      };
    case "legacy-retirement-failed":
      return {
        title: "Old app data could not be cleaned up",
        body:
          context === "active"
            ? "Your current shopping trip is still available. Older unrelated local data was left untouched and was not converted into shopping money."
            : "Older unrelated local data was left untouched and was not converted into shopping money.",
        risk: "cleanup",
      };
    case "storage-unavailable":
      return {
        title:
          context === "active"
            ? "This trip cannot be saved on this device"
            : "Shopping data cannot be saved on this device",
        body:
          context === "active"
            ? "Browser storage is unavailable. Your totals still work in this tab, but reloading or closing it can lose this trip."
            : "Browser storage is unavailable. Changes made in this tab may be lost after reload or close.",
        risk: "trip",
      };
    default:
      return {
        title:
          context === "active"
            ? "This trip is not being saved right now"
            : "Shopping data is not being saved right now",
        body:
          context === "active"
            ? "Keep this page open until checkout. Your totals still work in this tab, and you can retry saving without changing the cart."
            : "Keep this page open while you retry saving. We’ll confirm as soon as it’s saved.",
        risk: "trip",
      };
  }
};

export function PersistenceHealthNotice({
  controller,
  health,
  context = "active",
}: PersistenceHealthNoticeProps) {
  const state = useShoppingAppState(controller);
  const [retryMessage, setRetryMessage] = useState("");
  const [resolved, setResolved] = useState(false);
  const [confirmingRoom, setConfirmingRoom] = useState(false);
  const resolvedRef = useRef<HTMLParagraphElement>(null);
  const episode = health.status === "degraded" ? health.since : null;
  const [seenEpisode, setSeenEpisode] = useState(episode);

  if (episode !== seenEpisode) {
    setSeenEpisode(episode);

    if (episode !== null) {
      setResolved(false);
      setRetryMessage("");
      setConfirmingRoom(false);
    }
  }

  useEffect(() => {
    if (resolved) {
      resolvedRef.current?.focus();
    }
  }, [resolved]);

  if (health.status === "healthy") {
    return resolved ? (
      <aside
        className={styles.notice}
        data-risk="cleanup"
        aria-labelledby="persistence-notice-title"
      >
        <span className={styles.marker} aria-hidden="true">
          ✓
        </span>
        <div className={styles.copy}>
          <strong id="persistence-notice-title">Saved on this device</strong>
          <p ref={resolvedRef} tabIndex={-1} role="status">
            Saving works again.
          </p>
        </div>
      </aside>
    ) : null;
  }

  const copy = noticeCopy(health.issue, context);
  const removable =
    health.issue.code === "storage-full"
      ? state.completedTrips.filter(
          (trip) => trip.id !== state.completedSummary?.id,
        ).length
      : 0;
  const removing = tripsToRemove(removable);
  const canMakeRoom = removing > 0;
  const removal = removalCopy(removing, removable);
  const canRetry = !canMakeRoom && retryIsMeaningful(health.issue);

  const makeRoom = (): void => {
    setRetryMessage("");
    setConfirmingRoom(false);

    const result = controller.deleteOldestCompletedTrips(removing);

    if (!result.ok) {
      setRetryMessage("Trips could not be removed, so nothing was changed.");
      return;
    }

    if (result.state.persistence.status === "healthy") {
      setResolved(true);
      return;
    }

    setRetryMessage("There still isn’t enough room. You can remove more trips.");
  };

  const retry = (): void => {
    setRetryMessage("");

    const result = controller.retryPersistence();

    if (!result.ok) {
      setRetryMessage("Saving cannot be retried from the current app state.");
      return;
    }

    if (result.state.persistence.status === "healthy") {
      setResolved(true);
      return;
    }

    if (result.durability === "memory-only") {
      setRetryMessage(
        context === "active"
          ? "Still not saved. Keep this page open and try again later."
          : "Still not safely saved. Keep this page open and try again later.",
      );
    }
  };

  return (
    <aside
      className={styles.notice}
      data-risk={copy.risk}
      aria-labelledby="persistence-notice-title"
    >
      <span className={styles.marker} aria-hidden="true">
        !
      </span>
      <div className={styles.copy}>
        <strong id="persistence-notice-title">{copy.title}</strong>
        <p>
          {copy.body}
          {health.issue.code !== "storage-full"
            ? ""
            : canMakeRoom
              ? " Removing your oldest trips from history makes room."
              : " Free up storage this browser keeps for this site, then retry."}
          <span aria-live="polite">
            {confirmingRoom && canMakeRoom
              ? ` ${removal.detail} will be removed from this device; remembered prices stay.`
              : ""}
          </span>
        </p>
        {confirmingRoom && canMakeRoom ? (
          <button type="button" className={styles.retryButton} onClick={makeRoom}>
            {removal.action}
          </button>
        ) : null}
        {retryMessage ? (
          <p className={styles.retryStatus} role="status" aria-live="polite">
            {retryMessage}
          </p>
        ) : null}
      </div>
      {canMakeRoom ? (
        <button
          type="button"
          className={styles.retryButton}
          onClick={() => {
            setRetryMessage("");
            setConfirmingRoom((current) => !current);
          }}
        >
          {confirmingRoom ? "Keep all trips" : "Make room…"}
        </button>
      ) : null}
      {canRetry ? (
        <button type="button" className={styles.retryButton} onClick={retry}>
          Retry
        </button>
      ) : null}
    </aside>
  );
}
