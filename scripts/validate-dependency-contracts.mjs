import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXACT_SEMVER =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const dependencyVersion = (manifest, dependencyName, owner) => {
  const version = manifest?.dependencies?.[dependencyName];

  if (typeof version !== "string" || version.length === 0) {
    throw new Error(
      `${owner} must declare ${dependencyName} as a runtime dependency.`,
    );
  }

  return version;
};

const packageVersion = (manifest, packageName) => {
  const version = manifest?.version;

  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`${packageName} has no readable package version.`);
  }

  return version;
};

export const validateBarcodeRuntimeContract = ({
  appManifest,
  barcodeDetectorManifest,
  rootZxingManifest,
  nestedZxingManifest = null,
}) => {
  const directSpec = dependencyVersion(
    appManifest,
    "zxing-wasm",
    "Shopping Budget Companion",
  );
  const detectorSpec = dependencyVersion(
    barcodeDetectorManifest,
    "zxing-wasm",
    "barcode-detector",
  );
  const detectorVersion = packageVersion(
    barcodeDetectorManifest,
    "barcode-detector",
  );
  const rootVersion = packageVersion(rootZxingManifest, "zxing-wasm");

  if (!EXACT_SEMVER.test(detectorSpec)) {
    throw new Error(
      `barcode-detector@${detectorVersion} no longer pins zxing-wasm to an exact version (${detectorSpec}). Review the self-hosted ZXing runtime/WASM contract before updating.`,
    );
  }

  if (directSpec !== detectorSpec) {
    throw new Error(
      `Barcode runtime version mismatch: package.json requests zxing-wasm@${directSpec}, but barcode-detector@${detectorVersion} requires zxing-wasm@${detectorSpec}. Update barcode-detector and zxing-wasm as one reviewed unit.`,
    );
  }

  if (rootVersion !== detectorSpec) {
    throw new Error(
      `Installed root zxing-wasm@${rootVersion} does not match barcode-detector@${detectorVersion}'s required zxing-wasm@${detectorSpec}.`,
    );
  }

  if (nestedZxingManifest !== null) {
    const nestedVersion = packageVersion(
      nestedZxingManifest,
      "barcode-detector nested zxing-wasm",
    );

    if (nestedVersion !== rootVersion) {
      throw new Error(
        `Two incompatible ZXing runtimes are installed: root zxing-wasm@${rootVersion} and barcode-detector nested zxing-wasm@${nestedVersion}. The ponyfill runtime and self-hosted WASM must resolve to the same version.`,
      );
    }
  }

  return {
    barcodeDetectorVersion: detectorVersion,
    zxingWasmVersion: rootVersion,
  };
};

const readJson = async (file) =>
  JSON.parse(await readFile(file, "utf8"));

const readOptionalJson = async (file) => {
  try {
    return await readJson(file);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
};

export const validateInstalledDependencyContracts = async (
  rootDir = process.cwd(),
) => {
  const appManifest = await readJson(path.join(rootDir, "package.json"));
  const barcodeDetectorManifest = await readJson(
    path.join(rootDir, "node_modules", "barcode-detector", "package.json"),
  );
  const rootZxingManifest = await readJson(
    path.join(rootDir, "node_modules", "zxing-wasm", "package.json"),
  );
  const nestedZxingManifest = await readOptionalJson(
    path.join(
      rootDir,
      "node_modules",
      "barcode-detector",
      "node_modules",
      "zxing-wasm",
      "package.json",
    ),
  );

  return validateBarcodeRuntimeContract({
    appManifest,
    barcodeDetectorManifest,
    rootZxingManifest,
    nestedZxingManifest,
  });
};

const runningAsCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runningAsCli) {
  try {
    const result = await validateInstalledDependencyContracts();
    console.log(
      `Dependency contracts validated: barcode-detector@${result.barcodeDetectorVersion} + zxing-wasm@${result.zxingWasmVersion}.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Dependency contract validation failed.",
    );
    process.exitCode = 1;
  }
}
