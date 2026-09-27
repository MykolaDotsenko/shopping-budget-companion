import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "#app-entry";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { I18nProvider } from "./app/i18n";
import {
  loadLanguageCatalog,
  readLanguagePreference,
} from "./app/i18n-core";
import "./app/shopping-theme.css";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Shopping Budget Companion root element was not found.");
}

const preferredLanguage = readLanguagePreference();
document.documentElement.lang = preferredLanguage;

void loadLanguageCatalog(preferredLanguage)
  .then(
    (catalog) => ({ language: preferredLanguage, catalog }),
    () => ({ language: "en" as const, catalog: {} }),
  )
  .then(({ language, catalog }) => {
    document.documentElement.lang = language;

    createRoot(rootElement).render(
      <StrictMode>
        <I18nProvider initialLanguage={language} initialCatalog={catalog}>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </I18nProvider>
      </StrictMode>,
    );
  });
