import { useI18n } from "./i18n-context";
import {
  APP_LANGUAGES,
  languageName,
} from "./i18n-core";
import styles from "./LanguageSwitcher.module.css";

export function LanguageSwitcher() {
  const {
    language,
    changing,
    saveFailed,
    changeFailed,
    setLanguage,
    t,
  } = useI18n();

  return (
    <section className={styles.language} aria-labelledby="language-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>{t("Language")}</p>
          <h2 id="language-title">{t("Choose a language")}</h2>
        </div>
        <span className={styles.current}>{languageName(language)}</span>
      </div>

      <div className={styles.options} role="group" aria-label={t("App language")}>
        {APP_LANGUAGES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={styles.option}
            aria-pressed={language === candidate}
            disabled={changing}
            onClick={() => {
              void setLanguage(candidate);
            }}
          >
            {languageName(candidate)}
          </button>
        ))}
      </div>

      {changeFailed ? (
        <p className={styles.warning} role="alert">
          {t("That language could not be loaded. Try again when you are online.")}
        </p>
      ) : saveFailed ? (
        <p className={styles.warning} role="status">
          {t("Language changed for this session but could not be saved.")}
        </p>
      ) : null}
    </section>
  );
}
