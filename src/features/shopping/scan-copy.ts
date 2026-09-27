import type {
  ProductLookupResult,
} from "../../application/barcode-ports";
import type { CameraFailure } from "../../application/camera-ports";
import type { PriceTagCandidate } from "../../domain/shelf-price";
import type { ProductCodeError } from "../../domain/product-code";

export type ScanFailure = CameraFailure | "engine-failed";

export type PriceReadProblem =
  | "no-price"
  | "no-frame"
  | "timeout"
  | "engine-failed";

export const failureCopy = (
  failure: ScanFailure,
  mode: "barcode" | "product" | "price",
): string => {
  const fallback =
    mode === "price"
      ? "type the price"
      : mode === "barcode"
        ? "type the barcode"
        : "enter the product and price manually";
  const Fallback =
    mode === "price"
      ? "Type the price"
      : mode === "barcode"
        ? "Type the barcode"
        : "Enter the product and price manually";

  switch (failure) {
    case "permission-denied":
      return `Camera access is blocked. Allow the camera for this site in your browser settings, or ${fallback} instead.`;
    case "insecure-context":
      return `The camera needs a secure (https) connection. ${Fallback} instead.`;
    case "unsupported":
      return `This browser can't use the camera here. ${Fallback} instead.`;
    case "no-camera":
      return `No camera was found on this device. ${Fallback} instead.`;
    case "camera-busy":
      return "Another app is using the camera. Close it and try again.";
    case "engine-failed":
      return mode === "barcode"
        ? "The barcode reader couldn't load. Check your connection and try again."
        : mode === "product"
          ? "The product recognizer couldn't load. Check your connection and try again."
          : "The camera helper couldn't load. Check your connection and try again.";
    case "camera-error":
      return `The camera couldn't start. Try again or ${fallback}.`;
    default: {
      const exhaustive: never = failure;
      return exhaustive;
    }
  }
};

export const canRetry = (failure: ScanFailure): boolean =>
  failure === "permission-denied" ||
  failure === "camera-busy" ||
  failure === "engine-failed" ||
  failure === "camera-error";

export const codeErrorCopy = (error: ProductCodeError): string => {
  switch (error.code) {
    case "invalid-characters":
      return "Use the digits under the barcode only.";
    case "invalid-length":
      return "Product barcodes have 8, 12 or 13 digits.";
    case "invalid-check-digit":
      return "Those digits don't form a valid barcode. Check them and try again.";
    default: {
      const exhaustive: never = error.code;
      return exhaustive;
    }
  }
};

export type LookupState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "done"; readonly result: ProductLookupResult };

export const lookupCopy = (state: LookupState, provider: string): string => {
  if (state.kind === "loading") {
    return `Looking up this barcode in ${provider}…`;
  }

  if (state.kind !== "done") {
    return "";
  }

  switch (state.result.status) {
    case "found":
      return `Suggested by ${provider}. Check that it matches the product.`;
    case "not-found":
      return `${provider} doesn't know this barcode. Type a name or continue without one.`;
    case "failed":
      return state.result.reason === "offline"
        ? "You're offline. Type a name or continue without one."
        : `Couldn't reach ${provider}. Try again, type a name or continue without one.`;
    default: {
      const exhaustive: never = state.result;
      return exhaustive;
    }
  }
};

export const priceProblemCopy = (problem: PriceReadProblem): string => {
  switch (problem) {
    case "no-price":
      return "No price was readable. Fill the frame with the price tag, hold it flat and avoid glare.";
    case "no-frame":
      return "The camera didn't give a picture. Try again.";
    case "timeout":
      return "Reading took too long. Try again with the tag closer and steadier.";
    case "engine-failed":
      return "The price reader couldn't start. Check your connection and try again, or type the price.";
    default: {
      const exhaustive: never = problem;
      return exhaustive;
    }
  }
};

export const candidateContextLabel = (
  candidate: PriceTagCandidate,
): string | null => {
  const { context } = candidate;

  if (context.unitPrice) {
    return "Unit price";
  }

  if (context.multiBuy) {
    return "Multi-buy";
  }

  if (context.loyaltyPrice) {
    return "Member price";
  }

  if (context.regularPrice) {
    return "Regular price";
  }

  return null;
};
