export interface VisualProductCandidate {
  readonly label: string;
  readonly confidence: number;
}

export type VisualRecognitionResult =
  | {
      readonly status: "recognized";
      readonly candidates: readonly VisualProductCandidate[];
    }
  | { readonly status: "no-match" }
  | {
      readonly status: "failed";
      readonly reason: "engine-failed" | "timeout";
    };

export interface VisualProductRecognizerPort {
  readonly id: string;
  readonly dataBoundary: "local-only";
  prepare(): Promise<boolean>;
  recognize(
    image: Blob,
    candidateLabels: readonly string[],
    signal: AbortSignal,
  ): Promise<VisualRecognitionResult>;
  release(): void;
}
