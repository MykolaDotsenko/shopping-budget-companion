import type { BarcodeLink } from "../domain/barcode-link";
import type { BarcodeSymbology, Gtin } from "../domain/product-code";
import type { IsoTimestamp } from "../domain/shopping-trip";
import type { PriceMemoryPersistenceProblem } from "./price-memory-port";

export interface BarcodeReading {
  readonly rawValue: string;
  readonly symbology: BarcodeSymbology | null;
}

export interface BarcodeFrameReader {
  readonly engine: "native" | "fallback";
  readonly detect: () => Promise<readonly BarcodeReading[]>;
}

export interface BarcodeReaderPort {
  readonly prepare: () => void;
  readonly attach: (
    preview: HTMLVideoElement,
  ) => Promise<BarcodeFrameReader | null>;
}

export interface ProductSuggestion {
  readonly name: string;
  readonly brand?: string;
  readonly quantity?: string;
}

export type ProductLookupFailure =
  | "offline"
  | "timeout"
  | "unavailable"
  | "invalid-response";

export type ProductLookupResult =
  | { readonly status: "found"; readonly product: ProductSuggestion }
  | { readonly status: "not-found" }
  | { readonly status: "failed"; readonly reason: ProductLookupFailure };

export interface ProductLookupPort {
  readonly providerName: string;
  readonly lookup: (
    gtin: Gtin,
    signal: AbortSignal,
  ) => Promise<ProductLookupResult>;
}

export type BarcodeLinkBootstrapResult =
  | { readonly ok: true; readonly links: readonly BarcodeLink[] }
  | {
      readonly ok: false;
      readonly links: readonly BarcodeLink[];
      readonly issue: PriceMemoryPersistenceProblem;
    };

export type BarcodeLinkSaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issue: PriceMemoryPersistenceProblem };

export interface BarcodeLinkPersistencePort {
  isCurrent?(): boolean;
  bootstrap(): BarcodeLinkBootstrapResult;
  save(
    links: readonly BarcodeLink[],
    savedAt: IsoTimestamp,
  ): BarcodeLinkSaveResult;
}

export const EMPTY_BARCODE_LINK_PERSISTENCE_PORT: BarcodeLinkPersistencePort =
  Object.freeze({
    bootstrap(): BarcodeLinkBootstrapResult {
      return { ok: true, links: Object.freeze([]) };
    },
    save(): BarcodeLinkSaveResult {
      return { ok: true };
    },
  });
