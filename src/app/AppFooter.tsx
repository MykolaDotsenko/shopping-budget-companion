import { useI18n } from "./i18n";
import styles from "./AppFooter.module.css";

const FEEDBACK_URL =
  "https://github.com/MykolaDotsenko/shopping-budget-companion/issues/new?template=feedback.yml";

export function AppFooter() {
  const { t } = useI18n();

  return (
    <p className={styles.footer}>
      <a href={`${import.meta.env.BASE_URL}privacy/`}>{t("Privacy")}</a>
      <span aria-hidden="true">·</span>
      <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
        {t("Feedback")}
      </a>
      <span aria-hidden="true">·</span>
      <span>v{__SHOPPING_APP_VERSION__}</span>
    </p>
  );
}
