import { createContext, useContext } from "react";

import {
  interpolate,
  localeForLanguage,
  type AppLanguage,
} from "./i18n-core";

export interface I18nContextValue {
  readonly language: AppLanguage;
  readonly locale: string;
  readonly changing: boolean;
  readonly saveFailed: boolean;
  readonly changeFailed: boolean;
  readonly t: (
    source: string,
    values?: Readonly<Record<string, string | number>>,
  ) => string;
  readonly tp: (
    oneSource: string,
    otherSource: string,
    count: number,
    values?: Readonly<Record<string, string | number>>,
  ) => string;
  readonly setLanguage: (language: AppLanguage) => Promise<void>;
}

const englishContext: I18nContextValue = {
  language: "en",
  locale: localeForLanguage("en"),
  changing: false,
  saveFailed: false,
  changeFailed: false,
  t: (source, values) => interpolate(source, values),
  tp: (oneSource, otherSource, count, values) =>
    interpolate(count === 1 ? oneSource : otherSource, {
      count,
      ...values,
    }),
  setLanguage: async () => undefined,
};

export const I18nContext =
  createContext<I18nContextValue>(englishContext);

export const useI18n = (): I18nContextValue => useContext(I18nContext);
