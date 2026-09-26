import type { PriceMemoryRecord } from "../domain/price-memory";
import type { IsoTimestamp } from "../domain/shopping-trip";

export interface PriceMemoryPersistenceProblem {
  readonly code: string;
  readonly storageKey?: string;
  readonly schemaVersion?: number;
}

export type PriceMemoryBootstrapResult =
  | {
      readonly ok: true;
      readonly records: readonly PriceMemoryRecord[];
    }
  | {
      readonly ok: false;
      readonly records: readonly PriceMemoryRecord[];
      readonly issue: PriceMemoryPersistenceProblem;
    };

export type PriceMemorySaveResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issue: PriceMemoryPersistenceProblem;
    };

export interface PriceMemoryPersistencePort {
  isCurrent?(): boolean;
  bootstrap(): PriceMemoryBootstrapResult;
  save(
    records: readonly PriceMemoryRecord[],
    savedAt: IsoTimestamp,
  ): PriceMemorySaveResult;
}

export const EMPTY_PRICE_MEMORY_PERSISTENCE_PORT: PriceMemoryPersistencePort =
  Object.freeze({
    bootstrap(): PriceMemoryBootstrapResult {
      return {
        ok: true,
        records: Object.freeze([]),
      };
    },
    save(): PriceMemorySaveResult {
      return { ok: true };
    },
  });
