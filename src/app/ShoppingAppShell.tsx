import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  BarcodeReaderPort,
  ProductLookupPort,
} from "../application/barcode-ports";
import type { CameraPort } from "../application/camera-ports";
import type { PriceTagReaderPort } from "../application/price-tag-ports";
import type { VisualProductRecognizerPort } from "../application/visual-recognition-ports";
import { useShoppingAppState } from "../application/react/use-shopping-app-state";
import { needsSaveAttention } from "../application/session-only-persistence";
import type { ShoppingAppController } from "../application/shopping-app-controller";
import type { MinorUnits } from "../domain/money";
import type {
  PriceMemoryId,
  PriceMemoryRecord,
} from "../domain/price-memory";
import type { Gtin } from "../domain/product-code";
import {
  itemCount,
  mostRecentCompletedTrip,
  type ItemId,
  type TripId,
} from "../domain/shopping-trip";
import { ActiveTripScreen } from "../features/shopping/ActiveTripScreen";
import {
  BudgetSettingsSurface,
  type SpendingPlanIntent,
} from "../features/shopping/BudgetSettingsSurface";
import { CompletedSummaryScreen } from "../features/shopping/CompletedSummaryScreen";
import { FinishTripSurface } from "../features/shopping/FinishTripSurface";
import { HistoryIntegrityNotice } from "../features/shopping/HistoryIntegrityNotice";
import {
  ItemEditSurface,
  type ItemEditIntent,
} from "../features/shopping/ItemEditSurface";
import {
  PriceEntrySurface,
  type ValidatedItemIntent,
} from "../features/shopping/PriceEntrySurface";
import type {
  PriceEntryTarget,
  ScanContext,
  ScanMode,
} from "../features/shopping/scan-targets";
import { StartTripScreen } from "../features/shopping/StartTripScreen";
import { useShoppingEvidence } from "#shopping-evidence";
import type { InstallPromptSource } from "../infrastructure/runtime/install-prompt";
import { addedFeedback, remainingFeedback } from "../features/shopping/shopping-feedback";
import { AppFooter } from "./AppFooter";
import { InstallOffer } from "./InstallOffer";
import {
  readPriceEntryModePreference,
  readScanModePreference,
  readVisualModelDownloadAcknowledgement,
  writePriceEntryModePreference,
  writeScanModePreference,
  writeVisualModelDownloadAcknowledgement,
} from "./input-preferences";
import { AppearanceSwitcher } from "./AppearanceSwitcher";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "./i18n";
import { focusNextScreen } from "../features/shopping/focus-next-screen";
import { useShoppingShellFocus } from "./use-shopping-shell-focus";
import styles from "./ShoppingAppShell.module.css";

export interface ShoppingAppShellProps {
  readonly controller: ShoppingAppController;
  readonly camera?: CameraPort | null;
  readonly barcodeReader?: BarcodeReaderPort | null;
  readonly priceReader?: PriceTagReaderPort | null;
  readonly productLookup?: ProductLookupPort | null;
  readonly visualRecognizer?: VisualProductRecognizerPort | null;
  readonly installPrompt?: InstallPromptSource;
}

interface ShoppingAppScreensProps extends ShoppingAppShellProps {
  readonly lastAddedMessage: string;
  readonly setLastAddedMessage: Dispatch<SetStateAction<string>>;
}

const ScanSurface = lazy(() => import("../features/shopping/ScanSurface"));
const loadHistoryScreen = () => import("../features/shopping/HistoryScreen");
const HistoryScreen = lazy(() =>
  loadHistoryScreen().then((module) => ({ default: module.HistoryScreen })),
);
const RecoveryScreen = lazy(() =>
  import("../features/shopping/RecoveryScreen").then((module) => ({
    default: module.RecoveryScreen,
  })),
);

type FocusReturn = "scan" | "price-trigger";

