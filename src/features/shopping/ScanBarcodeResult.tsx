import { useEffect, useId, useRef, useState, type RefObject } from "react";

import type { ProductLookupPort } from "../../application/barcode-ports";
import type { BarcodeIdentification } from "../../application/shopping-app-controller";
import { normalizeProductLabel } from "../../domain/barcode-link";
import { formatEur } from "../../domain/money";
import type { PriceMemoryRecord } from "../../domain/price-memory";
import { gtinForDisplay, type Gtin } from "../../domain/product-code";
import { lookupCopy, type LookupState } from "./scan-copy";
import {
  contextTarget,
  type PriceEntryTarget,
  type ScanContext,
} from "./scan-targets";
import styles from "./ScanSurface.module.css";
import { englishTranslate, type Translate } from "./translation";

export type Identified = Extract<BarcodeIdentification, { readonly ok: true }>;

export interface ScanBarcodeResultProps {
  readonly result: Identified;
  readonly productLookup: ProductLookupPort | null;
  readonly canReadPriceTag: boolean;
  readonly locale: string;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onEnterPrice: (target: PriceEntryTarget) => void;
  readonly onReadPriceTag: (context: ScanContext) => void;
  readonly onUseRemembered: (
    record: PriceMemoryRecord,
    barcode: Gtin,
  ) => boolean;
  readonly onScanAnother: () => void;
  readonly t?: Translate;
}

export function ScanBarcodeResult({
  result,
  productLookup,
  canReadPriceTag,
  locale,
  headingRef,
  onEnterPrice,
  onReadPriceTag,
  onUseRemembered,
  onScanAnother,
  t = englishTranslate,
}: ScanBarcodeResultProps) {
  const nameId = useId();
  const lookupAbortRef = useRef<AbortController | null>(null);
  const [name, setName] = useState(result.label ?? "");
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const [actionError, setActionError] = useState("");

  useEffect(
    () => () => {
      lookupAbortRef.current?.abort();
    },
    [],
  );

  const code = result.code;

  const priceActions = (context: ScanContext, typeLabel: string) => (
    <>
      {canReadPriceTag ? (
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            onReadPriceTag(context);
          }}
        >
          {t("Read price tag")}
        </button>
      ) : null}
      <button
        type="button"
        className={canReadPriceTag ? styles.secondary : styles.primary}
        onClick={() => {
          onEnterPrice(context);
        }}
      >
        {typeLabel}
      </button>
    </>
  );

  if (code.kind === "in-store") {
    return (
      <section className={styles.result} aria-labelledby="scan-result-title">
        <h2 id="scan-result-title" ref={headingRef} tabIndex={-1}>
          {t("Store label code")}
        </h2>
        <p>
          {t("The store printed this barcode, for example for a weighed item. It changes from pack to pack, so it can’t be remembered. Use the price on the label.")}
        </p>
        <div className={styles.row}>
          {priceActions({}, t("Enter price"))}
          <button type="button" className={styles.secondary} onClick={onScanAnother}>
            {t("Scan another")}
          </button>
        </div>
      </section>
    );
  }

  if (code.kind === "coupon") {
    return (
      <section className={styles.result} aria-labelledby="scan-result-title">
        <h2 id="scan-result-title" ref={headingRef} tabIndex={-1}>
          {t("Not a product barcode")}
        </h2>
        <p>{t("This looks like a coupon or receipt code.")}</p>
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={onScanAnother}>
            {t("Scan another")}
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              onEnterPrice({});
            }}
          >
            {t("Enter price without scanning")}
          </button>
        </div>
      </section>
    );
  }

  const gtin = code.gtin;
  const displayCode = gtinForDisplay(gtin);
  const knownLabel = result.label;

  if (knownLabel !== null) {
    const remembered = result.remembered;

    return (
      <section className={styles.result} aria-labelledby="scan-result-title">
        <h2 id="scan-result-title" ref={headingRef} tabIndex={-1}>
          {knownLabel}
        </h2>
        <p className={styles.code}>{t("Barcode {code}", { code: displayCode })}</p>
        <p>
          {remembered === null
            ? t("No remembered price yet. Use the price on the shelf.")
            : t("Last time {amount}. Prices change, so check the shelf.", {
                amount: formatEur(remembered.unitPriceMinor, locale),
              })}
        </p>
        <div className={styles.actions}>
          {priceActions(
            contextTarget(knownLabel, gtin),
            canReadPriceTag ? t("Type current price") : t("Enter current price"),
          )}
          {remembered !== null ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setActionError("");

                if (!onUseRemembered(remembered, gtin)) {
                  setActionError(t("Couldn't add it. Enter the price instead."));
                }
              }}
            >
              {t("Use {amount} again", {
                amount: formatEur(remembered.unitPriceMinor, locale),
              })}
            </button>
          ) : null}
          <button type="button" className={styles.secondary} onClick={onScanAnother}>
            {t("Scan another")}
          </button>
        </div>
        {actionError ? (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
        ) : null}
      </section>
    );
  }

  const findNameOnline = (): void => {
    if (productLookup === null) {
      return;
    }

    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    setLookup({ kind: "loading" });

    void productLookup
      .lookup(gtin, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) {
          return;
        }

        setLookup({ kind: "done", result: found });

        if (found.status === "found") {
          setName(found.product.name);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLookup({
            kind: "done",
            result: { status: "failed", reason: "unavailable" },
          });
        }
      });
  };

  const namedContext = (): ScanContext =>
    contextTarget(normalizeProductLabel(name), gtin);

  return (
    <section className={styles.result} aria-labelledby="scan-result-title">
      <h2 id="scan-result-title" ref={headingRef} tabIndex={-1}>
        New product
      </h2>
      <p className={styles.code}>Barcode {displayCode}</p>
      <label className={styles.field} htmlFor={nameId}>
        {t("Name for next time (optional)")}
        <input
          id={nameId}
          value={name}
          autoComplete="off"
          spellCheck={false}
          placeholder={t("Milk 1L")}
          maxLength={120}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />
      </label>
      {productLookup !== null ? (
        <>
          <button
            type="button"
            className={styles.secondary}
            disabled={lookup.kind === "loading"}
            onClick={findNameOnline}
          >
            {lookup.kind === "loading" ? t("Looking up…") : t("Find name online")}
          </button>
          <p className={styles.note}>
            {t("Sends this barcode number to {provider}. Nothing else from your trip leaves your device.", {
              provider: productLookup.providerName,
            })}
          </p>
          <p className={styles.note} role="status" aria-live="polite">
            {lookupCopy(lookup, productLookup.providerName, t)}
          </p>
        </>
      ) : null}
      <div className={styles.row}>
        {canReadPriceTag ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              onReadPriceTag(namedContext());
            }}
          >
            {t("Read price tag")}
          </button>
        ) : null}
        <button
          type="button"
          className={canReadPriceTag ? styles.secondary : styles.primary}
          onClick={() => {
            onEnterPrice(namedContext());
          }}
        >
          {canReadPriceTag ? t("Type price") : t("Continue to price")}
        </button>
        <button type="button" className={styles.secondary} onClick={onScanAnother}>
          {t("Scan another")}
        </button>
      </div>
    </section>
  );
}
