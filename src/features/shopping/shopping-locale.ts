export const SHOPPING_LOCALE = "en-FI";

export const decimalAmountPlaceholder = (
  locale: string,
  amount = 0,
): string => {
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    currencyDisplay: "symbol",
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(amount);

  return parts
    .filter(({ type }) =>
      type === "integer" || type === "decimal" || type === "fraction",
    )
    .map(({ value }) => value)
    .join("");
};