interface AddPriceOverlay {
  readonly kind: "add-price";
  readonly initialLabel?: string;
  readonly sourceMemoryId?: PriceMemoryId;
  readonly barcode?: Gtin;
  readonly initialPrice?: MinorUnits;
  readonly initialQuantity?: number;
  readonly returnTo: FocusReturn;
}

interface ScanOverlay {
  readonly kind: "scan";
  readonly mode: ScanMode;
  readonly context: ScanContext;
  readonly entry?: {
    readonly quantity: number;
    readonly sourceMemoryId?: PriceMemoryId;
    readonly returnTo: FocusReturn;
  };
}

const entryOverlay = (
  target: PriceEntryTarget,
  extra: Omit<AddPriceOverlay, "kind" | "initialLabel" | "barcode" | "initialPrice">,
): AddPriceOverlay => ({
  kind: "add-price",
  ...(target.label === undefined ? {} : { initialLabel: target.label }),
  ...(target.barcode === undefined ? {} : { barcode: target.barcode }),
  ...(target.price === undefined ? {} : { initialPrice: target.price }),
  ...extra,
});

type TripOverlay =
  | AddPriceOverlay
  | ScanOverlay
  | { readonly kind: "budget-settings" }
  | { readonly kind: "edit-item"; readonly itemId: ItemId }
  | { readonly kind: "finish-trip" };

type OverlayState =
  | { readonly kind: "none" }
  | { readonly kind: "history" }
  | (TripOverlay & { readonly tripId: TripId });

const NO_OVERLAY: OverlayState = { kind: "none" };

const SCREEN_HEADINGS: Readonly<Record<string, string>> = {
  idle: "start-trip-title",
  active: "active-trip-title",
  "completed-summary": "completed-title",
  history: "history-title",
  recovery: "recovery-title",
};

function LiveStatus({ message }: { readonly message: string }) {
  const [spoken, setSpoken] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSpoken(message);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [message]);

  return (
    <p className={styles.liveStatus} role="status" aria-live="polite">
      {spoken === message ? message : ""}
    </p>
  );
}

export function ShoppingAppShell(props: ShoppingAppShellProps) {
  const [lastAddedMessage, setLastAddedMessage] = useState("");

  return (
    <>
      <LiveStatus message={lastAddedMessage} />
      <ShoppingAppScreens
        {...props}
        lastAddedMessage={lastAddedMessage}
        setLastAddedMessage={setLastAddedMessage}
      />
    </>
  );
}

