export const EUR_SPEC = {
  code: "EUR",
  fractionDigits: 2,
  minorUnitName: "cent",
} as const;

export const MAX_MVP_MONEY_MINOR = 99_999_999;
export const MIN_MVP_QUANTITY = 1;
export const MAX_MVP_QUANTITY = 999;

export type SupportedCurrency = typeof EUR_SPEC.code;

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type MinorUnits = Brand<number, "MinorUnits">;
export type SignedMinorUnits = Brand<number, "SignedMinorUnits">;
export type MoneyAmount = MinorUnits | SignedMinorUnits;

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export type MoneyDraftMode = "decimal" | "auto-cents";

export interface MoneyDraft {
  readonly raw: string;
  readonly mode: MoneyDraftMode;
}

export type MoneyInputErrorCode =
  | "empty"
  | "incomplete"
  | "invalid-format"
  | "negative-not-allowed"
  | "too-many-fraction-digits"
  | "above-product-limit"
  | "unsafe-integer";

export interface MoneyInputError {
  readonly kind: "money-input";
  readonly code: MoneyInputErrorCode;
}

export type MoneyErrorCode =
  | "negative-not-allowed"
  | "unsafe-integer"
  | "above-product-limit"
  | "invalid-quantity";

export interface MoneyError {
  readonly kind: "money";
  readonly code: MoneyErrorCode;
}

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

const inputError = (
  code: MoneyInputErrorCode,
): Result<never, MoneyInputError> => ({
  ok: false,
  error: { kind: "money-input", code },
});

const moneyError = (code: MoneyErrorCode): Result<never, MoneyError> => ({
  ok: false,
  error: { kind: "money", code },
});

const isDigits = (value: string): boolean => /^\d+$/.test(value);

const stripLeadingZeroes = (value: string): string => {
  const stripped = value.replace(/^0+(?=\d)/, "");
  return stripped === "" ? "0" : stripped;
};

const countCharacter = (value: string, character: string): number =>
  [...value].filter((candidate) => candidate === character).length;

const stripOptionalEuroSymbol = (
  input: string,
): Result<string, MoneyInputError> => {
  let value = input.trim();
  const hasLeadingEuro = value.startsWith("€");
  const hasTrailingEuro = value.endsWith("€");

  if (hasLeadingEuro && hasTrailingEuro) {
    return inputError("invalid-format");
  }

  if (hasLeadingEuro) {
    value = value.slice(1).trimStart();
  } else if (hasTrailingEuro) {
    value = value.slice(0, -1).trimEnd();
  }

  if (value.includes("€")) {
    return inputError("invalid-format");
  }

  return ok(value);
};

const parseDecimalEur = (
  raw: string,
): Result<MinorUnits, MoneyInputError> => {
  const stripped = stripOptionalEuroSymbol(raw);

  if (!stripped.ok) {
    return stripped;
  }

  const value = stripped.value;

  if (value === "") {
    return inputError("empty");
  }

  if (value.startsWith("-")) {
    return inputError("negative-not-allowed");
  }

  const dotCount = countCharacter(value, ".");
  const commaCount = countCharacter(value, ",");

  if (
    (dotCount > 0 && commaCount > 0) ||
    dotCount > 1 ||
    commaCount > 1
  ) {
    return inputError("invalid-format");
  }

  const separator = dotCount === 1 ? "." : commaCount === 1 ? "," : null;

  if (separator === null) {
    if (!isDigits(value)) {
      return inputError("invalid-format");
    }

    return buildMinorUnits(value, "");
  }

  const [majorPart = "", fractionPart = ""] = value.split(separator);

  if (fractionPart === "") {
    return inputError("incomplete");
  }

  if (
    (majorPart !== "" && !isDigits(majorPart)) ||
    !isDigits(fractionPart)
  ) {
    return inputError("invalid-format");
  }

  if (fractionPart.length > EUR_SPEC.fractionDigits) {
    return inputError("too-many-fraction-digits");
  }

  return buildMinorUnits(majorPart === "" ? "0" : majorPart, fractionPart);
};

