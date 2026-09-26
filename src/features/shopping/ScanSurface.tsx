import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import type {
  BarcodeFrameReader,
  BarcodeReaderPort,
  BarcodeReading,
  ProductLookupPort,
} from "../../application/barcode-ports";
import { createScanStabilizer } from "../../application/barcode-scan";
import type {
  CameraFrameRegion,
  CameraPort,
  CameraSession,
  TorchControl,
} from "../../application/camera-ports";
import type { PriceTagReaderPort } from "../../application/price-tag-ports";
import type { ShoppingAppController } from "../../application/shopping-app-controller";
import type { MinorUnits } from "../../domain/money";
import type { PriceMemoryRecord } from "../../domain/price-memory";
import type { Gtin } from "../../domain/product-code";
import type { PriceTagCandidate } from "../../domain/shelf-price";
import { ScanBarcodeResult, type Identified } from "./ScanBarcodeResult";
import { ScanPriceResult } from "./ScanPriceResult";
import {
  canRetry,
  codeErrorCopy,
  failureCopy,
  type PriceReadProblem,
  type ScanFailure,
} from "./scan-copy";
import {
  SCAN_FRAMES,
  type PriceEntryTarget,
  type ScanContext,
  type ScanMode,
} from "./scan-targets";
import styles from "./ScanSurface.module.css";
import { SHOPPING_LOCALE } from "./shopping-locale";

export interface ScanSurfaceProps {
  readonly controller: ShoppingAppController;
  readonly camera: CameraPort;
  readonly barcodeReader: BarcodeReaderPort | null;
  readonly priceReader: PriceTagReaderPort | null;
  readonly productLookup: ProductLookupPort | null;
  readonly initialMode: ScanMode;
  readonly onModeChange?: (mode: ScanMode) => void;
  readonly context?: ScanContext;
  readonly onCancel: () => void;
  readonly onEnterPrice: (target: PriceEntryTarget) => void;
  readonly onUseRemembered: (
    record: PriceMemoryRecord,
    barcode: Gtin,
  ) => boolean;
  readonly locale?: string;
}

type Phase =
  | { readonly kind: "starting" }
  | {
      readonly kind: "live";
      readonly hint: boolean;
      readonly torch: TorchControl | null;
      readonly torchOn: boolean;
    }
  | { readonly kind: "paused" }
  | { readonly kind: "failed"; readonly failure: ScanFailure }
  | { readonly kind: "typing" }
  | { readonly kind: "reading"; readonly preparing: number | null }
  | { readonly kind: "found"; readonly result: Identified; readonly serial: number }
  | {
      readonly kind: "prices";
      readonly candidates: readonly PriceTagCandidate[];
    }
  | { readonly kind: "price-problem"; readonly problem: PriceReadProblem };

type Warmup =
  | { readonly kind: "idle" }
  | { readonly kind: "preparing"; readonly fraction: number | null }
  | { readonly kind: "ready" }
  | { readonly kind: "failed" };

const SCAN_INTERVAL_MS = 90;
const HINT_AFTER_MS = 8_000;
const MAX_CONSECUTIVE_DETECT_ERRORS = 5;

const percent = (fraction: number | null): string =>
  fraction === null ? "" : ` ${Math.round(fraction * 100)}%`;

const snapshotUrl = (frame: Blob): string | null => {
  try {
    return URL.createObjectURL(frame);
  } catch {
    return null;
  }
};

const frameStyle = (region: CameraFrameRegion) => ({
  left: `${region.x * 100}%`,
  top: `${region.y * 100}%`,
  width: `${region.width * 100}%`,
  height: `${region.height * 100}%`,
});

