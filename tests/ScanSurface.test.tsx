import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { bootstrapBrowserShoppingAppController } from "../src/app/composition-root";
import type {
  BarcodeReaderPort,
  BarcodeReading,
  ProductLookupPort,
  ProductLookupResult,
} from "../src/application/barcode-ports";
import type { CameraFailure, CameraPort } from "../src/application/camera-ports";
import type {
  PriceTagReaderPort,
  PriceTagReadResult,
} from "../src/application/price-tag-ports";
import type { ShoppingAppController } from "../src/application/shopping-app-controller";
import { mvpMinorUnits, type MinorUnits } from "../src/domain/money";
import type { Gtin } from "../src/domain/product-code";
import { rankPriceTagCandidates } from "../src/domain/shelf-price";
import { isoTimestamp, type IsoTimestamp } from "../src/domain/shopping-trip";
import ScanSurface from "../src/features/shopping/ScanSurface";
import { SCAN_FRAMES, type ScanMode } from "../src/features/shopping/scan-targets";
import type { StorageLike } from "../src/infrastructure/storage/shopping-storage";

const must = <T,>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) {
    throw new Error("Expected success");
  }

  return result.value;
};

const money = (value: number): MinorUnits => must(mvpMinorUnits(value));
const time = (value: string): IsoTimestamp => must(isoTimestamp(value));
const MILK = "06414893386303" as Gtin;
const MILK_READING: BarcodeReading = { rawValue: "6414893386303", symbology: "ean-13" };

const memoryStorage = (): StorageLike => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
};

const boot = (): ShoppingAppController => {
  let id = 0;
  return bootstrapBrowserShoppingAppController({
    storage: memoryStorage(),
    storageScope: null,
    clock: { now: () => time("2026-09-21T09:00:00.000Z") },
    ids: {
      tripId: () => `trip-${(id += 1)}`,
      itemId: () => `item-${(id += 1)}`,
    },
  });
};

const withRememberedMilk = (): ShoppingAppController => {
  const controller = boot();
  controller.startTrip({ budgetMinor: money(5_000) });
  controller.addManualItem({ unitPriceMinor: money(129), quantity: 1, label: "Milk 1L", barcode: MILK });
  controller.completeTrip();
  controller.dismissCompletedSummary();
  controller.startTrip({ budgetMinor: money(5_000) });
  return controller;
};

const fakeCamera = ({
  failure,
  torch = false,
  frame = new Blob(["frame"], { type: "image/png" }),
}: {
  readonly failure?: CameraFailure;
  readonly torch?: boolean;
  readonly frame?: Blob | null;
} = {}) => {
  const stop = vi.fn();
  const setTorch = vi.fn(async () => true);
  const captureStill = vi.fn(async () => frame);
  let torchOn = false;
  const port: CameraPort = {
    isAvailable: () => true,
    open: vi.fn(async () =>
      failure === undefined
        ? {
            ok: true as const,
            session: {
              torch: torch
                ? {
                    isOn: () => torchOn,
                    set: async (on: boolean) => {
                      torchOn = on;
                      return await setTorch();
                    },
                  }
                : null,
              captureStill,
              stop,
            },
          }
        : { ok: false as const, failure },
    ),
  };
  return { port, stop, setTorch, captureStill };
};

const fakeBarcodeReader = ({
  readings = [],
  detectError = false,
  engineFails = false,
}: {
  readonly readings?: readonly BarcodeReading[];
  readonly detectError?: boolean;
  readonly engineFails?: boolean;
} = {}) => {
  const port: BarcodeReaderPort = {
    prepare: vi.fn(),
    attach: vi.fn(async () =>
      engineFails
        ? null
        : {
            engine: "native" as const,
            detect: async () => {
              if (detectError) {
                throw new Error("engine crashed");
              }

              return readings;
            },
          },
    ),
  };
  return port;
};

const TAG_CANDIDATES = rankPriceTagCandidates({
  lines: [
    { text: "Valio kevytmaito 1 l", height: 38 },
    { text: "1,29€", height: 131 },
    { text: "26,60 €/kg", height: 30 },
  ],
  superscript: null,
});

