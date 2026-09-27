import type {
  VisualProductRecognizerPort,
  VisualRecognitionResult,
} from "../../application/visual-recognition-ports";

export const createLazyVisualProductRecognizer =
  (): VisualProductRecognizerPort => {
    let implementationPromise: Promise<VisualProductRecognizerPort> | null = null;

    const implementation = (): Promise<VisualProductRecognizerPort> => {
      implementationPromise ??= import("./transformers-visual-recognizer").then(
        ({ createTransformersVisualProductRecognizer }) =>
          createTransformersVisualProductRecognizer(),
      );

      return implementationPromise;
    };

    return Object.freeze({
      id: "lazy-transformers-clip",
      dataBoundary: "local-only" as const,
      async prepare(): Promise<boolean> {
        try {
          return await (await implementation()).prepare();
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
        try {
          return await (await implementation()).recognize(
            image,
            candidateLabels,
            signal,
          );
        } catch {
          return { status: "failed", reason: "engine-failed" };
        }
      },
      release(): void {
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