export default function ScanSurface({
  controller,
  camera,
  barcodeReader,
  priceReader,
  productLookup,
  initialMode,
  onModeChange,
  context: initialContext = {},
  onCancel,
  onEnterPrice,
  onUseRemembered,
  locale = SHOPPING_LOCALE,
}: ScanSurfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const readAbortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const frameReaderRef = useRef<{
    readonly session: CameraSession;
    readonly reader: BarcodeFrameReader;
  } | null>(null);
  const foundSerialRef = useRef(0);
  const manualId = useId();
  const [mode, setMode] = useState<ScanMode>(
    initialMode === "price" && priceReader !== null
      ? "price"
      : barcodeReader !== null
        ? "barcode"
        : "price",
  );
  const [scanContext, setScanContext] = useState<ScanContext>(initialContext);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [cameraRun, setCameraRun] = useState(1);
  const [sessionSerial, setSessionSerial] = useState(0);
  const [warmup, setWarmup] = useState<Warmup>({ kind: "idle" });
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState("");
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const cameraWanted = phase.kind === "starting" || phase.kind === "live";
  const bothModes = barcodeReader !== null && priceReader !== null;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (
      phase.kind === "found" ||
      phase.kind === "failed" ||
      phase.kind === "prices" ||
      phase.kind === "price-problem"
    ) {
      resultRef.current?.focus();
    }

    if (phase.kind === "typing") {
      manualInputRef.current?.focus();
    }
  }, [phase.kind]);

  useEffect(
    () => () => {
      if (capturedUrl !== null) {
        URL.revokeObjectURL(capturedUrl);
      }
    },
    [capturedUrl],
  );

  useEffect(
    () => () => {
      readAbortRef.current?.abort();
    },
    [],
  );

  const onStableReading = useEffectEvent((reading: BarcodeReading) => {
    showIdentification(reading);
  });

  const onEscape = useEffectEvent(() => {
    onCancel();
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onEscape();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (cameraRun === 0 || video === null) {
      return undefined;
    }

    let cancelled = false;
    let opened: CameraSession | null = null;

    void camera.open(video).then((result) => {
      if (cancelled) {
        if (result.ok) {
          result.session.stop();
        }
        return;
      }

      if (!result.ok) {
        setPhase({ kind: "failed", failure: result.failure });
        return;
      }

      opened = result.session;
      sessionRef.current = result.session;
      setSessionSerial((current) => current + 1);
      setPhase({
        kind: "live",
        hint: false,
        torch: result.session.torch,
        torchOn: false,
      });
    });

    return () => {
      cancelled = true;
      opened?.stop();

      if (sessionRef.current === opened) {
        sessionRef.current = null;
      }
    };
  }, [cameraRun, camera]);

  useEffect(() => {
    if (sessionSerial === 0 || cameraRun === 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setPhase((current) =>
        current.kind === "live" ? { ...current, hint: true } : current,
      );
    }, HINT_AFTER_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sessionSerial, cameraRun, mode]);

  useEffect(() => {
    const video = videoRef.current;
    const session = sessionRef.current;

    if (
      cameraRun === 0 ||
      session === null ||
      mode !== "barcode" ||
      barcodeReader === null ||
      video === null
    ) {
      return undefined;
    }

    let cancelled = false;
    let loopTimer: number | undefined;
    const stabilizer = createScanStabilizer();
    const cached = frameReaderRef.current;
    const attached =
      cached !== null && cached.session === session
        ? Promise.resolve(cached.reader)
        : barcodeReader.attach(video);

    void attached.then((reader) => {
      if (cancelled) {
        return;
      }

      if (reader === null) {
        setCameraRun(0);
        setPhase({ kind: "failed", failure: "engine-failed" });
        return;
      }

      frameReaderRef.current = { session, reader };
      let consecutiveErrors = 0;

      const tick = async (): Promise<void> => {
        if (cancelled) {
          return;
        }

        let readings: readonly BarcodeReading[] = [];

        try {
          readings = await reader.detect();
          consecutiveErrors = 0;
        } catch {
          consecutiveErrors += 1;
        }

        if (cancelled) {
          return;
        }

        if (consecutiveErrors >= MAX_CONSECUTIVE_DETECT_ERRORS) {
          setCameraRun(0);
          setPhase({ kind: "failed", failure: "engine-failed" });
          return;
        }

        const stable = stabilizer.accept(readings, performance.now());

        if (stable !== null) {
          session.stop();
          setCameraRun(0);
          navigator.vibrate?.(40);
          onStableReading(stable.reading);
          return;
        }

        loopTimer = window.setTimeout(() => {
          void tick();
        }, SCAN_INTERVAL_MS);
      };

      void tick();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(loopTimer);
    };
  }, [sessionSerial, cameraRun, mode, barcodeReader]);

  useEffect(() => {
    if (mode !== "price" || priceReader === null) {
      return undefined;
    }

    let cancelled = false;

    void priceReader
      .prepare((progress) => {
        if (!cancelled) {
          setWarmup({ kind: "preparing", fraction: progress.fraction });
        }
      })
      .then((ready) => {
        if (!cancelled) {
          setWarmup(ready ? { kind: "ready" } : { kind: "failed" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, priceReader]);

  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        setCameraRun(0);
        setPhase((current) =>
          current.kind === "starting" || current.kind === "live"
            ? { kind: "paused" }
            : current,
        );
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function showIdentification(reading: BarcodeReading): void {
    const result = controller.identifyBarcode(
      reading.rawValue,
      reading.symbology,
    );

    if (result.ok) {
      foundSerialRef.current += 1;
      setPhase({ kind: "found", result, serial: foundSerialRef.current });
    }
  }

  const restartCamera = (): void => {
    readAbortRef.current?.abort();
    setManualError("");
    setCapturedUrl(null);
    setPhase({ kind: "starting" });
    setCameraRun((current) => current + 1);
    titleRef.current?.focus();
  };

  const switchMode = (next: ScanMode): void => {
    if (next === mode) {
      return;
    }

    setMode(next);
    setManualError("");
    onModeChange?.(next);

    if (!cameraWanted) {
      restartCamera();
    }
  };

  const typeInstead = (): void => {
    setCameraRun(0);
    setManualError("");
    setPhase({ kind: "typing" });
  };

  const submitManual = (): void => {
    const result = controller.identifyBarcode(manualCode, null);

    if (!result.ok) {
      setManualError(codeErrorCopy(result.error));
      return;
    }

    setManualError("");
    showIdentification({ rawValue: manualCode, symbology: null });
  };

  const toggleTorch = (): void => {
    if (phase.kind !== "live" || phase.torch === null) {
      return;
    }

    const next = !phase.torchOn;

    void phase.torch.set(next).then((applied) => {
      if (applied) {
        setPhase((current) =>
          current.kind === "live" ? { ...current, torchOn: next } : current,
        );
      }
    });
  };

  const readPriceTag = async (): Promise<void> => {
    const session = sessionRef.current;

    if (priceReader === null || session === null || phase.kind !== "live") {
      return;
    }

    readAbortRef.current?.abort();
    const abort = new AbortController();
    readAbortRef.current = abort;
    const frame = await session.captureStill(SCAN_FRAMES.price);
    setCameraRun(0);

    if (abort.signal.aborted) {
      return;
    }

    if (frame === null) {
      setPhase({ kind: "price-problem", problem: "no-frame" });
      return;
    }

    setCapturedUrl(snapshotUrl(frame));
    setPhase({ kind: "reading", preparing: null });

    const ready = await priceReader.prepare((progress) => {
      if (!abort.signal.aborted) {
        setPhase((current) =>
          current.kind === "reading"
            ? { kind: "reading", preparing: progress.fraction }
            : current,
        );
      }
    });

    if (abort.signal.aborted) {
      return;
    }

    if (!ready) {
      setPhase({ kind: "price-problem", problem: "engine-failed" });
      return;
    }

    setPhase({ kind: "reading", preparing: null });

    try {
      const result = await priceReader.read(frame, abort.signal);

      if (abort.signal.aborted) {
        return;
      }

      setPhase(
        result.status === "read"
          ? { kind: "prices", candidates: result.candidates }
          : {
              kind: "price-problem",
              problem: result.status === "no-price" ? "no-price" : result.reason,
            },
      );
    } catch {
      if (!abort.signal.aborted) {
        setPhase({ kind: "price-problem", problem: "engine-failed" });
      }
    }
  };

  const readPriceFor = (next: ScanContext): void => {
    setScanContext(next);
    setMode("price");
    restartCamera();
  };

  const typePrice = (): void => {
    onEnterPrice(scanContext);
  };

  const choosePrice = (price: MinorUnits): void => {
    onEnterPrice({ ...scanContext, price });
  };

  const liveStatus = (): string => {
    if (phase.kind === "starting") {
      return "Starting the camera…";
    }

    if (phase.kind !== "live") {
      return "";
    }

    if (mode === "barcode") {
      return phase.hint
        ? "Hold the barcode flat and steady, about 10–20 cm from the camera."
        : "Point the camera at the barcode.";
    }

    if (warmup.kind === "preparing" || warmup.kind === "idle") {
      return `Getting the price reader ready (first time only)…${percent(
        warmup.kind === "preparing" ? warmup.fraction : null,
      )}`;
    }

    if (warmup.kind === "failed") {
      return "The price reader couldn't start. You can still type the price.";
    }

    return phase.hint
      ? "Move closer so the price fills the frame, then tap Read price."
      : "Fit the price tag inside the frame, then tap Read price.";
  };

  const statusText =
    phase.kind === "paused"
      ? "Camera paused while the app was in the background."
      : phase.kind === "reading"
        ? phase.preparing === null
          ? "Reading the price…"
          : `Getting the price reader ready (first time only)…${percent(phase.preparing)}`
        : phase.kind === "found"
          ? "Barcode read."
          : phase.kind === "prices"
            ? `${phase.candidates.length === 1 ? "One price" : `${phase.candidates.length} prices`} found.`
            : liveStatus();

  return (
    <main className={styles.screen} aria-labelledby="scan-title">
      <div className={styles.sheet}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Scan</p>
            <h1 id="scan-title" ref={titleRef} tabIndex={-1}>
              {mode === "price" ? "Read the price tag" : "Find the product"}
            </h1>
          </div>
          <button type="button" className={styles.secondary} onClick={onCancel}>
            Cancel
          </button>
        </header>

        {mode === "price" && scanContext.label !== undefined ? (
          <p className={styles.context}>
            Price for <strong>{scanContext.label}</strong>
          </p>
        ) : null}

        <div className={styles.viewport} hidden={!cameraWanted}>
          <video ref={videoRef} muted playsInline aria-label="Camera preview" />
          <div
            className={styles.frame}
            data-mode={mode}
            style={frameStyle(SCAN_FRAMES[mode])}
            aria-hidden="true"
          />
        </div>

        {bothModes && (cameraWanted || phase.kind === "paused" || phase.kind === "failed") ? (
          <div className={styles.modes} role="group" aria-label="What to scan">
            <button
              type="button"
              aria-pressed={mode === "barcode"}
              onClick={() => {
                switchMode("barcode");
              }}
            >
              Barcode
            </button>
            <button
              type="button"
              aria-pressed={mode === "price"}
              onClick={() => {
                switchMode("price");
              }}
            >
              Price tag
            </button>
          </div>
        ) : null}

        <p className={styles.status} role="status" aria-live="polite">
          {statusText}
        </p>

        {phase.kind === "reading" ? (
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Reading the price"
            {...(phase.preparing === null
              ? {}
              : { "aria-valuenow": Math.round(phase.preparing * 100), "aria-valuemin": 0, "aria-valuemax": 100 })}
          >
            <span
              style={
                phase.preparing === null
                  ? undefined
                  : { width: `${Math.round(phase.preparing * 100)}%` }
              }
              data-indeterminate={phase.preparing === null}
            />
          </div>
        ) : null}

        {cameraWanted ? (
          <>
            {mode === "price" && priceReader !== null ? (
              <button
                type="button"
                className={styles.shutter}
                disabled={phase.kind !== "live"}
                onClick={() => {
                  void readPriceTag();
                }}
              >
                Read price
              </button>
            ) : null}
            <p className={styles.note}>
              The camera image stays on this device.
            </p>
            <div className={styles.row}>
              {phase.kind === "live" && phase.torch !== null ? (
                <button
                  type="button"
                  className={styles.secondary}
                  aria-pressed={phase.torchOn}
                  onClick={toggleTorch}
                >
                  Light
                </button>
              ) : null}
              {mode === "barcode" ? (
                <button type="button" className={styles.secondary} onClick={typeInstead}>
                  Type barcode
                </button>
              ) : (
                <button type="button" className={styles.secondary} onClick={typePrice}>
                  Type price
                </button>
              )}
            </div>
          </>
        ) : null}

        {phase.kind === "paused" ? (
          <button type="button" className={styles.primary} onClick={restartCamera}>
            Resume camera
          </button>
        ) : null}

        {phase.kind === "failed" ? (
          <section className={styles.result} aria-labelledby="scan-result-title">
            <h2 id="scan-result-title" ref={resultRef} tabIndex={-1}>
              Camera unavailable
            </h2>
            <p>{failureCopy(phase.failure, mode)}</p>
            <div className={styles.actions}>
              {canRetry(phase.failure) ? (
                <button type="button" className={styles.primary} onClick={restartCamera}>
                  Try again
                </button>
              ) : null}
              {mode === "barcode" ? (
                <button type="button" className={styles.secondary} onClick={typeInstead}>
                  Type barcode
                </button>
              ) : null}
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  onEnterPrice(mode === "price" ? scanContext : {});
                }}
              >
                {mode === "price" ? "Type price" : "Enter price without scanning"}
              </button>
            </div>
          </section>
        ) : null}

        {phase.kind === "typing" ? (
          <form
            className={styles.result}
            onSubmit={(event) => {
              event.preventDefault();
              submitManual();
            }}
          >
            <label className={styles.field} htmlFor={manualId}>
              Barcode digits
              <input
                ref={manualInputRef}
                id={manualId}
                value={manualCode}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                maxLength={16}
                aria-invalid={Boolean(manualError)}
                onChange={(event) => {
                  setManualCode(event.currentTarget.value);
                  setManualError("");
                }}
              />
            </label>
            {manualError ? (
              <p className={styles.error} role="alert">
                {manualError}
              </p>
            ) : null}
            <div className={styles.row}>
              <button type="submit" className={styles.primary}>
                Use barcode
              </button>
              {camera.isAvailable() ? (
                <button type="button" className={styles.secondary} onClick={restartCamera}>
                  Use camera
                </button>
              ) : null}
            </div>
          </form>
        ) : null}

        {phase.kind === "found" ? (
          <ScanBarcodeResult
            key={phase.serial}
            result={phase.result}
            productLookup={productLookup}
            canReadPriceTag={priceReader !== null}
            locale={locale}
            headingRef={resultRef}
            onEnterPrice={onEnterPrice}
            onReadPriceTag={readPriceFor}
            onUseRemembered={onUseRemembered}
            onScanAnother={() => {
              setScanContext({});
              setMode("barcode");
              restartCamera();
            }}
          />
        ) : null}

        {phase.kind === "prices" || phase.kind === "price-problem" ? (
          <ScanPriceResult
            outcome={
              phase.kind === "prices"
                ? { kind: "prices", candidates: phase.candidates }
                : { kind: "problem", problem: phase.problem }
            }
            productLabel={scanContext.label ?? null}
            capturedUrl={capturedUrl}
            locale={locale}
            headingRef={resultRef}
            onChoose={choosePrice}
            onRetake={restartCamera}
            onTypePrice={typePrice}
          />
        ) : null}
      </div>
    </main>
  );
}
