import styles from "./AppFooter.module.css";

const FEEDBACK_URL =
  "https://github.com/MykolaDotsenko/shopping-budget-companion/issues/new?template=feedback.yml";

export function AppFooter() {
  return (
    <p className={styles.footer}>
      <a href={`${import.meta.env.BASE_URL}privacy/`}>Privacy</a>
      <span aria-hidden="true">·</span>
      <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
        Feedback
      </a>
      <span aria-hidden="true">·</span>
      <span>v{__SHOPPING_APP_VERSION__}</span>
    </p>
  );
}
