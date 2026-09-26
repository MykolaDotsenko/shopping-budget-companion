import {
  EUR_SPEC,
  MAX_MVP_MONEY_MINOR,
  ok,
  type Brand,
  type MinorUnits,
  type Result,
  type SupportedCurrency,
} from "./money";
import {
  MAX_ITEM_LABEL_CODE_POINTS,
  isoTimestamp,
  storeId as parseStoreId,
  type CompletedTrip,
  type IsoTimestamp,
  type StoreId,
} from "./shopping-trip";

export type ProductId = Brand<string, "ProductId">;
export type PriceMemoryId = Brand<string, "PriceMemoryId">;

export type PriceMemoryObservationSource =
  | { readonly kind: "manual" }
  | { readonly kind: "shelf-scan"; readonly captureId?: string }
  | { readonly kind: "retailer-feed"; readonly provider: string };

export interface PriceMemoryRecord {
  readonly id: PriceMemoryId;
  readonly productId: ProductId;
  readonly label: string;
  readonly currency: SupportedCurrency;
  readonly unitPriceMinor: MinorUnits;
  readonly observedAt: IsoTimestamp;
  readonly storeId?: StoreId;
  readonly source: PriceMemoryObservationSource;
}

export interface CreatePriceMemoryRecordInput {
  readonly productId?: string;
  readonly label: string;
  readonly currency?: string;
  readonly unitPriceMinor: MinorUnits;
  readonly observedAt: string;
  readonly storeId?: string;
  readonly source: PriceMemoryObservationSource;
}

export interface RecentPriceMemoryOptions {
  readonly storeId?: StoreId;
  readonly limit?: number;
  readonly lastBoughtAt?: ReadonlyMap<string, number>;
}

export type PriceMemoryErrorCode =
  | "invalid-product-id"
  | "invalid-memory-id"
  | "invalid-label"
  | "invalid-price"
  | "invalid-timestamp"
  | "invalid-store-id"
  | "invalid-source"
  | "unsupported-currency";

export interface PriceMemoryError {
  readonly kind: "price-memory";
  readonly code: PriceMemoryErrorCode;
}

const memoryError = (
  code: PriceMemoryErrorCode,
): Result<never, PriceMemoryError> => ({
  ok: false,
  error: { kind: "price-memory", code },
});

const normalizeDisplayLabel = (
  value: string,
): Result<string, PriceMemoryError> => {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");

  if (
    normalized === "" ||
    [...normalized].length > MAX_ITEM_LABEL_CODE_POINTS
  ) {
    return memoryError("invalid-label");
  }

  return ok(normalized);
};

const normalizeIdentifier = (
  value: string,
  errorCode: "invalid-product-id" | "invalid-memory-id" | "invalid-source",
): Result<string, PriceMemoryError> => {
  const normalized = value.trim();

  if (normalized === "") {
    return memoryError(errorCode);
  }

  return ok(normalized);
};

export const productIdFromLabel = (
  label: string,
): Result<ProductId, PriceMemoryError> => {
  const normalized = normalizeDisplayLabel(label);

  if (!normalized.ok) {
    return normalized;
  }

  const identityKey = normalized.value.toLocaleLowerCase("en");
  return ok(`label:${identityKey}` as ProductId);
};

export const priceMemoryIdFor = (
  productId: ProductId,
  storeId?: StoreId,
): PriceMemoryId => {
  const storeKey =
    storeId === undefined ? "*" : encodeURIComponent(storeId);

  return `memory:${encodeURIComponent(productId)}:${storeKey}` as PriceMemoryId;
};

