import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { mvpMinorUnits, type Result } from "../src/domain/money";
import {
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  reduceTrip,
  type ActiveTrip,
  type CartItem,
  type IsoTimestamp,
} from "../src/domain/shopping-trip";
import { ItemEditSurface } from "../src/features/shopping/ItemEditSurface";

const START = "2026-09-21T09:00:00.000Z";

const unwrap = <T, E>(result: Result<T, E>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected successful Result");
  }

  return result.value;
};

const money = (value: number) => unwrap(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => unwrap(isoTimestamp(value));

const createItem = (
  price = 479,
  quantity = 1,
): CartItem =>
  unwrap(
    createCartItem({
      id: "edit-item",
      unitPriceMinor: money(price),
      quantity,
      priceSource: { kind: "manual" },
      priceConfidence: {
        kind: "confirmed",
        confirmedAt: time(START),
      },
      createdAt: START,
    }),
  );

const createTrip = (
  item: CartItem,
  budget = 5_000,
  buffer = 0,
): ActiveTrip => {
  const base = unwrap(
    createActiveTrip({
      id: "edit-trip",
      budgetMinor: money(budget),
      safetyBufferMinor: money(buffer),
      startedAt: START,
    }),
  );
  const added = reduceTrip(base, {
    type: "add-item",
    item,
  });

  if (!added.ok || added.value.status !== "active") {
    throw new Error("Expected active trip fixture");
  }

  return added.value;
};

describe("ItemEditSurface", () => {
  it("projects replacement totals and emits an exact correction intent", async () => {
    const user = userEvent.setup();
    const item = createItem();
    const onSave = vi.fn(() => true);

    render(
      <ItemEditSurface
        trip={createTrip(item)}
        item={item}
        onCancel={vi.fn()}
        onSave={onSave}
        onRemove={vi.fn()}
        locale="en-IE"
      />,
    );

    const price = screen.getByRole("textbox", { name: "Price" });
    expect((price as HTMLInputElement).value).toBe("4.79");
    expect(screen.getByText("Confirmed · Manual")).not.toBeNull();

    await user.clear(price);
    await user.type(price, "5.29");
    await user.click(
      screen.getByRole("button", {
        name: "Increase edited quantity",
      }),
    );

    expect(
      screen.getByText("After saving: €39.42 left"),
    ).not.toBeNull();
    expect(
      screen.getByText("Cart would be €10.58 of €50.00."),
    ).not.toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Save changes" }),
    );

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      unitPriceMinor: 529,
      quantity: 2,
    });
  });

  it("closes on Escape from any control, not only the price field", async () => {
    const user = userEvent.setup();
    const item = createItem();
    const onCancel = vi.fn();

    render(
      <ItemEditSurface
        trip={createTrip(item)}
        item={item}
        onCancel={onCancel}
        onSave={vi.fn(() => true)}
        onRemove={vi.fn()}
        locale="en-IE"
      />,
    );

    screen.getByRole("button", { name: "Increase edited quantity" }).focus();
    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("can name an item for future Recent Items without requiring a price change", async () => {
    const user = userEvent.setup();
    const item = createItem();
    const onSave = vi.fn(() => true);

    render(
      <ItemEditSurface
        trip={createTrip(item)}
        item={item}
        onCancel={vi.fn()}
        onSave={onSave}
        onRemove={vi.fn()}
        locale="en-IE"
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /Item name/i }),
      "Milk 1L",
    );

    await user.click(
      screen.getByRole("button", { name: "Save changes" }),
    );

    expect(onSave).toHaveBeenCalledWith({
      unitPriceMinor: 479,
      quantity: 1,
      label: "Milk 1L",
    });
  });

  it("keeps the first 120 characters of a pasted name and says the rest was left out", async () => {
    const user = userEvent.setup();
    const item = createItem();
    const onSave = vi.fn(() => true);

    render(
      <ItemEditSurface
        trip={createTrip(item)}
        item={item}
        onCancel={vi.fn()}
        onSave={onSave}
        onRemove={vi.fn()}
        locale="en-IE"
      />,
    );

    const name = screen.getByRole("textbox", { name: /Item name/i });
    await user.click(name);
    await user.paste(`${"x".repeat(119)}yz`);

    expect((name as HTMLInputElement).value).toBe(`${"x".repeat(119)}y`);
    expect(
      screen.getByText("Names stop at 120 characters; the rest was left out."),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ label: `${"x".repeat(119)}y` }),
    );
  });

  it("allows a truthful correction that reveals a nominal overage without a destructive modal", async () => {
    const user = userEvent.setup();
    const item = createItem(479);
    const onSave = vi.fn(() => true);

    render(
      <ItemEditSurface
        trip={createTrip(item, 500)}
        item={item}
        onCancel={vi.fn()}
        onSave={onSave}
        onRemove={vi.fn()}
        locale="en-IE"
      />,
    );

    const price = screen.getByRole("textbox", { name: "Price" });
    await user.clear(price);
    await user.type(price, "6.00");

    expect(
      screen.getByText("After saving: €1.00 over your limit"),
    ).not.toBeNull();
    expect(
      screen.queryByRole("heading", {
        name: "Add this price anyway?",
      }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Save changes" }),
    );
    expect(onSave).toHaveBeenCalledWith({
      unitPriceMinor: 600,
      quantity: 1,
    });
  });

  it("never removes the item from the quantity stepper, only from Remove item", async () => {
    const user = userEvent.setup();
    const item = createItem(479, 2);
    const onRemove = vi.fn(() => true);

    render(
      <ItemEditSurface
        trip={createTrip(item)}
        item={item}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onRemove={onRemove}
        locale="en-IE"
      />,
    );

    const decrease = screen.getByRole("button", { name: "Decrease edited quantity" });
    await user.dblClick(decrease);

    expect(screen.getByLabelText("Edited quantity").textContent).toBe("1");
    expect((decrease as HTMLButtonElement).disabled).toBe(true);
    expect(onRemove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove item" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("keeps Save disabled until the correction actually changes canonical values", () => {
    const item = createItem(479, 2);

    render(
      <ItemEditSurface
        trip={createTrip(item)}
        item={item}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onRemove={vi.fn()}
        locale="en-IE"
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
