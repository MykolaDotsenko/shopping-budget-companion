export const SHOPPING_LOCALE = "en-FI";

export const decimalAmountPlaceholder = (
  locale: string,
  amount = 0,
): string =>
  new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