function ShoppingAppScreens({
  controller,
  camera = null,
  barcodeReader = null,
  priceReader = null,
  productLookup = null,
  visualRecognizer = null,
  installPrompt,
  lastAddedMessage,
  setLastAddedMessage,
}: ShoppingAppScreensProps) {
  const { locale, t, tp } = useI18n();
  const state = useShoppingAppState(controller);
  const {
    addPriceButtonRef,
    finishTripButtonRef,
    adjustBudgetButtonRef,
    scanButtonRef,
    returnFocusToScan,
    returnFocusToAddPrice,
    returnFocusToPriceTrigger,
    returnFocusToFinishTrip,
    returnFocusToAdjustBudget,
    returnFocusToEditItem,
  } = useShoppingShellFocus();
  const [openedOverlay, setOverlay] = useState<OverlayState>(NO_OVERLAY);
  const overlay: OverlayState =
    "tripId" in openedOverlay &&
    openedOverlay.tripId !== state.activeTrip?.id
      ? NO_OVERLAY
      : openedOverlay;
  const sheetOpen = overlay.kind !== "none";
  const sheetHistoryEntry = useRef(false);
  useEffect(() => {
    if (sheetOpen && !sheetHistoryEntry.current) {
      sheetHistoryEntry.current = true;
      window.history.pushState({ shoppingSheet: true }, "");
    } else if (!sheetOpen && sheetHistoryEntry.current) {
      sheetHistoryEntry.current = false;

      if (window.history.state?.shoppingSheet === true) {
        window.history.back();
      }
    }
  }, [sheetOpen]);
  useEffect(() => {
    const closeSheetOnBack = (): void => {
      if (!sheetHistoryEntry.current) {
        return;
      }

      sheetHistoryEntry.current = false;
      setOverlay(NO_OVERLAY);
      focusNextScreen();
    };

    window.addEventListener("popstate", closeSheetOnBack);

    return () => {
      window.removeEventListener("popstate", closeSheetOnBack);
    };
  }, []);
  const openTripOverlay = (next: TripOverlay): void => {
    if (state.activeTrip !== null) {
      setOverlay({ ...next, tripId: state.activeTrip.id });
    }
  };
  const cameraReady = camera !== null && camera.isAvailable() ? camera : null;
  const scanBarcode = cameraReady === null ? null : barcodeReader;
  const scanProduct = cameraReady === null ? null : visualRecognizer;
  const scanPrice = cameraReady === null ? null : priceReader;
  const fallbackScanMode: ScanMode =
    scanBarcode !== null
      ? "barcode"
      : scanProduct !== null
        ? "product"
        : "price";
  const scanLabel =
    scanProduct !== null
      ? scanBarcode !== null && scanPrice !== null
        ? t("Scan barcode, product or price tag")
        : scanBarcode !== null
          ? t("Scan barcode or product")
          : scanPrice !== null
            ? t("Recognize product or read price tag")
            : t("Recognize product")
      : scanBarcode !== null && scanPrice !== null
        ? t("Scan barcode or price tag")
        : scanBarcode !== null
          ? t("Scan barcode")
          : t("Read price tag");
  const returnFocus = (target: FocusReturn, sourceMemoryId?: PriceMemoryId): void => {
    if (target === "scan") {
      returnFocusToScan();
    } else {
      returnFocusToPriceTrigger(sourceMemoryId);
    }
  };

  useEffect(() => {
    if (state.lifecycle === "active") {
      scanBarcode?.prepare();
    }
  }, [scanBarcode, state.lifecycle]);
  const screenName =
    (state.lifecycle === "idle" || state.lifecycle === "completed-summary") &&
    overlay.kind === "history"
      ? "history"
      : state.lifecycle;
  const shownScreen = useRef(screenName);
  useEffect(() => {
    if (shownScreen.current === screenName) {
      return;
    }

    shownScreen.current = screenName;
    window.scrollTo(0, 0);
    focusNextScreen(SCREEN_HEADINGS[screenName]);
  }, [screenName]);
  const saveProblem = needsSaveAttention(state.persistence)
    ? state.persistence
    : null;
  const announcedSaveProblem = useRef(
    saveProblem?.status === "degraded" ? saveProblem.since : null,
  );
  useEffect(() => {
    const since = saveProblem?.status === "degraded" ? saveProblem.since : null;

    if (since === announcedSaveProblem.current) {
      return;
    }

    announcedSaveProblem.current = since;

    if (saveProblem?.status !== "degraded") {
      return;
    }

    const warning =
      saveProblem.issue.code === "storage-full"
        ? t("Changes aren’t being saved: storage for this app is full.")
        : t("Changes aren’t being saved right now.");

    setLastAddedMessage((current) => (current === "" ? warning : `${current} ${warning}`));
  }, [saveProblem, setLastAddedMessage]);
  const hasHistory = state.completedTrips.length > 0;
  useEffect(() => {
    if (!hasHistory) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadHistoryScreen();
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasHistory]);
  const recentCompletedTrip = mostRecentCompletedTrip(
    state.completedTrips,
  );
  const evidence = useShoppingEvidence({
    controller,
    activeTrip: state.activeTrip,
    priceEntryOpen: overlay.kind === "add-price",
    showBetaPanel:
      state.activeTrip === null && overlay.kind === "none",
  });
  const qaPanel = evidence.panel;

  const openingScreen = (
    <main className={styles.loading} aria-busy="true">
      <p>{t("Opening…")}</p>
    </main>
  );
  const historyScreen = (
    <>
      <Suspense fallback={openingScreen}>
        <HistoryScreen
          controller={controller}
          onTripStarted={() => {
            evidence.recordTripStarted("repeat");
            setOverlay(NO_OVERLAY);
          }}
          onBack={() => {
            setOverlay(NO_OVERLAY);
          }}
          locale={locale}
          t={t}
          tp={tp}
        />
      </Suspense>
      {qaPanel}
    </>
  );

  if (state.lifecycle === "booting") {
    return (
      <>
        <main className={styles.loading} aria-busy="true">
          <p>{t("Opening your shopping budget…")}</p>
        </main>
        {qaPanel}
      </>
    );
  }

  if (state.lifecycle === "recovery") {
    return (
      <>
        <Suspense fallback={openingScreen}>
          <RecoveryScreen controller={controller} t={t} />
        </Suspense>
        {qaPanel}
      </>
    );
  }

  if (state.lifecycle === "idle") {
    if (overlay.kind === "history") {
      return historyScreen;
    }

    return (
      <>
        <StartTripScreen
          controller={controller}
          onTripStarted={(source) => {
            setLastAddedMessage("");
            evidence.recordTripStarted(source);
          }}
          completedTripCount={state.completedTrips.length}
          rememberedPriceCount={state.priceMemories.length}
          priceMemoryNeedsAttention={
            needsSaveAttention(state.priceMemoryPersistence) ||
            needsSaveAttention(state.barcodeLinkPersistence)
          }
          recentTrip={recentCompletedTrip}
          persistenceHealth={state.persistence}
          onOpenHistory={() => {
            evidence.resetQaTiming();
            setOverlay({ kind: "history" });
          }}
          utilityControl={
            <>
              <LanguageSwitcher />
              <AppearanceSwitcher />
            </>
          }
          notice={
            installPrompt === undefined ? null : (
              <InstallOffer
                source={installPrompt}
                hasSavedShopping={
                  state.completedTrips.length > 0 ||
                  state.priceMemories.length > 0 ||
                  state.barcodeLinks.length > 0
                }
              />
            )
          }
          footer={<AppFooter />}
        />
        {qaPanel}
      </>
    );
  }

  if (state.lifecycle === "completed-summary") {
    if (overlay.kind === "history") {
      return historyScreen;
    }

    if (state.completedSummary !== null) {
      return (
        <>
          <CompletedSummaryScreen
            controller={controller}
            trip={state.completedSummary}
            locale={locale}
            t={t}
            tp={tp}
            onDone={() => {
              setOverlay(NO_OVERLAY);
            }}
            onShopAgain={() => {
              evidence.recordTripStarted("repeat");
              setOverlay(NO_OVERLAY);
              setLastAddedMessage(
                t("New trip started with your previous budget."),
              );
            }}
            onViewHistory={() => {
              setOverlay({ kind: "history" });
            }}
          />
          {qaPanel}
        </>
      );
    }
  }

  if (overlay.kind === "add-price" && state.activeTrip !== null) {
    return (
      <>
        <PriceEntrySurface
          trip={state.activeTrip}
          initialMode={readPriceEntryModePreference()}
          onModeChange={writePriceEntryModePreference}
          {...(overlay.initialLabel === undefined
            ? {}
            : { initialLabel: overlay.initialLabel })}
          {...(overlay.initialPrice === undefined
            ? {}
            : { initialPrice: overlay.initialPrice })}
          {...(overlay.initialQuantity === undefined
            ? {}
            : { initialQuantity: overlay.initialQuantity })}
          {...(scanPrice === null
            ? {}
            : {
                onReadPriceTag: (draft: { readonly label?: string; readonly quantity: number }) => {
                  evidence.resetQaTiming();
                  openTripOverlay({
                    kind: "scan",
                    mode: "price",
                    context: {
                      ...(draft.label === undefined ? {} : { label: draft.label }),
                      ...(overlay.barcode === undefined ? {} : { barcode: overlay.barcode }),
                    },
                    entry: {
                      quantity: draft.quantity,
                      returnTo: overlay.returnTo,
                      ...(overlay.sourceMemoryId === undefined
                        ? {}
                        : { sourceMemoryId: overlay.sourceMemoryId }),
                    },
                  });
                },
              })}
          locale={locale}
          t={t}
          onCancel={() => {
            evidence.abandonManualEntry();

            const sourceMemoryId = overlay.sourceMemoryId;
            const returnTo = overlay.returnTo;
            setOverlay(NO_OVERLAY);
            returnFocus(returnTo, sourceMemoryId);
          }}
          onValidatedItem={(intent: ValidatedItemIntent) => {
            const beforeCount =
              state.activeTrip === null ? 0 : itemCount(state.activeTrip);
            const result = controller.addManualItem(
              overlay.barcode === undefined
                ? intent
                : { ...intent, barcode: overlay.barcode },
            );

            if (
              !result.ok ||
              !result.changed ||
              result.state.activeTrip === null
            ) {
              return false;
            }

            const addedItem = result.state.activeTrip.items.at(-1);

            if (addedItem === undefined) {
              return false;
            }

            setLastAddedMessage(
              addedFeedback(result.state.activeTrip, addedItem, locale, t),
            );

            evidence.commitManualEntry(
              intent,
              result.state.activeTrip,
              addedItem,
              beforeCount,
            );

            const sourceMemoryId = overlay.sourceMemoryId;
            const returnTo = overlay.returnTo;
            setOverlay(NO_OVERLAY);
            returnFocus(returnTo, sourceMemoryId);

            return true;
          }}
        />
        {qaPanel}
      </>
    );
  }

  if (
    overlay.kind === "scan" &&
    state.activeTrip !== null &&
    cameraReady !== null &&
    (scanBarcode !== null || scanProduct !== null || scanPrice !== null)
  ) {
    const entry = overlay.entry;

    return (
      <>
        <Suspense
          fallback={
            <main className={styles.loading} aria-busy="true">
              <p>{t("Opening the camera…")}</p>
            </main>
          }
        >
          <ScanSurface
            controller={controller}
            camera={cameraReady}
            barcodeReader={scanBarcode}
            priceReader={scanPrice}
            productLookup={productLookup}
            visualRecognizer={scanProduct}
            visualModelDownloadAcknowledged={readVisualModelDownloadAcknowledgement()}
            onAcknowledgeVisualModelDownload={writeVisualModelDownloadAcknowledgement}
            initialMode={overlay.mode}
            onModeChange={writeScanModePreference}
            context={overlay.context}
            locale={locale}
            t={t}
            tp={tp}
            onCancel={() => {
              if (entry !== undefined) {
                openTripOverlay(
                  entryOverlay(overlay.context, {
                    initialQuantity: entry.quantity,
                    returnTo: entry.returnTo,
                    ...(entry.sourceMemoryId === undefined
                      ? {}
                      : { sourceMemoryId: entry.sourceMemoryId }),
                  }),
                );
                return;
              }

              setOverlay(NO_OVERLAY);
              returnFocusToScan();
            }}
            onEnterPrice={(target) => {
              evidence.resetQaTiming();
              openTripOverlay(
                entryOverlay(target, {
                  returnTo: entry?.returnTo ?? "scan",
                  ...(entry === undefined
                    ? {}
                    : { initialQuantity: entry.quantity }),
                  ...(entry?.sourceMemoryId === undefined
                    ? {}
                    : { sourceMemoryId: entry.sourceMemoryId }),
                }),
              );
            }}
            onUseRemembered={(record, barcode) => {
              const result = controller.addRememberedItem({
                memoryId: record.id,
                barcode,
              });

              if (
                !result.ok ||
                !result.changed ||
                result.state.activeTrip === null
              ) {
                return false;
              }

              setLastAddedMessage(
                t("{label} added at its remembered price. {remaining}", {
                  label: record.label,
                  remaining: remainingFeedback(
                    result.state.activeTrip,
                    locale,
                    t,
                  ),
                }),
              );
              setOverlay(NO_OVERLAY);
              returnFocusToScan();
              return true;
            }}
          />
        </Suspense>
        {qaPanel}
      </>
    );
  }

  if (
    overlay.kind === "budget-settings" &&
    state.activeTrip !== null
  ) {
    return (
      <>
        <BudgetSettingsSurface
          trip={state.activeTrip}
          locale={locale}
          t={t}
          onCancel={() => {
            setOverlay(NO_OVERLAY);
            returnFocusToAdjustBudget();
          }}
          onSave={(intent: SpendingPlanIntent) => {
            const result = controller.updateSpendingPlan(intent);

            if (!result.ok || result.state.activeTrip === null) {
              return false;
            }

            if (result.changed) {
              setLastAddedMessage(
                t("Budget updated. {remaining}", {
                  remaining: remainingFeedback(
                    result.state.activeTrip,
                    locale,
                    t,
                  ),
                }),
              );
            }

            setOverlay(NO_OVERLAY);
            returnFocusToAdjustBudget();
            return true;
          }}
        />
        {qaPanel}
      </>
    );
  }

  if (
    overlay.kind === "finish-trip" &&
    state.activeTrip !== null
  ) {
    return (
      <>
        <FinishTripSurface
          trip={state.activeTrip}
          locale={locale}
          t={t}
          tp={tp}
          onCancel={() => {
            setOverlay(NO_OVERLAY);
            returnFocusToFinishTrip();
          }}
          onConfirm={() => {
            const result = controller.completeTrip();

            if (result.ok) {
              evidence.recordTripFinished();
              setOverlay(NO_OVERLAY);
              return true;
            }

            if (result.state.activeTrip !== null) {
              setOverlay({
                kind: "finish-trip",
                tripId: result.state.activeTrip.id,
              });
            }

            if (
              result.error.kind === "application" &&
              result.error.code === "history-unreadable"
            ) {
              return "history-unreadable";
            }

            return result.state.persistence.status === "degraded" &&
              result.state.persistence.issue.code === "storage-full"
              ? "storage-full"
              : "not-saved";
          }}
          onDiscard={() => {
            const result = controller.discardEmptyTrip();

            if (!result.ok) {
              return false;
            }

            setOverlay(NO_OVERLAY);
            setLastAddedMessage(t("Trip cancelled. Nothing was saved."));
            return true;
          }}
          historyNotice={<HistoryIntegrityNotice controller={controller} />}
          historyNeedsAttention={state.historyIntegrity.status === "degraded"}
        />
        {qaPanel}
      </>
    );
  }

  if (overlay.kind === "edit-item" && state.activeTrip !== null) {
    const item = state.activeTrip.items.find(
      (candidate) => candidate.id === overlay.itemId,
    );

    if (item !== undefined) {
      return (
        <>
          <ItemEditSurface
            trip={state.activeTrip}
            item={item}
            locale={locale}
            t={t}
            onCancel={() => {
              const itemId = item.id;
              setOverlay(NO_OVERLAY);
              returnFocusToEditItem(itemId);
            }}
            onRemove={() => {
              const result = controller.removeItem(item.id);

              if (
                !result.ok ||
                !result.changed ||
                result.state.activeTrip === null
              ) {
                return false;
              }

              setLastAddedMessage(
                t("Item removed. {remaining}", {
                  remaining: remainingFeedback(
                    result.state.activeTrip,
                    locale,
                    t,
                  ),
                }),
              );
              setOverlay(NO_OVERLAY);
              returnFocusToAddPrice();
              return true;
            }}
            onSave={(intent: ItemEditIntent) => {
              const result = controller.updateManualItem({
                itemId: item.id,
                unitPriceMinor: intent.unitPriceMinor,
                quantity: intent.quantity,
                ...(intent.label === undefined
                  ? {}
                  : { label: intent.label }),
              });

              if (
                !result.ok ||
                !result.changed ||
                result.state.activeTrip === null
              ) {
                return false;
              }

              setLastAddedMessage(
                t("Item updated. {remaining}", {
                  remaining: remainingFeedback(
                    result.state.activeTrip,
                    locale,
                    t,
                  ),
                }),
              );
              setOverlay(NO_OVERLAY);

              returnFocusToEditItem(item.id);

              return true;
            }}
          />
          {qaPanel}
        </>
      );
    }
  }

  return (
    <>
      <ActiveTripScreen
        controller={controller}
        t={t}
        tp={tp}
        locale={locale}
        utilityControl={
          <>
            <LanguageSwitcher />
            <AppearanceSwitcher />
          </>
        }
        addPriceButtonRef={addPriceButtonRef}
        finishTripButtonRef={finishTripButtonRef}
        adjustBudgetButtonRef={adjustBudgetButtonRef}
        feedbackMessage={lastAddedMessage}
        onUndo={() => {
          const result = controller.undo();

          if (
            result.ok &&
            result.changed &&
            result.state.activeTrip !== null
          ) {
            setLastAddedMessage(
              t("Last change undone. {remaining}", {
                remaining: remainingFeedback(
                  result.state.activeTrip,
                  locale,
                  t,
                ),
              }),
            );
            returnFocusToAddPrice();
          }
        }}
        onAddPrice={() => {
          setLastAddedMessage("");
          evidence.startOrdinaryManualEntry();
          openTripOverlay({ kind: "add-price", returnTo: "price-trigger" });
        }}
        {...(scanBarcode === null && scanProduct === null && scanPrice === null
          ? {}
          : {
              scanButtonRef,
              scanLabel,
              onScan: () => {
                evidence.resetQaTiming();
                setLastAddedMessage("");
                openTripOverlay({
                  kind: "scan",
                  mode: readScanModePreference(fallbackScanMode),
                  context: {},
                });
              },
            })}
        onAdjustBudget={() => {
          evidence.resetQaTiming();
          setLastAddedMessage("");
          openTripOverlay({ kind: "budget-settings" });
        }}
        onFinishTrip={() => {
          evidence.resetQaTiming();
          setLastAddedMessage("");
          openTripOverlay({ kind: "finish-trip" });
        }}
        onEditItem={(item) => {
          evidence.resetQaTiming();
          setLastAddedMessage("");
          openTripOverlay({ kind: "edit-item", itemId: item.id });
        }}
        onUseRemembered={(record: PriceMemoryRecord) => {
          evidence.resetQaTiming();
          setLastAddedMessage("");

          const beforeCount =
            state.activeTrip === null ? 0 : itemCount(state.activeTrip);
          const result = controller.addRememberedItem({
            memoryId: record.id,
          });

          if (
            !result.ok ||
            !result.changed ||
            result.state.activeTrip === null
          ) {
            return false;
          }

          setLastAddedMessage(
            t("{label} added at its remembered price. {remaining}", {
              label: record.label,
              remaining: remainingFeedback(
                result.state.activeTrip,
                locale,
                t,
              ),
            }),
          );
          evidence.recordRememberedItemUsed(
            result.state.activeTrip,
            beforeCount,
          );
          return true;
        }}
        onEnterCurrentPrice={(record: PriceMemoryRecord) => {
          setLastAddedMessage("");
          evidence.startCurrentPriceOverride();

          openTripOverlay({
            kind: "add-price",
            initialLabel: record.label,
            sourceMemoryId: record.id,
            returnTo: "price-trigger",
          });
        }}
        onRemoveItem={(item) => {
          evidence.resetQaTiming();
          const result = controller.removeItem(item.id);

          if (
            result.ok &&
            result.changed &&
            result.state.activeTrip !== null
          ) {
            setLastAddedMessage(
              t("Item removed. {remaining}", {
                remaining: remainingFeedback(
                  result.state.activeTrip,
                  locale,
                  t,
                ),
              }),
            );
            returnFocusToAddPrice();
          }
        }}
      />
      {qaPanel}
    </>
  );
}
