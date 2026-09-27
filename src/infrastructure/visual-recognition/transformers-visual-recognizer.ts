import { pipeline } from "@huggingface/transformers";

import type {
  VisualProductCandidate,
  VisualProductRecognizerPort,
  VisualRecognitionResult,
} from "../../application/visual-recognition-ports";

export const VISUAL_RECOGNITION_MODEL_ID = "Xenova/clip-vit-base-patch32";
export const VISUAL_RECOGNITION_MODEL_REVISION =
  "d15189d7028b43f1d3e65039190477f6af591c2a";
export const VISUAL_RECOGNITION_PROMPT_VERSION = "retail-product-v1";
export const VISUAL_RECOGNITION_INFERENCE_TIMEOUT_MS = 20_000;

const HYPOTHESIS_TEMPLATE = "a photo of the retail product {}";
const MAX_CANDIDATES = 5;

interface RawCandidate {
  readonly label: string;
  readonly score: number;
}

type Classifier = (
  image: Blob,
  labels: readonly string[],
  options: { readonly hypothesis_template: string },
) => Promise<unknown>;

interface DisposableClassifier {
  readonly run: Classifier;
  readonly dispose?: () => Promise<void> | void;
}

const isCandidate = (value: unknown): value is RawCandidate => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<RawCandidate>;

  return (
    typeof candidate.label === "string" &&
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    candidate.score >= 0 &&
    candidate.score <= 1
  );
};

const normalizeCandidates = (
  value: unknown,
  labels: readonly string[],
): readonly VisualProductCandidate[] => {
  if (!Array.isArray(value) || !value.every(isCandidate)) {
    throw new Error("Visual recognizer returned an invalid result");
  }

  const allowed = new Set(labels);
  const seen = new Set<string>();
  const candidates: VisualProductCandidate[] = [];

  for (const candidate of [...value].sort(
    (left, right) => right.score - left.score,
  )) {
    if (!allowed.has(candidate.label) || seen.has(candidate.label)) {
      continue;
    }

    seen.add(candidate.label);
    candidates.push(
      Object.freeze({
        label: candidate.label,
        confidence: candidate.score,
      }),
    );

    if (candidates.length >= MAX_CANDIDATES) {
      break;
    }
  }

  return Object.freeze(candidates);
};

const abortError = (): DOMException =>
  new DOMException("Visual recognition aborted", "AbortError");

const withAbortAndTimeout = async <T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  if (signal.aborted) {
    throw abortError();
  }

  let timeout: number | undefined;
  let onAbort: (() => void) | undefined;

  const stopped = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    timeout = window.setTimeout(() => {
      reject(new DOMException("Visual recognition timed out", "TimeoutError"));
    }, VISUAL_RECOGNITION_INFERENCE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([work, stopped]);
  } finally {
    if (onAbort !== undefined) {
      signal.removeEventListener("abort", onAbort);
    }

    if (timeout !== undefined) {
      window.clearTimeout(timeout);
    }
  }
};

const hasWebGpu = (): boolean =>
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { readonly gpu?: unknown }).gpu !== undefined;

const loadClassifier = async (): Promise<DisposableClassifier> => {
  const load = async (device: "webgpu" | "wasm") => {
    const classifier = await pipeline(
      "zero-shot-image-classification",
      VISUAL_RECOGNITION_MODEL_ID,
      {
        revision: VISUAL_RECOGNITION_MODEL_REVISION,
        device,
        dtype: device === "webgpu" ? "q4f16" : "q8",
      },
    );

    const callable = classifier as unknown as Classifier;
    const disposable = classifier as unknown as {
      dispose?: () => Promise<void> | void;
    };

    return {
      run: callable,
      ...(typeof disposable.dispose === "function"
        ? { dispose: () => disposable.dispose?.() }
        : {}),
    };
  };

  if (hasWebGpu()) {
    try {
      return await load("webgpu");
    } catch {
      // WebGPU availability does not guarantee this model can initialize.
      // The WASM path remains the compatibility fallback.
    }
  }

  return load("wasm");
};

export const createTransformersVisualProductRecognizer =
  (): VisualProductRecognizerPort => {
    let classifierPromise: Promise<DisposableClassifier> | null = null;

    const classifier = (): Promise<DisposableClassifier> => {
      classifierPromise ??= loadClassifier();
      return classifierPromise;
    };

    return Object.freeze({
      id: [
        "hf-clip32",
        "tjs-4.3.0",
        VISUAL_RECOGNITION_MODEL_REVISION.slice(0, 12),
        VISUAL_RECOGNITION_PROMPT_VERSION,
      ].join(":"),
      dataBoundary: "local-only" as const,
      async prepare(): Promise<boolean> {
        try {
          await classifier();
          return true;
        } catch {
          classifierPromise = null;
          return false;
        }
      },
      async recognize(
        image: Blob,
        candidateLabels: readonly string[],
        signal: AbortSignal,
      ): Promise<VisualRecognitionResult> {
        if (candidateLabels.length < 2) {
          return { status: "no-match" };
        }

        try {
          const loaded = await classifier();
          const raw = await withAbortAndTimeout(
            loaded.run(image, candidateLabels, {
              hypothesis_template: HYPOTHESIS_TEMPLATE,
            }),
            signal,
          );

          if (signal.aborted) {
            throw abortError();
          }

          const candidates = normalizeCandidates(raw, candidateLabels);

          return candidates.length === 0
            ? { status: "no-match" }
            : { status: "recognized", candidates };
        } catch (error) {
          if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
            throw abortError();
          }

          return {
            status: "failed",
            reason:
              error instanceof DOMException && error.name === "TimeoutError"
                ? "timeout"
                : "engine-failed",
          };
        }
      },
      release(): void {
        if (classifierPromise === null) {
          return;
        }

        void classifierPromise
          .then((loaded) => loaded.dispose?.())
          .catch(() => undefined);
        classifierPromise = null;
      },
    });
  };
