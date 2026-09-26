import type { MoneyDraftMode } from "../domain/money";
import type { ScanMode } from "../features/shopping/scan-targets";

export const SCAN_MODE_STORAGE_KEY = "shopping-budget:scan-mode";
export const PRICE_ENTRY_MODE_STORAGE_KEY = "shopping-budget:price-entry-mode";

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

const readPreference = <T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T => {
  try {
    const stored = storage()?.getItem(key);
    return allowed.find((value) => value === stored) ?? fallback;
  } catch {
    return fallback;
  }
};

const writePreference = (key: string, value: string): void => {
  try {
    storage()?.setItem(key, value);
  } catch {
    return;
  }
};

export const readScanModePreference = (fallback: ScanMode): ScanMode =>
  readPreference(SCAN_MODE_STORAGE_KEY, ["barcode", "price"], fallback);

export const writeScanModePreference = (mode: ScanMode): void => {
  writePreference(SCAN_MODE_STORAGE_KEY, mode);
};

export const readPriceEntryModePreference = (): MoneyDraftMode =>
  readPreference(PRICE_ENTRY_MODE_STORAGE_KEY, ["decimal", "auto-cents"], "decimal");

export const writePriceEntryModePreference = (mode: MoneyDraftMode): void => {
  writePreference(PRICE_ENTRY_MODE_STORAGE_KEY, mode);
};
