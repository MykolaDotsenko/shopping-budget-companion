import {
  Component,
  type ReactNode,
} from "react";

import { useI18n } from "./i18n";
import styles from "./AppErrorBoundary.module.css";

export interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface BoundaryProps extends AppErrorBoundaryProps {
  readonly t: (source: string) => string;
}

interface BoundaryState {
  readonly failed: boolean;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  public state: BoundaryState = {
    failed: false,
  };

  public static getDerivedStateFromError(): BoundaryState {
    return {
      failed: true,
    };
  }

  public render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    const { t } = this.props;

    return (
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="app-error-title">
          <p className={styles.eyebrow}>{t("Shopping Budget Companion")}</p>
          <h1 id="app-error-title">{t("The app hit an unexpected problem")}</h1>
          <p>
            {t(
              "Reload the app to restore the latest trip that was successfully saved on this device.",
            )}
          </p>
          <button
            type="button"
            className={styles.reload}
            onClick={() => {
              globalThis.location.reload();
            }}
          >
            {t("Reload app")}
          </button>
        </section>
      </main>
    );
  }
}

export function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
  const { t } = useI18n();

  return <Boundary t={t}>{children}</Boundary>;
}
