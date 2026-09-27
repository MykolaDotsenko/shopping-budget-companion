import type {
  VisualProductRecognizerPort,
  VisualRecognitionResult,
} from "../../application/visual-recognition-ports";

const IDLE_RELEASE_MS = 120_000;
const visualRecognitionBuildEnabled =
  import.meta.env.VITE_SHOPPING_VISUAL_RECOGNITION !== "0";

export const createLazyVisualProductRecognizer =
  (): VisualProductRecognizerPort => {
    let implementationPromise: Promise<VisualProductRecognizerPort> | null = null;
    let releaseTimer: number | null = null;

    const implementation = (): Promise<VisualProductRecognizerPort> => {
      if (!visualRecognitionBuildEnabled) {
        return Promise.reject(
          new Error("Visual recognition is disabled in this build"),
        );
      }

      implementationPromise ??= import("./transformers-visual-recognizer").then(
        ({ createTransformersVisualProductRecognizer }) =>
          createTransformersVisualProductRecognizer(),
      );

      return implementationPromise;
    };

    const cancelIdleRelease = (): void => {
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer);
        releaseTimer = null;
      }
    };

    const scheduleIdleRelease = (
      loaded: VisualProductRecognizerPort,
    ): void => {
      cancelIdleRelease();
      releaseTimer = window.setTimeout(() => {
        loaded.release();
        releaseTimer = null;
      }, IDLE_RELEASE_MS);
    };

    return Object.freeze({
      id: "lazy-transformers-clip",
      dataBoundary: "local-only" as const,
      async prepare(signal?: AbortSignal): Promise<boolean> {
        cancelIdleRelease();

        try {
          const loaded = await implementation();

          if (signal?.aborted) {
            loaded.release();
            implementationPromise = null;
            return false;
          }

          const ready = await loaded.prepare(signal);

          if (signal?.aborted) {
            loaded.release();
            implementationPromise = null;
            return false;
          }

          if (ready) {
            scheduleIdleRelease(loaded);
          }

          return ready;
        } catch {
          implementationPromise = null;
          return false;
        }
      },
      async recognize(
        image: Blob,
        candidateLabels: readonly string[],
        signal: AbortSignal,
      ): Promise<VisualRecognitionResult> {
        cancelIdleRelease();

        try {
          const loaded = await implementation();
          const result = await loaded.recognize(
            image,
            candidateLabels,
            signal,
          );
          scheduleIdleRelease(loaded);
          return result;
        } catch (error) {
          if (signal.aborted) {
            throw error;
          }

          return { status: "failed", reason: "engine-failed" };
        }
      },
      release(): void {
        cancelIdleRelease();

        if (implementationPromise === null) {
          return;
        }

        void implementationPromise
          .then((loaded) => {
            loaded.release();
          })
          .catch(() => undefined);
        implementationPromise = null;
      },
    });
  };