const buildMinorUnits = (
  rawMajor: string,
  rawFraction: string,
): Result<MinorUnits, MoneyInputError> => {
  const majorDigits = stripLeadingZeroes(rawMajor);
  const fractionDigits = rawFraction.padEnd(EUR_SPEC.fractionDigits, "0");

  if (majorDigits.length > 6) {
    return inputError("above-product-limit");
  }

  const major = Number(majorDigits);
  const fraction = fractionDigits === "" ? 0 : Number(fractionDigits);
  const value = major * 100 + fraction;

  if (!Number.isSafeInteger(value)) {
    return inputError("unsafe-integer");
  }

  if (value > MAX_MVP_MONEY_MINOR) {
    return inputError("above-product-limit");
  }

  return ok(value as MinorUnits);
};

const parseAutoCents = (
  raw: string,
): Result<MinorUnits, MoneyInputError> => {
  const value = raw.trim();

  if (value === "") {
    return inputError("empty");
  }

  if (value.startsWith("-")) {
    return inputError("negative-not-allowed");
  }

  if (!isDigits(value)) {
    return inputError("invalid-format");
  }

  const digits = stripLeadingZeroes(value);

  if (digits.length > String(MAX_MVP_MONEY_MINOR).length) {
    return inputError("above-product-limit");
  }

  const minor = Number(digits);

  if (!Number.isSafeInteger(minor)) {
    return inputError("unsafe-integer");
  }

  if (minor > MAX_MVP_MONEY_MINOR) {
    return inputError("above-product-limit");
  }

  return ok(minor as MinorUnits);
};

export const parseEurDraft = (
  draft: MoneyDraft,
): Result<MinorUnits, MoneyInputError> =>
  draft.mode === "auto-cents"
    ? parseAutoCents(draft.raw)
    : parseDecimalEur(draft.raw);

export const minorUnits = (value: number): Result<MinorUnits, MoneyError> => {
  if (!Number.isSafeInteger(value)) {
    return moneyError("unsafe-integer");
  }

  if (value < 0) {
    return moneyError("negative-not-allowed");
  }

  return ok(value as MinorUnits);
};

export const mvpMinorUnits = (
  value: number,
): Result<MinorUnits, MoneyError> => {
  const result = minorUnits(value);

  if (!result.ok) {
    return result;
  }

  if (result.value > MAX_MVP_MONEY_MINOR) {
    return moneyError("above-product-limit");
  }

  return result;
};

export const signedMinorUnits = (
  value: number,
): Result<SignedMinorUnits, MoneyError> => {
  if (!Number.isSafeInteger(value)) {
    return moneyError("unsafe-integer");
  }

  return ok(value as SignedMinorUnits);
};

export const addMoney = (
  left: MoneyAmount,
  right: MoneyAmount,
): Result<SignedMinorUnits, MoneyError> =>
  signedMinorUnits(left + right);

export const subtractMoney = (
  left: MoneyAmount,
  right: MoneyAmount,
): Result<SignedMinorUnits, MoneyError> =>
  signedMinorUnits(left - right);

export const multiplyMoney = (
  unitPrice: MinorUnits,
  quantity: number,
): Result<MinorUnits, MoneyError> => {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < MIN_MVP_QUANTITY ||
    quantity > MAX_MVP_QUANTITY
  ) {
    return moneyError("invalid-quantity");
  }

  const value = unitPrice * quantity;

  if (!Number.isSafeInteger(value)) {
    return moneyError("unsafe-integer");
  }

  return ok(value as MinorUnits);
};

export const moneyInputValue = (amount: MinorUnits): string =>
  `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;

export const formatEur = (
  amount: MoneyAmount,
  locale: string,
): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: EUR_SPEC.code,
    minimumFractionDigits: EUR_SPEC.fractionDigits,
    maximumFractionDigits: EUR_SPEC.fractionDigits,
  }).format(amount / 100);
