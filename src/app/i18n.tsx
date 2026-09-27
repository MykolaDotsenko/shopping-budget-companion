import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { I18nContext, type I18nContextValue } from "./i18n-context";
import {
  interpolate,
  loadLanguageCatalog,
  localeForLanguage,
  persistLanguage,
  type AppLanguage,
  type MessageCatalog,
} from "./i18n-core";

export interface I18nProviderProps {
  readonly initialLanguage: AppLanguage;
  readonly initialCatalog: MessageCatalog;
  readonly children: ReactNode;
}

export function I18nProvider({
  initialLanguage,
  initialCatalog,
  children,
}: I18nProviderProps) {
  const [state, setState] = useState(() => ({
    language: initialLanguage,
    catalog: initialCatalog,
  }));
  const [changing, setChanging] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [changeFailed, setChangeFailed] = useState(false);
  const languageRequestId = useRef(0);

  useEffect(() => {
    const title =
      state.language === "en"
        ? "Shopping Budget Companion — know what’s left before checkout"
        : state.language === "fi"
          ? "Shopping Budget Companion — tiedä paljonko on jäljellä ennen kassaa"
          : "Shopping Budget Companion — знайте, скільки залишилось до каси";
    const description =
      state.language === "en"
        ? "Set a shopping limit, add prices as you go and always see what’s left before checkout."
        : state.language === "fi"
          ? "Aseta ostosraja, lisää hinnat ostosten aikana ja näe aina, paljonko on jäljellä ennen kassaa."
          : "Встановіть ліміт покупок, додавайте ціни під час покупок і завжди бачте, скільки залишилось до каси.";

    document.title = title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", description);
  }, [state.language]);

  const value = useMemo<I18nContextValue>(() => {
    const t = (
      source: string,
      values?: Readonly<Record<string, string | number>>,
    ): string => {
      const translated = state.catalog[source];

      return interpolate(
        typeof translated === "string" ? translated : source,
        values,
      );
    };

    const tp = (
      oneSource: string,
      otherSource: string,
      count: number,
      values?: Readonly<Record<string, string | number>>,
    ): string => {
      const translated = state.catalog[oneSource];
      let template = count === 1 ? oneSource : otherSource;

      if (typeof translated === "object" && translated !== null) {
        const category = new Intl.PluralRules(
          localeForLanguage(state.language),
        ).select(count);
        template =
          translated[category] ??
          translated.other ??
          translated.one ??
          template;
      } else if (typeof translated === "string") {
        template = translated;
      }

      return interpolate(template, { count, ...values });
    };

    const setLanguage = async (language: AppLanguage): Promise<void> => {
      if (language === state.language) {
        return;
      }

      const requestId = ++languageRequestId.current;
      setChanging(true);
      setChangeFailed(false);

      try {
        const catalog = await loadLanguageCatalog(language);

        if (requestId !== languageRequestId.current) {
          return;
        }

        document.documentElement.lang = language;
        setSaveFailed(!persistLanguage(language));
        setState({ language, catalog });
      } catch {
        if (requestId === languageRequestId.current) {
          setChangeFailed(true);
        }
      } finally {
        if (requestId === languageRequestId.current) {
          setChanging(false);
        }
      }
    };

    return {
      language: state.language,
      locale: localeForLanguage(state.language),
      changing,
      saveFailed,
      changeFailed,
      t,
      tp,
      setLanguage,
    };
  }, [changeFailed, changing, saveFailed, state]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
