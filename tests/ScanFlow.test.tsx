import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { bootstrapBrowserShoppingAppController } from "../src/app/composition-root";
import { ShoppingAppShell } from "../src/app/ShoppingAppShell";
import type {
  BarcodeReaderPort,
  BarcodeReading,
} from "../src/application/barcode-ports";
import type { CameraPort } from "../src/application/camera-ports";
import type { PriceTagReaderPort } from "../src/application/price-tag-ports";
import type { ShoppingAppController } from "../src/application/shopping-app-controller";
import { mvpMinorUnits, type MinorUnits } from "../src/domain/money";
import { rankPriceTagCandidates } from "../src/domain/shelf-price";
import { isoTimestamp, type IsoTimestamp } from "../src/domain/shopping-trip";
import { BARCODE_LINK_STORAGE_KEY } from "../src/infrastructure/storage/barcode-link-storage";
import type { StorageLike } from "../src/infrastructure/storage/shopping-storage";

const must = <T,>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) {
    throw new Error("Expected success");
  }

  return result.value;
};

const money = (value: number): MinorUnits => must(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => must(isoTimestamp(value));

const setup = (initial: Record<string, string> = {}) => {
  const values = new Map<string, string>(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  let id = 0;
  const controller: ShoppingAppController = bootstrapBrowserShoppingAppController({
    storage,
    storageScope: null,
    clock: { now: () => time("2026-09-21T09:00:00.000Z") },
    ids: {
      tripId: () => `trip-${(id += 1)}`,
      itemId: () => `item-${(id += 1)}`,
    },
  });
  const current: { readings: readonly BarcodeReading[] } = { readings: [] };
  const camera: CameraPort = {
    isAvailable: () => true,
    open: vi.fn(async () => ({
      ok: true as const,
      session: {
        torch: null,
        stop: vi.fn(),
        captureStill: vi.fn(async () => new Blob(["frame"], { type: "image/png" })),
      },
    })),
  };
  const barcodeReader: BarcodeReaderPort = {
    prepare: vi.fn(),
    attach: vi.fn(async () => ({
      engine: "native" as const,
      detect: async () => current.readings,
    })),
  };
  const priceReader: PriceTagReaderPort = {
    prepare: vi.fn(async () => true),
    read: vi.fn(async () => ({
      status: "read" as const,
      candidates: rankPriceTagCandidates({
        lines: [
          { text: "1,35€", height: 130 },
          { text: "4,50 €/l", height: 30 },
        ],
        superscript: null,
      }),
    })),
    release: vi.fn(),
  };
  return { values, controller, camera, barcodeReader, priceReader, current };
};

const scanButton = () => screen.getByRole("button", { name: /^(Scan barcode|Scan barcode or price tag|Read price tag)$/ });

describe("scanning while shopping", () => {
  it("names a new product once, then recognises it on the next scan", async () => {
    const user = userEvent.setup();
    const { values, controller, camera, barcodeReader, current } = setup();
    controller.startTrip({ budgetMinor: money(5_000) });

    render(<ShoppingAppShell controller={controller} camera={camera} barcodeReader={barcodeReader} />);

    expect(barcodeReader.prepare).toHaveBeenCalled();

    current.readings = [{ rawValue: "6414893386303", symbology: "ean-13" }];
    await user.click(screen.getByRole("button", { name: "Scan barcode" }));
    await screen.findByRole("heading", { name: "New product" });

    await user.type(screen.getByLabelText("Name for next time (optional)"), "Milk 1L");
    await user.click(screen.getByRole("button", { name: "Continue to price" }));

    const entry = await screen.findByRole("main", { name: "What does this item cost?" });
    expect(within(entry).getByText("Milk 1L")).not.toBeNull();
    expect(within(entry).queryByRole("button", { name: "Read price tag" })).toBeNull();

    await user.type(within(entry).getByLabelText("Price"), "1.29");
    await user.click(within(entry).getByRole("button", { name: /^Add/ }));

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Scan barcode" }));
    });
    expect(controller.getSnapshot().activeTrip?.items).toMatchObject([
      { label: "Milk 1L", unitPriceMinor: 129 },
    ]);
    expect(values.get(BARCODE_LINK_STORAGE_KEY)).toContain("06414893386303");

    await user.click(screen.getByRole("button", { name: "Scan barcode" }));
    expect(await screen.findByRole("heading", { name: "Milk 1L" })).not.toBeNull();
    expect(screen.getByText(/No remembered price yet/)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Scan barcode" }));
    });
  });

  it("reads a price tag from the trip and adds it only after the shopper confirms", async () => {
    const user = userEvent.setup();
    const { controller, camera, barcodeReader, priceReader } = setup();
    controller.startTrip({ budgetMinor: money(5_000) });

    render(
      <ShoppingAppShell
        controller={controller}
        camera={camera}
        barcodeReader={barcodeReader}
        priceReader={priceReader}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Scan barcode or price tag" }));
    await user.click(await screen.findByRole("button", { name: "Price tag" }));
    await user.click(await screen.findByRole("button", { name: "Read price" }));
    await user.click(await screen.findByRole("button", { name: "€1.35" }));

    const entry = await screen.findByRole("main", { name: "What does this item cost?" });
    expect((within(entry).getByLabelText("Price") as HTMLInputElement).value).toBe("1.35");
    expect(within(entry).getByText(/Read from the price tag/)).not.toBeNull();
    expect(controller.getSnapshot().activeTrip?.items).toEqual([]);

    await user.click(within(entry).getByRole("button", { name: "Add · €1.35" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(scanButton());
    });
    expect(controller.getSnapshot().activeTrip?.items).toMatchObject([{ unitPriceMinor: 135 }]);
  });

  it("opens the scanner in the mode the shopper chose last time", async () => {
    const user = userEvent.setup();
    const { controller, camera, barcodeReader, priceReader } = setup();
    controller.startTrip({ budgetMinor: money(5_000) });

    render(
      <ShoppingAppShell
        controller={controller}
        camera={camera}
        barcodeReader={barcodeReader}
        priceReader={priceReader}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Scan barcode or price tag" }));
    expect(await screen.findByRole("heading", { name: "Find the product" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Price tag" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(await screen.findByRole("button", { name: "Scan barcode or price tag" }));

    expect(await screen.findByRole("heading", { name: "Read the price tag" })).not.toBeNull();
    expect(window.localStorage.getItem("shopping-budget:scan-mode")).toBe("price");
  });

  it("returns from the price tag reader to the price being entered, keeping its name and quantity", async () => {
    const user = userEvent.setup();
    const { controller, camera, barcodeReader, priceReader } = setup();
    controller.startTrip({ budgetMinor: money(5_000) });

    render(
      <ShoppingAppShell
        controller={controller}
        camera={camera}
        barcodeReader={barcodeReader}
        priceReader={priceReader}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add price" }));
    let entry = screen.getByRole("main", { name: "What does this item cost?" });
    await user.click(within(entry).getByRole("button", { name: "Increase quantity" }));
    await user.click(within(entry).getByText(/Name for next time/));
    await user.type(within(entry).getByLabelText("Item name"), "Bread");
    await user.click(within(entry).getByRole("button", { name: "Read price tag" }));

    expect(await screen.findByRole("heading", { name: "Read the price tag" })).not.toBeNull();
    expect(screen.queryByRole("group", { name: "What to scan" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    entry = await screen.findByRole("main", { name: "What does this item cost?" });
    expect(within(entry).getByLabelText("Current quantity").textContent).toBe("2");
    await user.click(within(entry).getByRole("button", { name: "Read price tag" }));
    await user.click(await screen.findByRole("button", { name: "Read price" }));

    expect(await screen.findByRole("heading", { name: "Price for Bread" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "€1.35" }));

    entry = await screen.findByRole("main", { name: "What does this item cost?" });
    expect(within(entry).getByText("Bread")).not.toBeNull();
    await user.click(within(entry).getByRole("button", { name: "Add · €2.70" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add price" }));
    });
    expect(controller.getSnapshot().activeTrip?.items).toMatchObject([
      { label: "Bread", unitPriceMinor: 135, quantity: 2 },
    ]);
  });

  it("reads the current price for a scanned product and keeps its barcode name", async () => {
    const user = userEvent.setup();
    const { values, controller, camera, barcodeReader, priceReader, current } = setup();
    controller.startTrip({ budgetMinor: money(5_000) });
    controller.addManualItem({
      unitPriceMinor: money(129),
      quantity: 1,
      label: "Milk 1L",
      barcode: "06414893386303" as never,
    });

    render(
      <ShoppingAppShell
        controller={controller}
        camera={camera}
        barcodeReader={barcodeReader}
        priceReader={priceReader}
      />,
    );

    current.readings = [{ rawValue: "6414893386303", symbology: "ean-13" }];
    await user.click(screen.getByRole("button", { name: "Scan barcode or price tag" }));
    await screen.findByRole("heading", { name: "Milk 1L" });
    await user.click(screen.getByRole("button", { name: "Read price tag" }));
    await user.click(await screen.findByRole("button", { name: "Read price" }));
    await user.click(await screen.findByRole("button", { name: "€1.35" }));

    const entry = await screen.findByRole("main", { name: "What does this item cost?" });
    expect(within(entry).getByText("Milk 1L")).not.toBeNull();
    await user.click(within(entry).getByRole("button", { name: "Add · €1.35" }));

    await waitFor(() => {
      expect(controller.getSnapshot().activeTrip?.items).toHaveLength(2);
    });
    expect(controller.getSnapshot().activeTrip?.items[1]).toMatchObject({
      label: "Milk 1L",
      unitPriceMinor: 135,
    });
    expect(values.get(BARCODE_LINK_STORAGE_KEY)).toContain("Milk 1L");
  });

  it("shows the scan entry point only for what this device can do", () => {
    const { controller, camera, barcodeReader, priceReader } = setup();
    controller.startTrip({ budgetMinor: money(5_000) });
    const unavailable: CameraPort = { isAvailable: () => false, open: vi.fn() };

    const noCamera = render(
      <ShoppingAppShell
        controller={controller}
        camera={unavailable}
        barcodeReader={barcodeReader}
        priceReader={priceReader}
      />,
    );
    expect(screen.queryByRole("button", { name: /Scan|Read price tag/ })).toBeNull();
    noCamera.unmount();

    const nothingToRead = render(<ShoppingAppShell controller={controller} camera={camera} />);
    expect(screen.queryByRole("button", { name: /Scan|Read price tag/ })).toBeNull();
    nothingToRead.unmount();

    const priceOnly = render(
      <ShoppingAppShell controller={controller} camera={camera} priceReader={priceReader} />,
    );
    expect(screen.getByRole("button", { name: "Read price tag" })).not.toBeNull();
    priceOnly.unmount();

    render(<ShoppingAppShell controller={controller} camera={null} />);
    expect(screen.queryByRole("button", { name: /Scan|Read price tag/ })).toBeNull();
  });

  it("opens straight into price tag reading when barcode reading is switched off", async () => {
    const user = userEvent.setup();
    const { controller, camera, priceReader } = setup();
    controller.startTrip({ budgetMinor: money(5_000) });

    render(<ShoppingAppShell controller={controller} camera={camera} priceReader={priceReader} />);

    await user.click(screen.getByRole("button", { name: "Read price tag" }));
    expect(await screen.findByRole("heading", { name: "Read the price tag" })).not.toBeNull();
    expect(screen.queryByRole("group", { name: "What to scan" })).toBeNull();
  });

  it("clears remembered barcode names even when no prices are remembered", async () => {
    const user = userEvent.setup();
    const { values, controller } = setup();
    controller.startTrip({ budgetMinor: money(5_000) });
    controller.addManualItem({
      unitPriceMinor: money(129),
      quantity: 1,
      label: "Milk 1L",
      barcode: "06414893386303" as never,
    });
    controller.removeItem(controller.getSnapshot().activeTrip?.items[0]?.id as never);
    controller.completeTrip();
    controller.dismissCompletedSummary();

    render(<ShoppingAppShell controller={controller} />);

    await user.click(screen.getByRole("button", { name: /View trip history/ }));
    const clear = await screen.findByRole("button", { name: /Clear remembered prices/ });

    expect(clear.textContent).toMatch(/1 remembered barcode name/);
    expect(clear.hasAttribute("disabled")).toBe(false);

    await user.click(clear);
    await user.click(screen.getByRole("button", { name: "Clear remembered prices" }));

    expect(controller.getSnapshot().barcodeLinks).toEqual([]);
    expect(values.get(BARCODE_LINK_STORAGE_KEY)).toContain('"links":[]');
  });

  it("offers a repair for a damaged barcode-name record and resets it on request", async () => {
    const user = userEvent.setup();
    const { values, controller } = setup({ [BARCODE_LINK_STORAGE_KEY]: "{broken" });

    render(<ShoppingAppShell controller={controller} />);

    await user.click(screen.getByRole("button", { name: "Repair remembered prices" }));
    const clear = await screen.findByRole("button", { name: /Clear remembered prices/ });

    expect(clear.textContent).toMatch(/Reset the damaged remembered-price record/);
    expect(values.get(BARCODE_LINK_STORAGE_KEY)).toBe("{broken");

    await user.click(clear);
    await user.click(screen.getByRole("button", { name: "Clear remembered prices" }));

    expect(controller.getSnapshot().barcodeLinkPersistence).toEqual({ status: "healthy" });
    expect(values.get(BARCODE_LINK_STORAGE_KEY)).toContain('"links":[]');
  });
});
