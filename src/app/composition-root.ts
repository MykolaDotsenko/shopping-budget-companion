import type {
  BarcodeReaderPort,
  ProductLookupPort,
} from "../application/barcode-ports";
import type { CameraPort } from "../application/camera-ports";
import type { PriceTagReaderPort } from "../application/price-tag-ports";
import {
  createShoppingAppController,
  type Clock,
  type IdGenerator,
  type ShoppingAppController,
} from "../application/shopping-app-controller";
import {
  cryptoIdGenerator,
  systemClock,
} from "../infrastructure/runtime/browser-boundaries";
import { createBrowserBarcodeReader } from "../infrastructure/barcode/browser-barcode-environment";
import { createBrowserCamera } from "../infrastructure/camera/browser-camera-environment";
import { createLazyTesseractPriceReader } from "../infrastructure/price-ocr/lazy-price-reader";
import { createLazyOpenFoodFactsLookup } from "../infrastructure/product-lookup/lazy-product-lookup";
import {
  barcodeScannerEnabled,
  priceOcrEnabled,
  productLookupEnabled,
} from "../infrastructure/runtime/feature-flags";
import {
  listenForInstallPrompt,
  type InstallPromptSource,
} from "../infrastructure/runtime/install-prompt";
import { requestPersistentStorage } from "../infrastructure/runtime/persistent-storage";
import { subscribeToStorageChangesFromOtherTabs } from "../infrastructure/runtime/storage-change-events";
import { createActiveTripPersistencePort } from "../infrastructure/storage/active-trip-persistence-port";
import { createBarcodeLinkPersistencePort } from "../infrastructure/storage/barcode-link-storage";
import { surfaceStorageScope } from "../infrastructure/runtime/deployment-surface";
import { createPriceMemoryPersistencePort } from "../infrastructure/storage/price-memory-persistence-port";
import { scopedStorage } from "../infrastructure/storage/scoped-storage";
import type { StorageLike } from "../infrastructure/storage/shopping-storage";

export interface BrowserShoppingAppDependencies {
  readonly storage?: StorageLike | null;
  readonly storageScope?: string | null;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
}

const resolveBrowserStorage = (): StorageLike | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const createBrowserShoppingAppController = (
  dependencies: BrowserShoppingAppDependencies = {},
): ShoppingAppController => {
  const baseStorage =
    dependencies.storage === undefined
      ? resolveBrowserStorage()
      : dependencies.storage;
  const scope =
    dependencies.storageScope === undefined
      ? surfaceStorageScope()
      : dependencies.storageScope;
  const storage =
    baseStorage === null || scope === null
      ? baseStorage
      : scopedStorage(baseStorage, scope);

  return createShoppingAppController({
    persistence: createActiveTripPersistencePort(storage),
    priceMemoryPersistence: createPriceMemoryPersistencePort(storage),
    barcodeLinkPersistence: createBarcodeLinkPersistencePort(storage),
    clock: dependencies.clock ?? systemClock,
    ids: dependencies.ids ?? cryptoIdGenerator,
  });
};

export const bootstrapBrowserShoppingAppController = (
  dependencies: BrowserShoppingAppDependencies = {},
): ShoppingAppController => {
  const controller = createBrowserShoppingAppController(dependencies);
  controller.bootstrap();
  return controller;
};

export const keepHistoryFromEviction = (
  controller: ShoppingAppController,
): (() => void) => {
  let requested = false;

  const check = (): void => {
    if (!requested && controller.getSnapshot().completedTrips.length > 0) {
      requested = true;
      void requestPersistentStorage();
    }
  };

  check();
  return controller.subscribe(check);
};

export const listenForAppInstallPrompt = (): InstallPromptSource =>
  listenForInstallPrompt();

export const followStorageChangesFromOtherTabs = (
  controller: ShoppingAppController,
): (() => void) =>
  subscribeToStorageChangesFromOtherTabs(() => {
    controller.refreshFromStorage();
  });

export const createBrowserCameraPort = (): CameraPort | null =>
  barcodeScannerEnabled || priceOcrEnabled ? createBrowserCamera() : null;

export const createBrowserBarcodeReaderPort = (): BarcodeReaderPort | null =>
  barcodeScannerEnabled ? createBrowserBarcodeReader() : null;

export const createBrowserPriceTagReader = (): PriceTagReaderPort | null =>
  priceOcrEnabled && typeof window !== "undefined"
    ? createLazyTesseractPriceReader()
    : null;

export const createBrowserProductLookup = (): ProductLookupPort | null =>
  productLookupEnabled && typeof fetch === "function"
    ? createLazyOpenFoodFactsLookup({
        fetch: (input, init) => fetch(input, init),
        appName: "ShoppingBudgetCompanion",
        appVersion: __SHOPPING_APP_VERSION__,
        isOnline: () => navigator.onLine,
      })
    : null;
