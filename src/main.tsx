import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "#app-entry";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import {
  I18nProvider,
  loadLanguageCatalog,
  readLanguagePreference,
} from "./app/i18n";
import "./app/shopping-theme.css";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Shopping Budget Companion root element was not found.");
}

const language = readLanguagePreference();
document.documentElement.lang = language;

void loadLanguageCatalog(language)
  .catch(() => ({}))
  .then((catalog) => {
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
