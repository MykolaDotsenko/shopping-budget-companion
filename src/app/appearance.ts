export const APPEARANCE_STORAGE_KEY = "shopping-budget:appearance";

export const APPEARANCE_MODES = [
  "system",
  "light",
  "dark",
  "aurora",
] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export interface AppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AppearanceDocumentTarget {
  readonly documentElement: HTMLElement;
  querySelector<E extends Element = Element>(selectors: string): E | null;
}

const THEME_COLORS = Object.freeze({
  light: "#f4f1eb",
  dark: "#0f1210",
  aurora: "#050611",
});

const isAppearanceMode = (
  value: string | null | undefined,
): value is AppearanceMode =>
  APPEARANCE_MODES.some((mode) => mode === value);

export const parseAppearanceMode = (
  value: string | null | undefined,
): AppearanceMode => (isAppearanceMode(value) ? value : "system");

const browserStorage = (): AppearanceStorage | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const readAppearancePreference = (
  storage: AppearanceStorage | null | undefined = undefined,
): AppearanceMode => {
  const target = storage === undefined ? browserStorage() : storage;

  if (target === null) {
    return "system";
  }

  try {
    return parseAppearanceMode(target.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return "system";
  }
};

export const persistAppearancePreference = (
  mode: AppearanceMode,
  storage: AppearanceStorage | null | undefined = undefined,
): boolean => {
  const target = storage === undefined ? browserStorage() : storage;

  if (target === null) {
    return false;
  }

  try {
    target.setItem(APPEARANCE_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
};

export const resolvedAppearance = (
  mode: AppearanceMode,
  prefersDark: boolean,
): Exclude<AppearanceMode, "system"> =>
  mode === "system" ? (prefersDark ? "dark" : "light") : mode;

export const appearanceThemeColor = (
  mode: AppearanceMode,
  prefersDark: boolean,
): string => THEME_COLORS[resolvedAppearance(mode, prefersDark)];

const systemPrefersDark = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const applyAppearanceToDocument = (
  mode: AppearanceMode,
  target: AppearanceDocumentTarget | null =
    typeof document === "undefined" ? null : document,
  prefersDark = systemPrefersDark(),
): void => {
  if (target === null) {
    return;
  }

  const theme = resolvedAppearance(mode, prefersDark);

  target.documentElement.dataset.appearance = mode;
  target.documentElement.dataset.theme = theme;

  const themeMeta = target.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );

  themeMeta?.setAttribute("content", THEME_COLORS[theme]);
};
