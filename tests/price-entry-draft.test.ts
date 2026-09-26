import { describe, expect, it } from "vitest";

import {
  appendPriceDigit,
  appendPriceSeparator,
  backspacePriceEntry,
  classifyPriceEntryDraft,
  clearPriceEntry,
  initialPriceEntryDraft,
  replacePriceEntryRaw,
  setPriceEntryMode,
} from "../src/features/shopping/price-entry-draft";

describe("price entry draft model", () => {
  it("defaults to explicit decimal mode", () => {
    expect(initialPriceEntryDraft()).toEqual({
      raw: "",
      mode: "decimal",
    });
  });

  it("classifies empty, incomplete, valid and invalid decimal drafts", () => {
    expect(
      classifyPriceEntryDraft({ raw: "", mode: "decimal" }),
    ).toEqual({ kind: "empty" });

    expect(
      classifyPriceEntryDraft({ raw: "4.", mode: "decimal" }),
    ).toEqual({ kind: "incomplete" });

    expect(
      classifyPriceEntryDraft({ raw: "4,79", mode: "decimal" }),
    ).toMatchObject({
      kind: "valid",
      value: 479,
    });

    expect(
      classifyPriceEntryDraft({ raw: "4.790", mode: "decimal" }),
    ).toEqual({
      kind: "invalid",
      reason: "too-many-fraction-digits",
    });
  });

  it("applies the item-price zero rule after the shared money parser", () => {
    expect(
      classifyPriceEntryDraft({ raw: "0", mode: "decimal" }),
    ).toEqual({
      kind: "invalid",
      reason: "zero-not-allowed",
    });
  });

  it("keeps auto-cents explicit and digits-only", () => {
    expect(
      classifyPriceEntryDraft({ raw: "479", mode: "auto-cents" }),
    ).toMatchObject({
      kind: "valid",
      value: 479,
    });

    expect(
      classifyPriceEntryDraft({ raw: "4.79", mode: "auto-cents" }),
    ).toEqual({
      kind: "invalid",
      reason: "invalid-format",
    });
  });

  it("appends keypad digits without canonicalizing leading zeroes", () => {
    let draft = initialPriceEntryDraft();
    draft = appendPriceDigit(draft, "0");
    draft = appendPriceDigit(draft, "0");
    draft = appendPriceDigit(draft, "4");

    expect(draft.raw).toBe("004");
    expect(classifyPriceEntryDraft(draft)).toMatchObject({
      kind: "valid",
      value: 400,
    });
  });

  it("stops keypad digits at two decimal places but not in cents mode", () => {
    const euros = appendPriceDigit({ raw: "4.79", mode: "decimal" }, "5");
    const comma = appendPriceDigit({ raw: "4,79", mode: "decimal" }, "5");
    const cents = appendPriceDigit({ raw: "479", mode: "auto-cents" }, "5");

    expect(euros.raw).toBe("4.79");
    expect(comma.raw).toBe("4,79");
    expect(cents.raw).toBe("4795");
  });

  it("adds one decimal separator and preserves incomplete typing", () => {
    let draft = initialPriceEntryDraft();
    draft = appendPriceDigit(draft, "4");
    draft = appendPriceSeparator(draft);

    expect(draft.raw).toBe("4.");
    expect(classifyPriceEntryDraft(draft)).toEqual({
      kind: "incomplete",
    });

    expect(appendPriceSeparator(draft)).toBe(draft);
  });

  it("normalizes an empty keypad separator to 0.", () => {
    const draft = appendPriceSeparator(initialPriceEntryDraft());

    expect(draft.raw).toBe("0.");
  });

  it("disables separator insertion in auto-cents mode", () => {
    const cents = setPriceEntryMode(
      initialPriceEntryDraft(),
      "auto-cents",
    );

    expect(appendPriceSeparator(cents)).toBe(cents);
  });

  it("supports single-step backspace and one-action clear", () => {
    const draft = replacePriceEntryRaw(
      initialPriceEntryDraft(),
      "4.79",
    );

    expect(backspacePriceEntry(draft).raw).toBe("4.7");
    expect(clearPriceEntry(draft).raw).toBe("");
  });

  it("never reinterprets a non-empty draft by switching modes", () => {
    const decimal = replacePriceEntryRaw(
      initialPriceEntryDraft(),
      "479",
    );

    expect(setPriceEntryMode(decimal, "auto-cents")).toBe(decimal);

    const empty = clearPriceEntry(decimal);
    expect(setPriceEntryMode(empty, "auto-cents")).toEqual({
      raw: "",
      mode: "auto-cents",
    });
  });

  it("accepts pasted euro/comma input through the shared parser", () => {
    const draft = replacePriceEntryRaw(
      initialPriceEntryDraft(),
      "4,79 €",
    );

    expect(classifyPriceEntryDraft(draft)).toMatchObject({
      kind: "valid",
      value: 479,
    });
  });
});
