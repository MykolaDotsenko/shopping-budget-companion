import { describe, expect, it } from "vitest";

import { validateBarcodeRuntimeContract } from "../scripts/validate-dependency-contracts.mjs";

const manifests = (overrides = {}) => ({
  appManifest: {
    dependencies: {
      "zxing-wasm": "3.1.3",
    },
  },
  barcodeDetectorManifest: {
    version: "3.2.2",
    dependencies: {
      "zxing-wasm": "3.1.3",
    },
  },
  rootZxingManifest: {
    version: "3.1.3",
  },
  nestedZxingManifest: null,
  ...overrides,
});

describe("dependency contracts", () => {
  it("accepts one aligned self-hosted barcode runtime", () => {
    expect(validateBarcodeRuntimeContract(manifests())).toEqual({
      barcodeDetectorVersion: "3.2.2",
      zxingWasmVersion: "3.1.3",
    });
  });

  it("rejects a direct zxing-wasm bump ahead of barcode-detector", () => {
    expect(() =>
      validateBarcodeRuntimeContract(
        manifests({
          appManifest: {
            dependencies: {
              "zxing-wasm": "3.1.4",
            },
          },
          rootZxingManifest: {
            version: "3.1.4",
          },
          nestedZxingManifest: {
            version: "3.1.3",
          },
        }),
      ),
    ).toThrow(/Update barcode-detector and zxing-wasm as one reviewed unit/);
  });

  it("rejects an installed root runtime that differs from the vendor contract", () => {
    expect(() =>
      validateBarcodeRuntimeContract(
        manifests({
          rootZxingManifest: {
            version: "3.1.4",
          },
        }),
      ),
    ).toThrow(/Installed root zxing-wasm@3\.1\.4/);
  });

  it("rejects a second incompatible nested runtime", () => {
    expect(() =>
      validateBarcodeRuntimeContract(
        manifests({
          nestedZxingManifest: {
            version: "3.1.4",
          },
        }),
      ),
    ).toThrow(/Two incompatible ZXing runtimes/);
  });

  it("fails closed if barcode-detector stops pinning an exact runtime", () => {
    expect(() =>
      validateBarcodeRuntimeContract(
        manifests({
          barcodeDetectorManifest: {
            version: "3.3.0",
            dependencies: {
              "zxing-wasm": "^3.1.3",
            },
          },
        }),
      ),
    ).toThrow(/no longer pins zxing-wasm to an exact version/);
  });
});
