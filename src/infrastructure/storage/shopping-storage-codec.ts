import { mvpMinorUnits } from "../../domain/money";
import {
  createActiveTrip,
  createCartItem,
  isoTimestamp,
  reduceTrip,
  restoreTripItems,
  storeId,
  type ActiveTrip,
  type CartItem,
  type CompletedTrip,
  type IsoTimestamp,
  type PriceConfidence,
  type PriceSource,
} from "../../domain/shopping-trip";
import {
  ACTIVE_TRIP_STORAGE_KEY,
  CURRENT_ACTIVE_TRIP_SCHEMA_VERSION,
  CURRENT_HISTORY_SCHEMA_VERSION,
  HISTORY_STORAGE_KEY,
  activeTripDataV1Schema,
  completedTripDataV1Schema,
  historyDataEnvelopeV1Schema,
  historyStorageEnvelopeV1Schema,
  storageEnvelopeHeaderSchema,
  storageEnvelopeV1Schema,
  type ActiveTripDataV1,
  type ActiveTripEnvelopeV1,
  type CompletedTripDataV1,
  type HistoryEnvelopeV1,
  type PriceConfidenceV1,
  type PriceSourceV1,
} from "./shopping-storage-schema";

export type PersistenceIssueCode =
  | "storage-unavailable"
  | "read-failed"
  | "malformed-json"
  | "invalid-envelope"
  | "unsupported-version"
  | "invalid-data"
  | "serialization-failed"
  | "write-failed"
  | "storage-full"
  | "remove-failed"
  | "history-conflict"
  | "invalid-history-entry"
  | "legacy-retirement-failed";

export interface PersistenceIssue {
  readonly kind: "persistence";
  readonly code: PersistenceIssueCode;
  readonly storageKey: string;
  readonly schemaVersion?: number;
}

export type DecodeActiveTripResult =
  | {
      readonly ok: true;
      readonly trip: ActiveTrip;
      readonly savedAt: IsoTimestamp;
    }
  | {
      readonly ok: false;
      readonly issue: PersistenceIssue;
    };

export type EncodeActiveTripResult =
  | {
      readonly ok: true;
      readonly raw: string;
      readonly savedAt: IsoTimestamp;
    }
  | {
      readonly ok: false;
      readonly issue: PersistenceIssue;
    };

export type DecodeHistoryResult =
  | {
      readonly ok: true;
      readonly trips: readonly CompletedTrip[];
      readonly invalidEntryCount: number;
      readonly savedAt: IsoTimestamp;
    }
  | {
      readonly ok: false;
      readonly issue: PersistenceIssue;
    };

export type EncodeHistoryResult =
  | {
      readonly ok: true;
      readonly raw: string;
      readonly savedAt: IsoTimestamp;
    }
  | {
      readonly ok: false;
      readonly issue: PersistenceIssue;
    };

export const persistenceIssue = (
  code: PersistenceIssueCode,
  storageKey = ACTIVE_TRIP_STORAGE_KEY,
  schemaVersion?: number,
): PersistenceIssue => ({
  kind: "persistence",
  code,
  storageKey,
  ...(schemaVersion === undefined ? {} : { schemaVersion }),
});

