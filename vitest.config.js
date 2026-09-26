import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: {
    __SHOPPING_APP_VERSION__: JSON.stringify("test"),
    __PRICE_OCR_ASSET_DIR__: JSON.stringify("assets/ocr/test"),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "#shopping-evidence": path.resolve(
        rootDir,
        "src/qa/use-shopping-evidence.tsx",
      ),
    },
  },
  test: {
    environment: "jsdom",
    env: { TZ: "UTC" },
    setupFiles: ["./src/test/setup.js"],
    css: true,
    include: ["tests/**/*.test.{js,jsx,ts,tsx}"],
    coverage: {
      provider: "v8",
      include: [
        "src/domain/**/*.{ts,tsx}",
        "src/application/**/*.{ts,tsx}",
        "src/infrastructure/storage/**/*.{ts,tsx}",
        "src/infrastructure/barcode/browser-barcode-reader.ts",
        "src/infrastructure/camera/browser-camera.ts",
        "src/infrastructure/price-ocr/tesseract-layout.ts",
        "src/infrastructure/price-ocr/lazy-price-reader.ts",
        "src/infrastructure/product-lookup/**/*.{ts,tsx}",
      ],
      reporter: ["text", "json-summary"],
      reportOnFailure: true,
      skipFull: true,
      thresholds: {
        statements: 84,
        branches: 74,
        functions: 96,
        lines: 84,
        "src/domain/**": {
          statements: 85,
          branches: 75,
          functions: 100,
          lines: 85,
          perFile: {
            statements: 70,
            branches: 55,
            functions: 90,
            lines: 70,
          },
        },
        "src/application/**": {
          statements: 86,
          branches: 77,
          functions: 95,
          lines: 86,
          perFile: {
            statements: 60,
            branches: 60,
            functions: 50,
            lines: 60,
          },
        },
        "src/infrastructure/storage/**": {
          statements: 82,
          branches: 71,
          functions: 95,
          lines: 82,
          perFile: {
            statements: 45,
            branches: 45,
            functions: 50,
            lines: 45,
          },
        },
      },
    },
  },
});
