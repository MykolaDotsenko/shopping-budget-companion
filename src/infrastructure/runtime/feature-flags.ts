export const barcodeScannerEnabled =
  import.meta.env.VITE_SHOPPING_BARCODE_SCANNER !== "0";

export const productLookupEnabled =
  barcodeScannerEnabled &&
  import.meta.env.VITE_SHOPPING_PRODUCT_LOOKUP !== "0";

export const priceOcrEnabled =
  import.meta.env.VITE_SHOPPING_PRICE_OCR !== "0";

export const visualRecognitionEnabled =
  import.meta.env.VITE_SHOPPING_VISUAL_RECOGNITION !== "0";
