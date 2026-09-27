import type {
  ProductLookupResult,
} from "../../application/barcode-ports";
import { englishTranslate, type Translate } from "./translation";
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
  t: Translate = englishTranslate,
): string => {
  const fallback =
    mode === "price"
      ? t("type the price")
      : mode === "barcode"
        ? t("type the barcode")
        : t("enter the product and price manually");
  const Fallback =
    mode === "price"
      ? t("Type the price")
      : mode === "barcode"
        ? t("Type the barcode")
        : t("Enter the product and price manually");

  switch (failure) {
    case "permission-denied":
      return t("Camera access is blocked. Allow the camera for this site in your browser settings, or {fallback} instead.", { fallback });
    case "insecure-context":
      return t("The camera needs a secure (https) connection. {fallback} instead.", { fallback: Fallback });
    case "unsupported":
      return t("This browser can\'t use the camera here. {fallback} instead.", { fallback: Fallback });
    case "no-camera":
      return t("No camera was found on this device. {fallback} instead.", { fallback: Fallback });
    case "camera-busy":
      return t("Another app is using the camera. Close it and try again.");
    case "engine-failed":
      return mode === "barcode"
        ? "The barcode reader couldn't load. Check your connection and try again."
        : mode === "product"
          ? "The product recognizer couldn't load. Check your connection and try again."
          : "The camera helper couldn't load. Check your connection and try again.";
    case "camera-error":
      return t("The camera couldn\'t start. Try again or {fallback}.", { fallback });
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

export const codeErrorCopy = (error: ProductCodeError, t: Translate = englishTranslate): string => {
  switch (error.code) {
    case "invalid-characters":
      return t("Use the digits under the barcode only.");
    case "invalid-length":
      return t("Product barcodes have 8, 12 or 13 digits.");
    case "invalid-check-digit":
      return t("Those digits don\'t form a valid barcode. Check them and try again.");
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

export const lookupCopy = (state: LookupState, provider: string, t: Translate = englishTranslate): string => {
  if (state.kind === "loading") {
    return t("Looking up this barcode in {provider}…", { provider });
  }

  if (state.kind !== "done") {
    return "";
  }

  switch (state.result.status) {
    case "found":
      return t("Suggested by {provider}. Check that it matches the product.", { provider });
    case "not-found":
      return t("{provider} doesn\'t know this barcode. Type a name or continue without one.", { provider });
    case "failed":
      return state.result.reason === "offline"
        ? t("You\'re offline. Type a name or continue without one.")
        : t("Couldn\'t reach {provider}. Try again, type a name or continue without one.", { provider });
    default: {
      const exhaustive: never = state.result;
      return exhaustive;
    }
  }
};

export const priceProblemCopy = (problem: PriceReadProblem, t: Translate = englishTranslate): string => {
  switch (problem) {
    case "no-price":
      return t("No price was readable. Fill the frame with the price tag, hold it flat and avoid glare.");
    case "no-frame":
      return t("The camera didn't give a picture. Try again.");
    case "timeout":
      return t("Reading took too long. Try again with the tag closer and steadier.");
    case "engine-failed":
      return t("The price reader couldn't start. Check your connection and try again, or type the price.");
    default: {
      const exhaustive: never = problem;
      return exhaustive;
    }
  }
};

export const candidateContextLabel = (
  candidate: PriceTagCandidate,
  t: Translate = englishTranslate,
): string | null => {
  const { context } = candidate;

  if (context.unitPrice) {
    return t("Unit price");
  }

  if (context.multiBuy) {
    return t("Multi-buy");
  }

  if (context.loyaltyPrice) {
    return t("Member price");
  }

  if (context.regularPrice) {
    return t("Regular price");
  }

  return null;
};
