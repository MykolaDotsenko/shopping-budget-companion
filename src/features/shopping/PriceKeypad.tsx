import type { MoneyDraftMode } from "../../domain/money";
import styles from "./PriceEntrySurface.module.css";
import { englishTranslate, type Translate } from "./translation";

const KEYPAD_ROWS: readonly (readonly string[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "backspace"],
] as const;

export interface PriceKeypadProps {
  readonly mode: MoneyDraftMode;
  readonly onPress: (key: string) => void;
  readonly t?: Translate;
}

export function PriceKeypad({
  mode,
  onPress,
  t = englishTranslate,
}: PriceKeypadProps) {
  return (
    <div className={styles.keypad} aria-label={t("Price keypad")}>
      {KEYPAD_ROWS.flat().map((key) => {
        const isSeparator = key === ".";
        const isBackspace = key === "backspace";

        if (isSeparator && mode === "auto-cents") {
          return (
            <button
              key={key}
              type="button"
              className={styles.key}
              disabled
              aria-label={t("Decimal separator unavailable in cents mode")}
            >
              .
            </button>
          );
        }

        return (
          <button
            key={key}
            type="button"
            className={styles.key}
            aria-label={
              isBackspace
                ? t("Backspace")
                : isSeparator
                  ? t("Decimal separator")
                  : t("Digit {digit}", { digit: key })
            }
            onClick={() => {
              onPress(key);
            }}
          >
            {isBackspace ? "⌫" : key}
          </button>
        );
      })}
    </div>
  );
}