const decodePriceSource = (source: PriceSourceV1): PriceSource => {
  switch (source.kind) {
    case "manual":
      return { kind: "manual" };

    case "price-memory":
      return {
        kind: "price-memory",
        memoryId: source.memoryId,
      };

    case "shelf-scan":
      return source.captureId === undefined
        ? { kind: "shelf-scan" }
        : {
            kind: "shelf-scan",
            captureId: source.captureId,
          };

    case "encoded-barcode":
      return {
        kind: "encoded-barcode",
        symbology: source.symbology,
      };

    case "retailer-feed":
      return {
        kind: "retailer-feed",
        provider: source.provider,
      };

    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
};

const decodePriceConfidence = (
  confidence: PriceConfidenceV1,
): PriceConfidence | null => {
  switch (confidence.kind) {
    case "confirmed": {
      const confirmedAt = isoTimestamp(confidence.confirmedAt);

      if (!confirmedAt.ok) {
        return null;
      }

      return {
        kind: "confirmed",
        confirmedAt: confirmedAt.value,
      };
    }

    case "remembered": {
      const observedAt = isoTimestamp(confidence.observedAt);

      if (!observedAt.ok) {
        return null;
      }

      if (confidence.storeId === undefined) {
        return {
          kind: "remembered",
          observedAt: observedAt.value,
        };
      }

      const decodedStoreId = storeId(confidence.storeId);

      if (!decodedStoreId.ok) {
        return null;
      }

      return {
        kind: "remembered",
        observedAt: observedAt.value,
        storeId: decodedStoreId.value,
      };
    }

    case "estimated":
      return confidence.reason === undefined
        ? { kind: "estimated" }
        : {
            kind: "estimated",
            reason: confidence.reason,
          };

    default: {
      const exhaustive: never = confidence;
      return exhaustive;
    }
  }
};

const decodeActiveTripData = (
  data: ActiveTripDataV1,
): ActiveTrip | null => {
  const budgetMinor = mvpMinorUnits(data.budgetMinor);
  const safetyBufferMinor = mvpMinorUnits(data.safetyBufferMinor);

  if (!budgetMinor.ok || !safetyBufferMinor.ok) {
    return null;
  }

  const tripResult = createActiveTrip({
    id: data.id,
    currency: data.currency,
    budgetMinor: budgetMinor.value,
    safetyBufferMinor: safetyBufferMinor.value,
    startedAt: data.startedAt,
  });

  if (!tripResult.ok) {
    return null;
  }

  const items: CartItem[] = [];

  for (const item of data.items) {
    const unitPriceMinor = mvpMinorUnits(item.unitPriceMinor);

    if (!unitPriceMinor.ok) {
      return null;
    }

    const priceConfidence = decodePriceConfidence(item.priceConfidence);

    if (priceConfidence === null) {
      return null;
    }

    const itemResult = createCartItem({
      id: item.id,
      unitPriceMinor: unitPriceMinor.value,
      quantity: item.quantity,
      ...(item.label === undefined ? {} : { label: item.label }),
      priceSource: decodePriceSource(item.priceSource),
      priceConfidence,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });

    if (!itemResult.ok) {
      return null;
    }

    items.push(itemResult.value);
  }

  const restored = restoreTripItems(tripResult.value, items);

  return restored.ok ? restored.value : null;
};

const toActiveTripDataV1 = (trip: ActiveTrip): ActiveTripDataV1 => ({
  id: trip.id,
  status: "active",
  currency: trip.currency,
  budgetMinor: trip.budgetMinor,
  safetyBufferMinor: trip.safetyBufferMinor,
  startedAt: trip.startedAt,
  items: trip.items.map((item) => ({
    id: item.id,
    unitPriceMinor: item.unitPriceMinor,
    quantity: item.quantity,
    ...(item.label === undefined ? {} : { label: item.label }),
    priceSource: item.priceSource,
    priceConfidence: item.priceConfidence,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  })),
});


const decodeCompletedTripData = (
  data: CompletedTripDataV1,
): CompletedTrip | null => {
  const active = decodeActiveTripData({
    id: data.id,
    status: "active",
    currency: data.currency,
    budgetMinor: data.budgetMinor,
    safetyBufferMinor: data.safetyBufferMinor,
    startedAt: data.startedAt,
    items: data.items,
  });

  if (active === null) {
    return null;
  }

  const completedAt = isoTimestamp(data.completedAt);

  if (!completedAt.ok) {
    return null;
  }

  const completed = reduceTrip(active, {
    type: "complete-trip",
    completedAt: completedAt.value,
  });

  if (!completed.ok || completed.value.status !== "completed") {
    return null;
  }

  if (data.actualCheckoutMinor === undefined) {
    return completed.value;
  }

  const actualCheckoutMinor = mvpMinorUnits(data.actualCheckoutMinor);

  if (!actualCheckoutMinor.ok) {
    return null;
  }

  const reconciled = reduceTrip(completed.value, {
    type: "set-actual-checkout",
    actualCheckoutMinor: actualCheckoutMinor.value,
  });

  if (!reconciled.ok || reconciled.value.status !== "completed") {
    return null;
  }

  return reconciled.value;
};

const toCompletedTripDataV1 = (
  trip: CompletedTrip,
): CompletedTripDataV1 => ({
  id: trip.id,
  status: "completed",
  currency: trip.currency,
  budgetMinor: trip.budgetMinor,
  safetyBufferMinor: trip.safetyBufferMinor,
  startedAt: trip.startedAt,
  completedAt: trip.completedAt,
  ...(trip.actualCheckoutMinor === undefined
    ? {}
    : { actualCheckoutMinor: trip.actualCheckoutMinor }),
  items: trip.items.map((item) => ({
    id: item.id,
    unitPriceMinor: item.unitPriceMinor,
    quantity: item.quantity,
    ...(item.label === undefined ? {} : { label: item.label }),
    priceSource: item.priceSource,
    priceConfidence: item.priceConfidence,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  })),
});

const hasDuplicateTripIds = (
  trips: readonly CompletedTrip[],
): boolean => {
  const seen = new Set<string>();

  for (const trip of trips) {
    if (seen.has(trip.id)) {
      return true;
    }

    seen.add(trip.id);
  }

  return false;
};



const validatedCompletedTrips = new WeakSet<CompletedTrip>();
let lastHistoryDecode: {
  readonly raw: string;
  readonly result: DecodeHistoryResult;
} | null = null;

export const decodeHistorySnapshot = (
  raw: string,
): DecodeHistoryResult => {
  if (lastHistoryDecode !== null && lastHistoryDecode.raw === raw) {
    return lastHistoryDecode.result;
  }

  const result = decodeHistoryRaw(raw);
  lastHistoryDecode = { raw, result };
  return result;
};

const decodeHistoryRaw = (raw: string): DecodeHistoryResult => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      issue: persistenceIssue("malformed-json", HISTORY_STORAGE_KEY),
    };
  }

  const header = storageEnvelopeHeaderSchema.safeParse(parsed);

  if (!header.success) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-envelope", HISTORY_STORAGE_KEY),
    };
  }

  if (header.data.schemaVersion !== CURRENT_HISTORY_SCHEMA_VERSION) {
    return {
      ok: false,
      issue: persistenceIssue(
        "unsupported-version",
        HISTORY_STORAGE_KEY,
        header.data.schemaVersion,
      ),
    };
  }

  const envelope = historyStorageEnvelopeV1Schema.safeParse(parsed);

  if (!envelope.success) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-envelope", HISTORY_STORAGE_KEY),
    };
  }

  const savedAt = isoTimestamp(envelope.data.savedAt);

  if (!savedAt.ok) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-envelope", HISTORY_STORAGE_KEY),
    };
  }

  const data = historyDataEnvelopeV1Schema.safeParse(envelope.data.data);

  if (!data.success) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-data", HISTORY_STORAGE_KEY),
    };
  }

  const trips: CompletedTrip[] = [];
  let invalidEntryCount = 0;

  for (const candidate of data.data.trips) {
    const parsedTrip = completedTripDataV1Schema.safeParse(candidate);

    if (!parsedTrip.success) {
      invalidEntryCount += 1;
      continue;
    }

    const trip = decodeCompletedTripData(parsedTrip.data);

    if (trip === null) {
      invalidEntryCount += 1;
      continue;
    }

    validatedCompletedTrips.add(trip);
    trips.push(trip);
  }

  if (hasDuplicateTripIds(trips)) {
    return {
      ok: false,
      issue: persistenceIssue("history-conflict", HISTORY_STORAGE_KEY),
    };
  }

  return {
    ok: true,
    trips,
    invalidEntryCount,
    savedAt: savedAt.value,
  };
};

