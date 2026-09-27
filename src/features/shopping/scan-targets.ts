import type { CameraFrameRegion } from "../../application/camera-ports";
import type { MinorUnits } from "../../domain/money";
import type { Gtin } from "../../domain/product-code";

export type ScanMode = "barcode" | "product" | "price";

export const SCAN_FRAMES: Readonly<Record<ScanMode, CameraFrameRegion>> = {
  barcode: { x: 0.12, y: 0.28, width: 0.76, height: 0.44 },
  product: { x: 0.08, y: 0.1, width: 0.84, height: 0.78 },
  price: { x: 0.07, y: 0.14, width: 0.86, height: 0.72 },
};

export interface ScanContext {
  readonly label?: string;
  readonly barcode?: Gtin;
}

export interface PriceEntryTarget extends ScanContext {
  readonly price?: MinorUnits;
}

export const contextTarget = (
  label: string | null,
  barcode: Gtin | null,
): ScanContext => ({
  ...(label === null ? {} : { label }),
  ...(barcode === null ? {} : { barcode }),
});