const fakePriceReader = (
  result: PriceTagReadResult = { status: "read", candidates: TAG_CANDIDATES },
  { ready = true, progress = [] as readonly number[] } = {},
) => {
  const read = vi.fn(async () => result);
  const prepare = vi.fn(async (onProgress?: (value: { fraction: number | null }) => void) => {
    for (const fraction of progress) {
      onProgress?.({ fraction });
    }

    return ready;
  });
  const port: PriceTagReaderPort = { prepare, read, release: vi.fn() };
  return { port, read, prepare };
};

const lookupReturning = (result: ProductLookupResult) => {
  const lookup = vi.fn(async () => result);
  const port: ProductLookupPort = { providerName: "Open Food Facts", lookup };
  return { port, lookup };
};

const renderSurface = ({
  controller = boot(),
  camera = fakeCamera().port,
  barcodeReader = fakeBarcodeReader() as BarcodeReaderPort | null,
  priceReader = null as PriceTagReaderPort | null,
  productLookup = null as ProductLookupPort | null,
  initialMode = "barcode" as ScanMode,
  context = {},
} = {}) => {
  const onCancel = vi.fn();
  const onEnterPrice = vi.fn();
  const onUseRemembered = vi.fn(() => true);
  const view = render(
    <ScanSurface
      controller={controller}
      camera={camera}
      barcodeReader={barcodeReader}
      priceReader={priceReader}
      productLookup={productLookup}
      initialMode={initialMode}
      context={context}
      onCancel={onCancel}
      onEnterPrice={onEnterPrice}
      onUseRemembered={onUseRemembered}
      locale="en-FI"
    />,
  );
  return { ...view, onCancel, onEnterPrice, onUseRemembered };
};