export const encodeHistorySnapshot = (
  trips: readonly CompletedTrip[],
  savedAtInput: string,
): EncodeHistoryResult => {
  const savedAt = isoTimestamp(savedAtInput);

  if (!savedAt.ok) {
    return {
      ok: false,
      issue: persistenceIssue(
        "serialization-failed",
        HISTORY_STORAGE_KEY,
      ),
    };
  }

  if (hasDuplicateTripIds(trips)) {
    return {
      ok: false,
      issue: persistenceIssue("history-conflict", HISTORY_STORAGE_KEY),
    };
  }

  const encodedTrips: CompletedTripDataV1[] = [];

  for (const trip of trips) {
    const candidate = toCompletedTripDataV1(trip);

    if (validatedCompletedTrips.has(trip)) {
      encodedTrips.push(candidate);
      continue;
    }

    const validated = completedTripDataV1Schema.safeParse(candidate);

    if (!validated.success || decodeCompletedTripData(candidate) === null) {
      return {
        ok: false,
        issue: persistenceIssue("invalid-data", HISTORY_STORAGE_KEY),
      };
    }

    validatedCompletedTrips.add(trip);
    encodedTrips.push(validated.data);
  }

  const envelope: HistoryEnvelopeV1 = {
    schemaVersion: CURRENT_HISTORY_SCHEMA_VERSION,
    savedAt: savedAt.value,
    data: {
      trips: encodedTrips,
    },
  };

  const validatedEnvelope = historyStorageEnvelopeV1Schema.safeParse({
    ...envelope,
    data: { trips: [] },
  });

  if (!validatedEnvelope.success) {
    return {
      ok: false,
      issue: persistenceIssue(
        "serialization-failed",
        HISTORY_STORAGE_KEY,
      ),
    };
  }

  try {
    const raw = JSON.stringify(envelope);
    lastHistoryDecode = {
      raw,
      result: {
        ok: true,
        trips: Object.freeze([...trips]),
        invalidEntryCount: 0,
        savedAt: savedAt.value,
      },
    };

    return {
      ok: true,
      raw,
      savedAt: savedAt.value,
    };
  } catch {
    return {
      ok: false,
      issue: persistenceIssue(
        "serialization-failed",
        HISTORY_STORAGE_KEY,
      ),
    };
  }
};