const validateSource = (
  source: PriceMemoryObservationSource,
): Result<PriceMemoryObservationSource, PriceMemoryError> => {
  switch (source.kind) {
    case "manual":
      return ok({ kind: "manual" });

    case "shelf-scan": {
      if (source.captureId === undefined) {
        return ok({ kind: "shelf-scan" });
      }

      const captureId = normalizeIdentifier(
        source.captureId,
        "invalid-source",
      );

      return captureId.ok
        ? ok({ kind: "shelf-scan", captureId: captureId.value })
        : captureId;
    }

    case "retailer-feed": {
      const provider = normalizeIdentifier(
        source.provider,
        "invalid-source",
      );

      return provider.ok
        ? ok({ kind: "retailer-feed", provider: provider.value })
        : provider;
    }

    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
};

export const createPriceMemoryRecord = (
  input: CreatePriceMemoryRecordInput,
): Result<PriceMemoryRecord, PriceMemoryError> => {
  if ((input.currency ?? EUR_SPEC.code) !== EUR_SPEC.code) {
    return memoryError("unsupported-currency");
  }

  if (
    !Number.isSafeInteger(input.unitPriceMinor) ||
    input.unitPriceMinor <= 0 ||
    input.unitPriceMinor > MAX_MVP_MONEY_MINOR
  ) {
    return memoryError("invalid-price");
  }

  const label = normalizeDisplayLabel(input.label);

  if (!label.ok) {
    return label;
  }

  const derivedProductId =
    input.productId === undefined
      ? productIdFromLabel(label.value)
      : normalizeIdentifier(input.productId, "invalid-product-id");

  if (!derivedProductId.ok) {
    return derivedProductId;
  }

  const productId = derivedProductId.value as ProductId;
  const observedAt = isoTimestamp(input.observedAt);

  if (!observedAt.ok) {
    return memoryError("invalid-timestamp");
  }

  let decodedStoreId: StoreId | undefined;

  if (input.storeId !== undefined) {
    const parsedStore = parseStoreId(input.storeId);

    if (!parsedStore.ok) {
      return memoryError("invalid-store-id");
    }

    decodedStoreId = parsedStore.value;
  }

  const source = validateSource(input.source);

  if (!source.ok) {
    return source;
  }

  return ok({
    id: priceMemoryIdFor(productId, decodedStoreId),
    productId,
    label: label.value,
    currency: EUR_SPEC.code,
    unitPriceMinor: input.unitPriceMinor,
    observedAt: observedAt.value,
    ...(decodedStoreId === undefined
      ? {}
      : { storeId: decodedStoreId }),
    source: source.value,
  });
};

const observedAtMs = (record: PriceMemoryRecord): number =>
  Date.parse(record.observedAt);

const sameMemoryRecord = (
  left: PriceMemoryRecord,
  right: PriceMemoryRecord,
): boolean =>
  left.id === right.id &&
  left.productId === right.productId &&
  left.label === right.label &&
  left.currency === right.currency &&
  left.unitPriceMinor === right.unitPriceMinor &&
  left.observedAt === right.observedAt &&
  left.storeId === right.storeId &&
  JSON.stringify(left.source) === JSON.stringify(right.source);

export const upsertPriceMemory = (
  records: readonly PriceMemoryRecord[],
  record: PriceMemoryRecord,
  now?: IsoTimestamp,
): readonly PriceMemoryRecord[] => {
  const index = records.findIndex((candidate) => candidate.id === record.id);

  if (index < 0) {
    return Object.freeze([...records, record]);
  }

  const current = records[index];

  if (current === undefined) {
    return records;
  }

  if (sameMemoryRecord(current, record)) {
    return records;
  }

  const currentIsFromTheFuture =
    now !== undefined && observedAtMs(current) > Date.parse(now);

  if (!currentIsFromTheFuture && observedAtMs(record) <= observedAtMs(current)) {
    return records;
  }

  return Object.freeze(
    records.map((candidate, candidateIndex) =>
      candidateIndex === index ? record : candidate,
    ),
  );
};

export const mergePriceMemories = (
  records: readonly PriceMemoryRecord[],
  incoming: readonly PriceMemoryRecord[],
  now?: IsoTimestamp,
): readonly PriceMemoryRecord[] => {
  let next = records;

  for (const record of incoming) {
    next = upsertPriceMemory(next, record, now);
  }

  return next;
};

export const priceMemoryRecordsFromCompletedTrip = (
  trip: CompletedTrip,
): readonly PriceMemoryRecord[] => {
  const records: PriceMemoryRecord[] = [];

  for (const item of trip.items) {
    if (
      item.label === undefined ||
      item.priceConfidence.kind !== "confirmed"
    ) {
      continue;
    }

    let source: PriceMemoryObservationSource | null = null;

    switch (item.priceSource.kind) {
      case "manual":
        source = { kind: "manual" };
        break;
      case "shelf-scan":
        source =
          item.priceSource.captureId === undefined
            ? { kind: "shelf-scan" }
            : {
                kind: "shelf-scan",
                captureId: item.priceSource.captureId,
              };
        break;
      case "retailer-feed":
        source = {
          kind: "retailer-feed",
          provider: item.priceSource.provider,
        };
        break;
      case "price-memory":
      case "encoded-barcode":
        break;
      default: {
        const exhaustive: never = item.priceSource;
        return exhaustive;
      }
    }

    if (source === null) {
      continue;
    }

    const record = createPriceMemoryRecord({
      label: item.label,
      unitPriceMinor: item.unitPriceMinor,
      observedAt: item.priceConfidence.confirmedAt,
      source,
    });

    if (record.ok) {
      records.push(record.value);
    }
  }

  return Object.freeze(records);
};

const storeRank = (
  record: PriceMemoryRecord,
  requestedStoreId: StoreId | undefined,
): number => {
  if (requestedStoreId === undefined) {
    return 1;
  }

  if (record.storeId === requestedStoreId) {
    return 2;
  }

  return record.storeId === undefined ? 1 : 0;
};

export const lastBoughtByProduct = (
  trips: readonly CompletedTrip[],
): ReadonlyMap<string, number> => {
  const lastBought = new Map<string, number>();

  for (const trip of trips) {
    const completedAt = Date.parse(trip.completedAt);

    for (const item of trip.items) {
      const productId =
        item.label === undefined ? null : productIdFromLabel(item.label);

      if (
        productId?.ok === true &&
        completedAt > (lastBought.get(productId.value) ?? Number.NEGATIVE_INFINITY)
      ) {
        lastBought.set(productId.value, completedAt);
      }
    }
  }

  return lastBought;
};

export const recentPriceMemories = (
  records: readonly PriceMemoryRecord[],
  options: RecentPriceMemoryOptions = {},
): readonly PriceMemoryRecord[] => {
  const bestByProduct = new Map<string, PriceMemoryRecord>();

  for (const record of records) {
    const rank = storeRank(record, options.storeId);

    if (rank === 0) {
      continue;
    }

    const current = bestByProduct.get(record.productId);

    if (current === undefined) {
      bestByProduct.set(record.productId, record);
      continue;
    }

    const currentRank = storeRank(current, options.storeId);

    if (
      rank > currentRank ||
      (rank === currentRank &&
        observedAtMs(record) > observedAtMs(current))
    ) {
      bestByProduct.set(record.productId, record);
    }
  }

  const requestedLimit = options.limit ?? 4;
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.max(0, requestedLimit)
    : 4;

  const recency = (record: PriceMemoryRecord): number =>
    Math.max(
      observedAtMs(record),
      options.lastBoughtAt?.get(record.productId) ?? Number.NEGATIVE_INFINITY,
    );

  return Object.freeze(
    [...bestByProduct.values()]
      .sort(
        (left, right) =>
          recency(right) - recency(left) ||
          observedAtMs(right) - observedAtMs(left),
      )
      .slice(0, limit),
  );
};
