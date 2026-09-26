import * as z from "zod/mini";

import type {
  BarcodeLinkBootstrapResult,
  BarcodeLinkPersistencePort,
  BarcodeLinkSaveResult,
} from "../../application/barcode-ports";
import {
  MAX_BARCODE_LINKS,
  createBarcodeLink,
  type BarcodeLink,
} from "../../domain/barcode-link";
import { isoTimestamp, type IsoTimestamp } from "../../domain/shopping-trip";
import type { StorageLike } from "./shopping-storage";
import { createStorageRevision } from "./storage-revision";
import {
  canonicalIsoTimestampSchema,
  canonicalLabelSchema,
} from "./shopping-storage-schema";

export const BARCODE_LINK_STORAGE_KEY = "budget-cart:barcode-links";
const CURRENT_BARCODE_LINK_SCHEMA_VERSION = 1;

export type BarcodeLinkIssueCode =
  | "storage-unavailable"
  | "read-failed"
  | "malformed-json"
  | "invalid-envelope"
  | "unsupported-version"
  | "invalid-data"
  | "invalid-barcode-link-entry"
  | "barcode-link-conflict"
  | "serialization-failed"
  | "write-failed";

export interface BarcodeLinkIssue {
  readonly code: BarcodeLinkIssueCode;
  readonly storageKey: typeof BARCODE_LINK_STORAGE_KEY;
  readonly schemaVersion?: number;
}

const barcodeLinkV1Schema = z.strictObject({
  gtin: z.string().check(z.regex(/^\d{14}$/u)),
  label: canonicalLabelSchema,
  linkedAt: canonicalIsoTimestampSchema,
});

const envelopeHeaderSchema = z.looseObject({
  schemaVersion: z.int().check(z.minimum(1)),
});

const envelopeV1Schema = z.strictObject({
  schemaVersion: z.literal(CURRENT_BARCODE_LINK_SCHEMA_VERSION),
  savedAt: canonicalIsoTimestampSchema,
  data: z.strictObject({
    links: z.array(z.unknown()).check(z.maxLength(MAX_BARCODE_LINKS)),
  }),
});

type BarcodeLinkV1 = z.infer<typeof barcodeLinkV1Schema>;

const linkIssue = (
  code: BarcodeLinkIssueCode,
  schemaVersion?: number,
): BarcodeLinkIssue => ({
  code,
  storageKey: BARCODE_LINK_STORAGE_KEY,
  ...(schemaVersion === undefined ? {} : { schemaVersion }),
});

export type DecodeBarcodeLinksResult =
  | {
      readonly ok: true;
      readonly links: readonly BarcodeLink[];
      readonly invalidEntryCount: number;
    }
  | { readonly ok: false; readonly issue: BarcodeLinkIssue };

const hasDuplicateGtins = (links: readonly BarcodeLink[]): boolean =>
  new Set(links.map((link) => link.gtin)).size !== links.length;

export const decodeBarcodeLinks = (raw: string): DecodeBarcodeLinksResult => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, issue: linkIssue("malformed-json") };
  }

  const header = envelopeHeaderSchema.safeParse(parsed);

  if (!header.success) {
    return { ok: false, issue: linkIssue("invalid-envelope") };
  }

  if (header.data.schemaVersion !== CURRENT_BARCODE_LINK_SCHEMA_VERSION) {
    return {
      ok: false,
      issue: linkIssue("unsupported-version", header.data.schemaVersion),
    };
  }

  const envelope = envelopeV1Schema.safeParse(parsed);

  if (!envelope.success) {
    return { ok: false, issue: linkIssue("invalid-envelope") };
  }

  const links: BarcodeLink[] = [];
  let invalidEntryCount = 0;

  for (const candidate of envelope.data.data.links) {
    const entry = barcodeLinkV1Schema.safeParse(candidate);
    const link = entry.success ? createBarcodeLink(entry.data) : null;

    if (link === null || !link.ok || link.value.label !== entry.data?.label) {
      invalidEntryCount += 1;
      continue;
    }

    links.push(link.value);
  }

  if (hasDuplicateGtins(links)) {
    return { ok: false, issue: linkIssue("barcode-link-conflict") };
  }

  return { ok: true, links: Object.freeze(links), invalidEntryCount };
};