export const decodeActiveTripSnapshot = (
  raw: string,
): DecodeActiveTripResult => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      issue: persistenceIssue("malformed-json"),
    };
  }

  const header = storageEnvelopeHeaderSchema.safeParse(parsed);

  if (!header.success) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-envelope"),
    };
  }

  if (header.data.schemaVersion > CURRENT_ACTIVE_TRIP_SCHEMA_VERSION) {
    return {
      ok: false,
      issue: persistenceIssue(
        "unsupported-version",
        ACTIVE_TRIP_STORAGE_KEY,
        header.data.schemaVersion,
      ),
    };
  }

  if (header.data.schemaVersion !== CURRENT_ACTIVE_TRIP_SCHEMA_VERSION) {
    return {
      ok: false,
      issue: persistenceIssue(
        "unsupported-version",
        ACTIVE_TRIP_STORAGE_KEY,
        header.data.schemaVersion,
      ),
    };
  }

  const envelope = storageEnvelopeV1Schema.safeParse(parsed);

  if (!envelope.success) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-envelope"),
    };
  }

  const savedAt = isoTimestamp(envelope.data.savedAt);

  if (!savedAt.ok) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-envelope"),
    };
  }

  const data = activeTripDataV1Schema.safeParse(envelope.data.data);

  if (!data.success) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-data"),
    };
  }

  const trip = decodeActiveTripData(data.data);

  if (trip === null) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-data"),
    };
  }

  return {
    ok: true,
    trip,
    savedAt: savedAt.value,
  };
};

export const encodeActiveTripSnapshot = (
  trip: ActiveTrip,
  savedAtInput: string,
): EncodeActiveTripResult => {
  const savedAt = isoTimestamp(savedAtInput);

  if (!savedAt.ok) {
    return {
      ok: false,
      issue: persistenceIssue("serialization-failed"),
    };
  }

  const candidateData = toActiveTripDataV1(trip);
  const validatedData = activeTripDataV1Schema.safeParse(candidateData);

  if (!validatedData.success || decodeActiveTripData(candidateData) === null) {
    return {
      ok: false,
      issue: persistenceIssue("invalid-data"),
    };
  }

  const envelope: ActiveTripEnvelopeV1 = {
    schemaVersion: CURRENT_ACTIVE_TRIP_SCHEMA_VERSION,
    savedAt: savedAt.value,
    data: validatedData.data,
  };

  const validatedEnvelope = storageEnvelopeV1Schema.safeParse(envelope);

  if (!validatedEnvelope.success) {
    return {
      ok: false,
      issue: persistenceIssue("serialization-failed"),
    };
  }

  try {
    return {
      ok: true,
      raw: JSON.stringify(envelope),
      savedAt: savedAt.value,
    };
  } catch {
    return {
      ok: false,
      issue: persistenceIssue("serialization-failed"),
    };
  }
};

