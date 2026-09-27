import { useRegisterSW } from "virtual:pwa-register/react";

import { useShoppingAppState } from "../application/react/use-shopping-app-state";
import type { ShoppingAppController } from "../application/shopping-app-controller";
import { useI18n } from "./i18n";
import styles from "./PwaUpdateNotice.module.css";

export interface PwaUpdateNoticeProps {
  readonly controller: ShoppingAppController;
}

export function PwaUpdateNotice({
  controller,
}: PwaUpdateNoticeProps) {
  const { t } = useI18n();
  const state = useShoppingAppState(controller);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh || state.lifecycle !== "idle") {
    return null;
  }

  return (
    <aside
      className={styles.notice}
      aria-label={t("App update available")}
    >
      <div>
        <p className={styles.title}>{t("A newer version is ready.")}</p>
        <p className={styles.copy} aria-live="polite">
          {t("Update when convenient. Your saved shopping data stays on this device.")}
        </p>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.secondary}
          type="button"
          onClick={() => {
            setNeedRefresh(false);
          }}
        >
          {t("Later")}
        </button>
        <button
          className={styles.primary}
          type="button"
          onClick={() => {
            void updateServiceWorker(true);
          }}
        >
          {t("Update app")}
        </button>
      </div>
    </aside>
  );
}
