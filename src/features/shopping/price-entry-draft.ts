import {
  parseEurDraft,
  type MinorUnits,
  type MoneyDraftMode,
  type MoneyInputErrorCode,
} from "../../domain/money";

export type PriceEntryInvalidReason =
  | MoneyInputErrorCode
  | "zero-not-allowed";

export type PriceEntryDraftState =
  | { readonly kind: "empty" }
  | { readonly kind: "incomplete" }
  | {
      readonly kind: "valid";
      readonly value: MinorUnits;
    }
  | {
      readonly kind: "invalid";
      readonly reason: PriceEntryInvalidReason;
    };

export interface PriceEntryDraft {
  readonly raw: string;
  readonly mode: MoneyDraftMode;
}

export const initialPriceEntryDraft = (
  mode: MoneyDraftMode = "decimal",
): PriceEntryDraft => ({
  raw: "",
  mode,
});

export const priceEntryDraftFor = (price: MinorUnits): PriceEntryDraft => {
  const cents = Number(price);

  return {
    raw: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`,
    mode: "decimal",
  };
};

export const classifyPriceEntryDraft = (
  draft: PriceEntryDraft,
): PriceEntryDraftState => {
  const parsed = parseEurDraft(draft);

  if (parsed.ok) {
    return parsed.value === 0
      ? { kind: "invalid", reason: "zero-not-allowed" }
      : { kind: "valid", value: parsed.value };
  }

  if (parsed.error.code === "empty") {
    return { kind: "empty" };
  }

  if (parsed.error.code === "incomplete") {
    return { kind: "incomplete" };
  }

  return {
    kind: "invalid",
    reason: parsed.error.code,
  };
};

export const replacePriceEntryRaw = (
  draft: PriceEntryDraft,
  raw: string,
): PriceEntryDraft => ({
  ...draft,
  raw,
});

export const appendPriceDigit = (
  draft: PriceEntryDraft,
  digit: string,
): PriceEntryDraft => {
  if (!/^\d$/.test(digit) || /[.,]\d{2}$/.test(draft.raw)) {
    return draft;
  }

  return {
    ...draft,
    raw: `${draft.raw}${digit}`,
  };
};

export const appendPriceSeparator = (
  draft: PriceEntryDraft,
): PriceEntryDraft => {
  if (
    draft.mode !== "decimal" ||
    draft.raw.includes(".") ||
    draft.raw.includes(",")
  ) {
    return draft;
  }

  return {
    ...draft,
    raw: draft.raw === "" ? "0." : `${draft.raw}.`,
  };
};

export const backspacePriceEntry = (
  draft: PriceEntryDraft,
): PriceEntryDraft => ({
  ...draft,
  raw: [...draft.raw].slice(0, -1).join(""),
});

export const clearPriceEntry = (
  draft: PriceEntryDraft,
): PriceEntryDraft => ({
  ...draft,
  raw: "",
});

export const setPriceEntryMode = (
  draft: PriceEntryDraft,
  mode: MoneyDraftMode,
): PriceEntryDraft =>
  draft.raw === ""
    ? {
        raw: "",
        mode,
      }
    : draft;
