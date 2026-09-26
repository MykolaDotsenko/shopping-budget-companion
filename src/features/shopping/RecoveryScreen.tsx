import { useState } from "react";

import { useShoppingAppState } from "../../application/react/use-shopping-app-state";
import type {
  PersistenceProblem,
  ShoppingAppController,
} from "../../application/shopping-app-controller";
import { focusNextScreen } from "./focus-next-screen";
import styles from "./RecoveryScreen.module.css";

export interface RecoveryScreenProps {
  readonly controller: ShoppingAppController;
}

const recoveryCopy = (
  issue: PersistenceProblem,
): {
  readonly title: string;
  readonly body: string;
} => {
  switch (issue.code) {
    case "unsupported-version":
      return {
        title: "Saved trip needs a newer app version",
        body:
          "This device contains shopping data written by a newer version. It has been preserved unchanged. Update the app to use it, or choose another way to continue below.",
      };
    case "malformed-json":
    case "invalid-envelope":
    case "invalid-data":
      return {
        title: "Saved trip needs recovery",
        body:
          "The saved shopping data could not be read safely. It has been preserved unchanged instead of being guessed into a cart.",
      };
    case "storage-unavailable":
      return {
        title: "This browser isn’t letting the app save",
        body:
          "Storage for this site is blocked or unavailable, for example by privacy settings. You can still shop in this tab. To keep trips between visits, allow this site to store data, then try again.",
      };
    default:
      return {
        title: "Saved trip could not be restored safely",
        body:
          "The app stopped before changing the saved data. You can try reading it again without overwriting the preserved record.",
      };
  }
};

const canSetAside = (issue: PersistenceProblem): boolean =>
  [
    "malformed-json",
    "invalid-envelope",
    "invalid-data",
    "unsupported-version",
  ].includes(issue.code);

export function RecoveryScreen({ controller }: RecoveryScreenProps) {
  const state = useShoppingAppState(controller);
  const [retryMessage, setRetryMessage] = useState("");

  if (state.lifecycle !== "recovery" || state.recovery === null) {
    return null;
  }

  const issue = state.recovery.issue;
  const copy = recoveryCopy(issue);
  const raw = state.recovery.raw;
  const setAsideAvailable = canSetAside(issue) && raw !== undefined;
  const storageBlocked = issue.code === "storage-unavailable";

  const retry = (): void => {
    setRetryMessage("");
    const next = controller.bootstrap();

    if (next.lifecycle === "recovery") {
      setRetryMessage(
        "The saved trip still cannot be restored safely. Nothing was overwritten.",
      );
      return;
    }

    focusNextScreen();
  };

  const setAside = (): void => {
    setRetryMessage("");
    const result = controller.setAsideUnreadableActiveTrip();

    if (!result.ok) {
      setRetryMessage(
        "The saved trip could not be set aside safely, so it was left unchanged.",
      );
      return;
    }

    focusNextScreen();
  };

  const continueWithoutSaving = (): void => {
    setRetryMessage("");

    if (controller.continueWithoutSaving().ok) {
      focusNextScreen();
    }
  };

  return (
    <main className={styles.screen}>
      <section
        className={styles.panel}
        aria-labelledby="recovery-title"
      >
        <div className={styles.icon} aria-hidden="true">
          !
        </div>

        <div className={styles.intro}>
          <p className={styles.eyebrow}>
            {storageBlocked ? "Saving is off" : "Recovery mode"}
          </p>
          <h1 id="recovery-title" tabIndex={-1}>
            {copy.title}
          </h1>
          <p>{copy.body}</p>
        </div>

        <div className={styles.actions}>
          {setAsideAvailable ? (
            <>
              <button
                type="button"
                className={styles.retryButton}
                onClick={setAside}
              >
                Set aside and start fresh
              </button>
              <p className={styles.safetyNote}>
                Keeps an exact backup of the unreadable trip on this device and
                starts a new saved trip. The backup is not shown in the app.
              </p>
            </>
          ) : null}
          <button
            type="button"
            className={
              setAsideAvailable ? styles.secondaryButton : styles.retryButton
            }
            onClick={continueWithoutSaving}
          >
            Continue without saving
          </button>
          <p className={styles.safetyNote}>
            Totals, finished trips and remembered prices work in this tab only;
            closing or reloading it loses them.
            {storageBlocked ? "" : " The saved record stays untouched."}
          </p>
          <button type="button" className={styles.linkButton} onClick={retry}>
            {storageBlocked ? "Try again" : "Try reading again"}
          </button>
        </div>

        {retryMessage ? (
          <p className={styles.retryStatus} role="status" aria-live="polite">
            {retryMessage}
          </p>
        ) : null}

        {raw !== undefined ? (
          <details className={styles.details}>
            <summary>Recovery details</summary>
            <p>
              This is the preserved raw record for diagnostics. Opening this
              section does not modify it.
            </p>
            <pre tabIndex={0} aria-label="Preserved raw record">
              {raw}
            </pre>
          </details>
        ) : null}
      </section>
    </main>
  );
}
