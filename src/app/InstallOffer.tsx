import { useState, useSyncExternalStore } from "react";

import {
  isInstalledApp,
  isIosSafari,
  type InstallPromptSource,
} from "../infrastructure/runtime/install-prompt";
import { useI18n } from "./i18n-context";
import styles from "./InstallOffer.module.css";

export const INSTALL_OFFER_STORAGE_KEY = "shopping-budget:install-offer";

const readDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(INSTALL_OFFER_STORAGE_KEY) === "dismissed";
  } catch {
    return false;
  }
};

const canAddFromSafari = (): boolean =>
  !isInstalledApp() && isIosSafari(navigator.userAgent, navigator.maxTouchPoints);

const noPromptOnServer = (): null => null;

export interface InstallOfferProps {
  readonly source: InstallPromptSource;
  readonly hasSavedShopping: boolean;
}

export function InstallOffer({ source, hasSavedShopping }: InstallOfferProps) {
  const { t } = useI18n();
  const prompt = useSyncExternalStore(
    source.subscribe,
    source.current,
    noPromptOnServer,
  );
  const [dismissed, setDismissed] = useState(readDismissed);
  const [safari] = useState(canAddFromSafari);
  const showSafariSteps = prompt === null && safari && !hasSavedShopping;

  if (dismissed || (prompt === null && !showSafariSteps)) {
    return null;
  }

  const dismiss = (): void => {
    setDismissed(true);
    document.getElementById("start-trip-title")?.focus();

    try {
      window.localStorage.setItem(INSTALL_OFFER_STORAGE_KEY, "dismissed");
    } catch {
      return;
    }
  };

  return (
    <aside className={styles.offer} aria-labelledby="install-offer-title">
      <h2 id="install-offer-title" className={styles.title}>
        {prompt === null ? t("Add it to your Home Screen first") : t("Install the app")}
      </h2>
      <p className={styles.copy}>
        {prompt === null
          ? t("Safari may clear saved data from sites you haven’t opened for about a week. Opened from your Home Screen, your trips stay. In Safari’s Share menu, choose Add to Home Screen.")
          : t("Open it from your home screen in one tap, even without a connection.")}
      </p>
      <div className={styles.actions}>
        {prompt === null ? null : (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              dismiss();
              prompt.install();
            }}
          >
            {t("Install")}
          </button>
        )}
        <button type="button" className={styles.secondary} onClick={dismiss}>
          {prompt === null ? t("Got it") : t("Not now")}
        </button>
      </div>
    </aside>
  );
}