export const encodeBarcodeLinks = (
  links: readonly BarcodeLink[],
  savedAtInput: string,
):
  | { readonly ok: true; readonly raw: string }
  | { readonly ok: false; readonly issue: BarcodeLinkIssue } => {
  const savedAt = isoTimestamp(savedAtInput);

  if (!savedAt.ok || links.length > MAX_BARCODE_LINKS) {
    return { ok: false, issue: linkIssue("serialization-failed") };
  }

  if (hasDuplicateGtins(links)) {
    return { ok: false, issue: linkIssue("barcode-link-conflict") };
  }

  const entries: BarcodeLinkV1[] = [];

  for (const link of links) {
    const entry = barcodeLinkV1Schema.safeParse({
      gtin: link.gtin,
      label: link.label,
      linkedAt: link.linkedAt,
    });

    if (!entry.success) {
      return { ok: false, issue: linkIssue("invalid-data") };
    }

    entries.push(entry.data);
  }

  return {
    ok: true,
    raw: JSON.stringify({
      schemaVersion: CURRENT_BARCODE_LINK_SCHEMA_VERSION,
      savedAt: savedAt.value,
      data: { links: entries },
    }),
  };
};

const restoreBarcodeLinks = (
  storage: StorageLike | null | undefined,
):
  | { readonly health: "healthy"; readonly links: readonly BarcodeLink[] }
  | {
      readonly health: "degraded";
      readonly links: readonly BarcodeLink[];
      readonly issue: BarcodeLinkIssue;
    } => {
  if (storage === null || storage === undefined) {
    return { health: "degraded", links: [], issue: linkIssue("storage-unavailable") };
  }

  let raw: string | null;

  try {
    raw = storage.getItem(BARCODE_LINK_STORAGE_KEY);
  } catch {
    return { health: "degraded", links: [], issue: linkIssue("read-failed") };
  }

  if (raw === null) {
    return { health: "healthy", links: [] };
  }

  const decoded = decodeBarcodeLinks(raw);

  if (!decoded.ok) {
    return { health: "degraded", links: [], issue: decoded.issue };
  }

  return decoded.invalidEntryCount > 0
    ? {
        health: "degraded",
        links: decoded.links,
        issue: linkIssue("invalid-barcode-link-entry"),
      }
    : { health: "healthy", links: decoded.links };
};

const writeBarcodeLinks = (
  storage: StorageLike | null | undefined,
  links: readonly BarcodeLink[],
  savedAt: IsoTimestamp,
): { readonly ok: true } | { readonly ok: false; readonly issue: BarcodeLinkIssue } => {
  if (storage === null || storage === undefined) {
    return { ok: false, issue: linkIssue("storage-unavailable") };
  }

  const encoded = encodeBarcodeLinks(links, savedAt);

  if (!encoded.ok) {
    return encoded;
  }

  try {
    storage.setItem(BARCODE_LINK_STORAGE_KEY, encoded.raw);
  } catch {
    return { ok: false, issue: linkIssue("write-failed") };
  }

  return { ok: true };
};

export const createBarcodeLinkPersistencePort = (
  storage: StorageLike | null | undefined,
): BarcodeLinkPersistencePort => {
  const revision = createStorageRevision(storage, [BARCODE_LINK_STORAGE_KEY]);

  return {
    isCurrent(): boolean {
      return revision.isCurrent();
    },
    bootstrap(): BarcodeLinkBootstrapResult {
      const restored = restoreBarcodeLinks(storage);
      revision.remember();

      return restored.health === "healthy"
        ? { ok: true, links: restored.links }
        : { ok: false, links: restored.links, issue: restored.issue };
    },
    save(links, savedAt): BarcodeLinkSaveResult {
      const result = writeBarcodeLinks(storage, links, savedAt);
      revision.remember();
      return result;
    },
  };
};
