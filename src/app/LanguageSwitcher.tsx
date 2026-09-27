import { useI18n } from "./i18n-context";
import {
  APP_LANGUAGES,
  languageName,
  type AppLanguage,
} from "./i18n-core";
import styles from "./LanguageSwitcher.module.css";

const LANGUAGE_CODES: Readonly<Record<AppLanguage, string>> = {
  en: "EN",
  fi: "FI",
  uk: "UA",
};

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
    <section className={styles.language} aria-label={t("Language")}>
      <div className={styles.options} role="group" aria-label={t("App language")}>
        {APP_LANGUAGES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={styles.option}
            aria-label={languageName(candidate)}
            aria-pressed={language === candidate}
            lang={candidate}
            disabled={changing}
            onClick={() => {
              void setLanguage(candidate);
            }}
          >
            <span aria-hidden="true">{LANGUAGE_CODES[candidate]}</span>
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