describe("ScanSurface barcode mode", () => {
  it("offers the remembered product and price after a stable read, then stops the camera", async () => {
    const user = userEvent.setup();
    const camera = fakeCamera();
    const { onEnterPrice, onUseRemembered } = renderSurface({
      controller: withRememberedMilk(),
      camera: camera.port,
      barcodeReader: fakeBarcodeReader({ readings: [MILK_READING] }),
    });

    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Find the product" }));

    const heading = await screen.findByRole("heading", { name: "Milk 1L" });

    await waitFor(() => {
      expect(document.activeElement).toBe(heading);
    });
    expect(camera.stop).toHaveBeenCalled();
    expect(screen.getByText(/Last time €1\.29\. Prices change/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Read price tag" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Enter current price" }));
    expect(onEnterPrice).toHaveBeenCalledWith({ label: "Milk 1L", barcode: MILK });

    await user.click(screen.getByRole("button", { name: "Use €1.29 again" }));
    expect(onUseRemembered).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Milk 1L", unitPriceMinor: 129 }),
      MILK,
    );
  });

  it("looks a new product up online only when asked, and lets the shopper edit the suggestion", async () => {
    const user = userEvent.setup();
    const lookup = lookupReturning({ status: "found", product: { name: "Maito 1 l" } });
    const { onEnterPrice } = renderSurface({
      barcodeReader: fakeBarcodeReader({ readings: [{ rawValue: "6414893386303", symbology: null }] }),
      productLookup: lookup.port,
    });

    await screen.findByRole("heading", { name: "New product" });
    expect(screen.getByText("Barcode 6414893386303")).not.toBeNull();
    expect(screen.getByText(/Sends this barcode number to Open Food Facts/)).not.toBeNull();
    expect(lookup.lookup).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Find name online" }));

    const name = screen.getByLabelText("Name for next time (optional)");
    await waitFor(() => {
      expect((name as HTMLInputElement).value).toBe("Maito 1 l");
    });
    expect(lookup.lookup).toHaveBeenCalledWith(MILK, expect.any(AbortSignal));
    expect(screen.getByText(/Suggested by Open Food Facts/)).not.toBeNull();

    await user.clear(name);
    await user.type(name, "  Kevytmaito ");
    await user.click(screen.getByRole("button", { name: "Continue to price" }));

    expect(onEnterPrice).toHaveBeenCalledWith({ label: "Kevytmaito", barcode: MILK });
  });

  it("explains a missing or failed lookup and still continues without a name", async () => {
    const user = userEvent.setup();
    const notFound = lookupReturning({ status: "not-found" });
    const first = renderSurface({
      barcodeReader: fakeBarcodeReader({ readings: [{ rawValue: "6414893386303", symbology: null }] }),
      productLookup: notFound.port,
    });

    await screen.findByRole("heading", { name: "New product" });
    await user.click(screen.getByRole("button", { name: "Find name online" }));
    expect(await screen.findByText(/doesn't know this barcode/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Continue to price" }));
    expect(first.onEnterPrice).toHaveBeenCalledWith({ barcode: MILK });
    first.unmount();

    const offline = lookupReturning({ status: "failed", reason: "offline" });
    renderSurface({
      barcodeReader: fakeBarcodeReader({ readings: [{ rawValue: "6414893386303", symbology: null }] }),
      productLookup: offline.port,
    });

    await screen.findByRole("heading", { name: "New product" });
    await user.click(screen.getByRole("button", { name: "Find name online" }));
    expect(await screen.findByText(/You're offline/)).not.toBeNull();
  });

  it("hides online lookup entirely when it is switched off", async () => {
    renderSurface({
      barcodeReader: fakeBarcodeReader({ readings: [{ rawValue: "6414893386303", symbology: null }] }),
    });

    await screen.findByRole("heading", { name: "New product" });
    expect(screen.queryByRole("button", { name: "Find name online" })).toBeNull();
    expect(screen.queryByText(/Open Food Facts/)).toBeNull();
  });

  it("sends store label codes straight to manual price entry", async () => {
    const user = userEvent.setup();
    const { onEnterPrice } = renderSurface({
      barcodeReader: fakeBarcodeReader({ readings: [{ rawValue: "2012345678903", symbology: "ean-13" }] }),
    });

    await screen.findByRole("heading", { name: "Store label code" });
    await user.click(screen.getByRole("button", { name: "Enter price" }));
    expect(onEnterPrice).toHaveBeenCalledWith({});
  });

  it("recovers from a blocked camera by typing the barcode, with check-digit feedback", async () => {
    const user = userEvent.setup();
    const { onEnterPrice } = renderSurface({
      controller: withRememberedMilk(),
      camera: fakeCamera({ failure: "permission-denied" }).port,
    });

    await screen.findByRole("heading", { name: "Camera unavailable" });
    expect(screen.getByText(/Camera access is blocked.*type the barcode/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Type barcode" }));
    const input = screen.getByLabelText("Barcode digits");
    expect(document.activeElement).toBe(input);

    await user.type(input, "6414893386304{Enter}");
    expect(screen.getByRole("alert").textContent).toMatch(/don't form a valid barcode/);

    await user.clear(input);
    await user.type(input, "641 4893 386303");
    await user.click(screen.getByRole("button", { name: "Use barcode" }));

    expect(await screen.findByRole("heading", { name: "Milk 1L" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Enter current price" }));
    expect(onEnterPrice).toHaveBeenCalledWith({ label: "Milk 1L", barcode: MILK });
  });

  it("does not offer a retry that cannot help", async () => {
    renderSurface({ camera: fakeCamera({ failure: "no-camera" }).port });

    await screen.findByText(/No camera was found/);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("button", { name: "Enter price without scanning" })).not.toBeNull();
  });

  it("reports a barcode engine that keeps failing or cannot load", async () => {
    const failing = renderSurface({ barcodeReader: fakeBarcodeReader({ detectError: true }) });

    expect(
      await screen.findByText(/barcode reader couldn't load/, {}, { timeout: 2_000 }),
    ).not.toBeNull();
    failing.unmount();

    renderSurface({ barcodeReader: fakeBarcodeReader({ engineFails: true }) });
    expect(await screen.findByText(/barcode reader couldn't load/)).not.toBeNull();
  });

  it("toggles the light, pauses in the background and cancels with Escape", async () => {
    const user = userEvent.setup();
    const camera = fakeCamera({ torch: true });
    const { onCancel, unmount } = renderSurface({ camera: camera.port });
    const light = await screen.findByRole("button", { name: "Light" });

    expect(light.getAttribute("aria-pressed")).toBe("false");
    await user.click(light);
    await waitFor(() => {
      expect(light.getAttribute("aria-pressed")).toBe("true");
    });

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(await screen.findByRole("button", { name: "Resume camera" })).not.toBeNull();
    expect(camera.stop).toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await user.click(screen.getByRole("button", { name: "Resume camera" }));
    expect(await screen.findByRole("button", { name: "Light" })).not.toBeNull();
    expect(camera.port.open).toHaveBeenCalledTimes(2);

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();

    const stopsBefore = camera.stop.mock.calls.length;
    unmount();
    expect(camera.stop.mock.calls.length).toBeGreaterThan(stopsBefore);
  });
});

describe("ScanSurface price tag mode", () => {
  it("reads the framed price tag and hands the chosen price to price entry", async () => {
    const user = userEvent.setup();
    const camera = fakeCamera();
    const reader = fakePriceReader();
    const { onEnterPrice } = renderSurface({
      camera: camera.port,
      priceReader: reader.port,
      initialMode: "price",
    });

    expect(screen.getByRole("heading", { name: "Read the price tag" })).not.toBeNull();
    const shutter = await screen.findByRole("button", { name: "Read price" });

    await waitFor(() => {
      expect(shutter.hasAttribute("disabled")).toBe(false);
    });
    await user.click(shutter);

    const heading = await screen.findByRole("heading", { name: "Choose the price" });

    await waitFor(() => {
      expect(document.activeElement).toBe(heading);
    });
    expect(camera.captureStill).toHaveBeenCalledWith(SCAN_FRAMES.price);
    expect(camera.stop).toHaveBeenCalled();
    expect(reader.read).toHaveBeenCalledWith(expect.any(Blob), expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: /€26\.60.*Unit price/ })).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("2 prices found.");

    await user.click(screen.getByRole("button", { name: "€1.29" }));
    expect(onEnterPrice).toHaveBeenCalledWith({ price: 129 });
  });

  it("carries a scanned product into the price tag read", async () => {
    const user = userEvent.setup();
    const camera = fakeCamera();
    const reader = fakePriceReader();
    const { onEnterPrice } = renderSurface({
      controller: withRememberedMilk(),
      camera: camera.port,
      barcodeReader: fakeBarcodeReader({ readings: [MILK_READING] }),
      priceReader: reader.port,
    });

    await screen.findByRole("heading", { name: "Milk 1L" });
    expect(screen.getByRole("button", { name: "Type current price" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Read price tag" }));

    expect(await screen.findByRole("heading", { name: "Read the price tag" })).not.toBeNull();
    expect(screen.getByText("Milk 1L", { selector: "strong" })).not.toBeNull();
    await user.click(await screen.findByRole("button", { name: "Read price" }));

    expect(await screen.findByRole("heading", { name: "Price for Milk 1L" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "€1.29" }));
    expect(onEnterPrice).toHaveBeenCalledWith({ label: "Milk 1L", barcode: MILK, price: 129 });
    expect(camera.port.open).toHaveBeenCalledTimes(2);
  });

  it("explains an unreadable tag and lets the shopper retake or type", async () => {
    const user = userEvent.setup();
    const camera = fakeCamera();
    const { onEnterPrice } = renderSurface({
      camera: camera.port,
      priceReader: fakePriceReader({ status: "no-price" }).port,
      initialMode: "price",
      context: { label: "Bread" },
    });

    await user.click(await screen.findByRole("button", { name: "Read price" }));
    expect(await screen.findByRole("heading", { name: "No price found" })).not.toBeNull();
    expect(screen.getByText(/Fill the frame with the price tag/)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Read price" })).not.toBeNull();
    expect(camera.port.open).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Type price" }));
    expect(onEnterPrice).toHaveBeenCalledWith({ label: "Bread" });
  });

  it("reports a price reader that cannot start or times out", async () => {
    const user = userEvent.setup();
    const cannotStart = renderSurface({
      priceReader: fakePriceReader(undefined, { ready: false }).port,
      initialMode: "price",
    });

    await user.click(await screen.findByRole("button", { name: "Read price" }));
    expect(await screen.findByRole("heading", { name: "Price reader unavailable" })).not.toBeNull();
    cannotStart.unmount();

    renderSurface({
      priceReader: fakePriceReader({ status: "failed", reason: "timeout" }).port,
      initialMode: "price",
    });

    await user.click(await screen.findByRole("button", { name: "Read price" }));
    expect(await screen.findByText(/Reading took too long/)).not.toBeNull();
  });

  it("explains a camera that gives no picture", async () => {
    const user = userEvent.setup();

    renderSurface({
      camera: fakeCamera({ frame: null }).port,
      priceReader: fakePriceReader().port,
      initialMode: "price",
    });

    await user.click(await screen.findByRole("button", { name: "Read price" }));
    expect(await screen.findByText(/The camera didn't give a picture/)).not.toBeNull();
  });

  it("shows first-time preparation progress while the camera is live", async () => {
    let finish: (ready: boolean) => void = () => undefined;
    const port: PriceTagReaderPort = {
      prepare: vi.fn((onProgress?: (value: { fraction: number | null }) => void) => {
        onProgress?.({ fraction: 0.4 });
        return new Promise<boolean>((resolve) => {
          finish = resolve;
        });
      }),
      read: vi.fn(async () => ({ status: "no-price" as const })),
      release: vi.fn(),
    };

    renderSurface({ priceReader: port, initialMode: "price" });

    expect(
      await screen.findByText("Getting the price reader ready (first time only)… 40%"),
    ).not.toBeNull();

    await act(async () => {
      finish(true);
    });

    expect(await screen.findByText(/Fit the price tag inside the frame/)).not.toBeNull();
  });

  it("switches between barcode and price tag without reopening the camera", async () => {
    const user = userEvent.setup();
    const camera = fakeCamera();
    const barcodeReader = fakeBarcodeReader();

    renderSurface({
      camera: camera.port,
      barcodeReader,
      priceReader: fakePriceReader().port,
    });

    const modes = screen.getByRole("group", { name: "What to scan" });
    const priceTag = screen.getByRole("button", { name: "Price tag" });

    expect(modes).not.toBeNull();
    expect(screen.getByRole("button", { name: "Barcode" }).getAttribute("aria-pressed")).toBe("true");
    await screen.findByRole("button", { name: "Type barcode" });

    await user.click(priceTag);

    expect(priceTag.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Read the price tag" })).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Read price" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Barcode" }));

    expect(screen.getByRole("heading", { name: "Find the product" })).not.toBeNull();
    expect(camera.port.open).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(barcodeReader.attach).toHaveBeenCalledTimes(1);
    });
  });

  it("offers typing the price when the camera is blocked in price mode", async () => {
    const user = userEvent.setup();
    const { onEnterPrice } = renderSurface({
      camera: fakeCamera({ failure: "permission-denied" }).port,
      priceReader: fakePriceReader().port,
      initialMode: "price",
      context: { label: "Bread" },
    });

    await screen.findByRole("heading", { name: "Camera unavailable" });
    expect(screen.getByText(/type the price instead/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Type barcode" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Type price" }));
    expect(onEnterPrice).toHaveBeenCalledWith({ label: "Bread" });
  });

  it("stops an unfinished read when the scanner closes", async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | null = null;
    const port: PriceTagReaderPort = {
      prepare: vi.fn(async () => true),
      read: vi.fn((_image: Blob, received: AbortSignal) => {
        signal = received;
        return new Promise<PriceTagReadResult>(() => undefined);
      }),
      release: vi.fn(),
    };
    const { unmount } = renderSurface({ priceReader: port, initialMode: "price" });

    await user.click(await screen.findByRole("button", { name: "Read price" }));
    expect(await screen.findByText("Reading the price…")).not.toBeNull();
    expect(screen.getByRole("progressbar", { name: "Reading the price" })).not.toBeNull();

    unmount();

    expect((signal as AbortSignal | null)?.aborted).toBe(true);
  });
});
