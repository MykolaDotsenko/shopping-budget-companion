import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { ZXING_WASM_SHA256 } from "zxing-wasm/reader";

import { extractInitialAssetPaths } from "./build-budget.mjs";
import { priceOcrAssets } from "./price-ocr-assets.mjs";

const root = process.cwd();
const dist = path.join(root, "dist");
const assets = path.join(dist, "assets");
const requiredPwaFiles = [
  "manifest.webmanifest",
  "sw.js",
  "pwa-icon-192.png",
  "pwa-icon-512.png",
  "pwa-maskable-512.png",
  "apple-touch-icon.png",
  "favicon-32.png",
  "og-image.jpg",
  "404.html",
  "privacy/index.html",
];

for (const file of requiredPwaFiles) {
  await stat(path.join(dist, file));
}

const manifest = JSON.parse(
  await readFile(path.join(dist, "manifest.webmanifest"), "utf8"),
);

if (
  manifest.name !== "Shopping Budget Companion" ||
  manifest.short_name !== "Shop Budget" ||
  manifest.display !== "standalone" ||
  manifest.start_url !== "./" ||
  manifest.scope !== "./"
) {
  throw new Error("Public PWA manifest does not match the release contract.");
}

const iconSizes = new Set(
  (manifest.icons ?? []).map((icon) => icon.sizes),
);

for (const requiredSize of ["192x192", "512x512"]) {
  if (!iconSizes.has(requiredSize)) {
    throw new Error(
      `Public PWA manifest is missing required icon size ${requiredSize}.`,
    );
  }
}

if (!(manifest.icons ?? []).some((icon) => icon.purpose === "maskable")) {
  throw new Error("Public PWA manifest is missing a maskable icon.");
}

const imageSize = (bytes) => {
  if (bytes.toString("latin1", 0, 8) === "\x89PNG\r\n\x1a\n") {
    return {
      type: "image/png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  let offset = 2;

  while (bytes[0] === 0xff && bytes[1] === 0xd8 && offset + 9 < bytes.length) {
    const marker = bytes[offset + 1];

    if (bytes[offset] !== 0xff) {
      return null;
    }

    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        type: "image/jpeg",
        width: bytes.readUInt16BE(offset + 7),
        height: bytes.readUInt16BE(offset + 5),
      };
    }

    offset += 2 + bytes.readUInt16BE(offset + 2);
  }

  return null;
};

const screenshotRatios = new Map();

if ((manifest.screenshots ?? []).length === 0) {
  throw new Error("Public PWA manifest has no screenshots for the install dialog.");
}

for (const screenshot of manifest.screenshots) {
  const size = imageSize(await readFile(path.join(dist, screenshot.src)));
  const [width, height] = screenshot.sizes.split("x").map(Number);
  const ratio = (width / height).toFixed(3);

  if (
    size === null ||
    size.type !== screenshot.type ||
    size.width !== width ||
    size.height !== height
  ) {
    throw new Error(
      `Manifest screenshot ${screenshot.src} is not a ${screenshot.sizes} ${screenshot.type}.`,
    );
  }

  if (
    Math.min(width, height) < 320 ||
    Math.max(width, height) > 3840 ||
    Math.max(width, height) / Math.min(width, height) > 2.3 ||
    !["narrow", "wide"].includes(screenshot.form_factor) ||
    !screenshot.label
  ) {
    throw new Error(
      `Manifest screenshot ${screenshot.src} would not be shown in the install dialog.`,
    );
  }

  if ((screenshotRatios.get(screenshot.form_factor) ?? ratio) !== ratio) {
    throw new Error(
      `Manifest screenshots for ${screenshot.form_factor} screens must share one aspect ratio.`,
    );
  }

  screenshotRatios.set(screenshot.form_factor, ratio);
}

const indexHtml = await readFile(path.join(dist, "index.html"), "utf8");

if (!indexHtml.includes('rel="manifest"')) {
  throw new Error("Public build does not link its web app manifest.");
}

for (const marker of [
  'rel="apple-touch-icon"',
  'property="og:image" content="https://',
  'name="twitter:card"',
  'rel="canonical"',
]) {
  if (!indexHtml.includes(marker)) {
    throw new Error(`Public build is missing its share metadata: ${marker}`);
  }
}

const MAX_PUBLIC_JS_BYTES = 443_000;
const MAX_INITIAL_JS_BYTES = 396_000;
const MAX_SINGLE_JS_CHUNK_BYTES = 230_000;
const MAX_PUBLIC_JS_GZIP_BYTES = 132_000;
const MAX_INITIAL_JS_GZIP_BYTES = 116_000;
const MAX_PUBLIC_CSS_BYTES = 81_500;
const MAX_INITIAL_CSS_BYTES = 63_000;
const MAX_PUBLIC_CSS_GZIP_BYTES = 15_600;
const MAX_INITIAL_CSS_GZIP_BYTES = 10_600;
const barcodeScannerEnabled = process.env.VITE_SHOPPING_BARCODE_SCANNER !== "0";
const priceOcrEnabled = process.env.VITE_SHOPPING_PRICE_OCR !== "0";
const BARCODE_ENGINE_CHUNK_PREFIX = "zxing-fallback-detector-";
const MAX_BARCODE_ENGINE_JS_BYTES = 60_000;
const MAX_BARCODE_ENGINE_JS_GZIP_BYTES = 20_000;
const MAX_BARCODE_ENGINE_WASM_BYTES = 1_200_000;
const PRICE_READER_CHUNK_PREFIX = "tesseract-price-reader-";
const MAX_PRICE_READER_JS_BYTES = 40_000;
const MAX_PRICE_READER_JS_GZIP_BYTES = 14_000;
const MAX_PRICE_READER_ASSET_BYTES = 10_500_000;
const forbiddenMarkers = [
  "Retention Beta",
  "Local beta evidence",
  "Empirical Timing QA",
  "budget-cart:qa:retention-v1",
  "Retention cohort analyzer",
  "retention-cohort-summary",
];

const files = await readdir(assets);
const allJsFiles = files.filter((file) => file.endsWith(".js"));
const engineJsFiles = allJsFiles.filter((file) =>
  file.startsWith(BARCODE_ENGINE_CHUNK_PREFIX),
);
const priceReaderJsFiles = allJsFiles.filter((file) =>
  file.startsWith(PRICE_READER_CHUNK_PREFIX),
);
const jsFiles = allJsFiles.filter(
  (file) =>
    !file.startsWith(BARCODE_ENGINE_CHUNK_PREFIX) &&
    !file.startsWith(PRICE_READER_CHUNK_PREFIX),
);
const cssFiles = files.filter((file) => file.endsWith(".css"));
const wasmFiles = files.filter((file) => file.endsWith(".wasm"));

if (jsFiles.length === 0) {
  throw new Error("Public build contains no JavaScript asset.");
}

const assetSize = async (file) => (await stat(path.join(assets, file))).size;
const assetGzipSize = async (file) =>
  gzipSync(await readFile(path.join(assets, file))).byteLength;

const totalSize = async (names, sizeReader) =>
  (
    await Promise.all(
      names.map(async (file) => sizeReader(file)),
    )
  ).reduce((sum, size) => sum + size, 0);

const toAssetName = (distAssetPath) =>
  distAssetPath.startsWith("assets/")
    ? distAssetPath.slice("assets/".length)
    : distAssetPath;

const {
  js: initialJsPaths,
  css: initialCssPaths,
} = extractInitialAssetPaths(indexHtml);

if (initialJsPaths.length === 0) {
  throw new Error(
    "Public index does not expose an initial module JavaScript asset.",
  );
}

if (initialCssPaths.length === 0) {
  throw new Error(
    "Public index does not expose an initial stylesheet asset.",
  );
}

const initialJsFiles = initialJsPaths.map(toAssetName);
const initialCssFiles = initialCssPaths.map(toAssetName);

for (const file of [...initialJsFiles, ...initialCssFiles]) {
  await stat(path.join(assets, file));
}

const initialJsSet = new Set(initialJsFiles);
const lazyJsFiles = jsFiles.filter((file) => !initialJsSet.has(file));

const totalJsBytes = await totalSize(jsFiles, assetSize);
const totalCssBytes = await totalSize(cssFiles, assetSize);
const initialJsBytes = await totalSize(initialJsFiles, assetSize);
const initialCssBytes = await totalSize(initialCssFiles, assetSize);
const totalJsGzipBytes = await totalSize(jsFiles, assetGzipSize);
const totalCssGzipBytes = await totalSize(cssFiles, assetGzipSize);
const initialJsGzipBytes = await totalSize(initialJsFiles, assetGzipSize);
const initialCssGzipBytes = await totalSize(initialCssFiles, assetGzipSize);
const lazyJsBytes = await totalSize(lazyJsFiles, assetSize);
const largestJsChunkBytes = Math.max(
  ...(await Promise.all(jsFiles.map(assetSize))),
);

if (totalJsBytes > MAX_PUBLIC_JS_BYTES) {
  throw new Error(
    `Public JavaScript budget exceeded: ${totalJsBytes} > ${MAX_PUBLIC_JS_BYTES} bytes.`,
  );
}

if (initialJsBytes > MAX_INITIAL_JS_BYTES) {
  throw new Error(
    `Initial JavaScript budget exceeded: ${initialJsBytes} > ${MAX_INITIAL_JS_BYTES} bytes.`,
  );
}

if (largestJsChunkBytes > MAX_SINGLE_JS_CHUNK_BYTES) {
  throw new Error(
    `Single JavaScript chunk budget exceeded: ${largestJsChunkBytes} > ${MAX_SINGLE_JS_CHUNK_BYTES} bytes.`,
  );
}

if (totalJsGzipBytes > MAX_PUBLIC_JS_GZIP_BYTES) {
  throw new Error(
    `Public gzipped JavaScript budget exceeded: ${totalJsGzipBytes} > ${MAX_PUBLIC_JS_GZIP_BYTES} bytes.`,
  );
}

if (initialJsGzipBytes > MAX_INITIAL_JS_GZIP_BYTES) {
  throw new Error(
    `Initial gzipped JavaScript budget exceeded: ${initialJsGzipBytes} > ${MAX_INITIAL_JS_GZIP_BYTES} bytes.`,
  );
}

if (totalCssBytes > MAX_PUBLIC_CSS_BYTES) {
  throw new Error(
    `Public CSS budget exceeded: ${totalCssBytes} > ${MAX_PUBLIC_CSS_BYTES} bytes.`,
  );
}

if (initialCssBytes > MAX_INITIAL_CSS_BYTES) {
  throw new Error(
    `Initial CSS budget exceeded: ${initialCssBytes} > ${MAX_INITIAL_CSS_BYTES} bytes.`,
  );
}

if (totalCssGzipBytes > MAX_PUBLIC_CSS_GZIP_BYTES) {
  throw new Error(
    `Public gzipped CSS budget exceeded: ${totalCssGzipBytes} > ${MAX_PUBLIC_CSS_GZIP_BYTES} bytes.`,
  );
}

if (initialCssGzipBytes > MAX_INITIAL_CSS_GZIP_BYTES) {
  throw new Error(
    `Initial gzipped CSS budget exceeded: ${initialCssGzipBytes} > ${MAX_INITIAL_CSS_GZIP_BYTES} bytes.`,
  );
}

const validateBarcodeEngine = async () => {
  if (!barcodeScannerEnabled) {
    return ["barcode scanning switched off"];
  }

  if (engineJsFiles.length !== 1 || wasmFiles.length !== 1) {
    throw new Error(
      `Public build must emit exactly one lazy barcode engine chunk and one WASM asset (found ${engineJsFiles.length} and ${wasmFiles.length}).`,
    );
  }

  if (initialJsSet.has(engineJsFiles[0])) {
    throw new Error("The barcode engine must stay out of the initial bundle.");
  }

  const engineJsBytes = await assetSize(engineJsFiles[0]);
  const engineJsGzipBytes = await assetGzipSize(engineJsFiles[0]);
  const wasmBytes = await assetSize(wasmFiles[0]);
  const wasmSha256 = createHash("sha256")
    .update(await readFile(path.join(assets, wasmFiles[0])))
    .digest("hex");

  if (engineJsBytes > MAX_BARCODE_ENGINE_JS_BYTES) {
    throw new Error(
      `Barcode engine JavaScript budget exceeded: ${engineJsBytes} > ${MAX_BARCODE_ENGINE_JS_BYTES} bytes.`,
    );
  }

  if (engineJsGzipBytes > MAX_BARCODE_ENGINE_JS_GZIP_BYTES) {
    throw new Error(
      `Barcode engine gzipped JavaScript budget exceeded: ${engineJsGzipBytes} > ${MAX_BARCODE_ENGINE_JS_GZIP_BYTES} bytes.`,
    );
  }

  if (wasmBytes > MAX_BARCODE_ENGINE_WASM_BYTES) {
    throw new Error(
      `Barcode engine WASM budget exceeded: ${wasmBytes} > ${MAX_BARCODE_ENGINE_WASM_BYTES} bytes.`,
    );
  }

  if (wasmSha256 !== ZXING_WASM_SHA256) {
    throw new Error(
      "Self-hosted barcode WASM does not match the bundled ZXing reader build.",
    );
  }

  return [
    `barcode engine JS ${engineJsBytes} bytes / ${engineJsGzipBytes} gzip`,
    `barcode engine WASM ${wasmBytes} bytes`,
  ];
};

const validatePriceReader = async () => {
  if (!priceOcrEnabled) {
    if ((await readdir(path.join(assets, "ocr")).catch(() => [])).length > 0) {
      throw new Error(
        "A build with price tag reading switched off must not ship the price reader files.",
      );
    }

    return ["price tag reading switched off"];
  }

  if (priceReaderJsFiles.length !== 1) {
    throw new Error(
      `Public build must emit exactly one lazy price reader chunk (found ${priceReaderJsFiles.length}).`,
    );
  }

  if (initialJsSet.has(priceReaderJsFiles[0])) {
    throw new Error("The price reader must stay out of the initial bundle.");
  }

  const priceReaderJsBytes = await assetSize(priceReaderJsFiles[0]);
  const priceReaderJsGzipBytes = await assetGzipSize(priceReaderJsFiles[0]);

  if (priceReaderJsBytes > MAX_PRICE_READER_JS_BYTES) {
    throw new Error(
      `Price reader JavaScript budget exceeded: ${priceReaderJsBytes} > ${MAX_PRICE_READER_JS_BYTES} bytes.`,
    );
  }

  if (priceReaderJsGzipBytes > MAX_PRICE_READER_JS_GZIP_BYTES) {
    throw new Error(
      `Price reader gzipped JavaScript budget exceeded: ${priceReaderJsGzipBytes} > ${MAX_PRICE_READER_JS_GZIP_BYTES} bytes.`,
    );
  }

  let priceReaderAssetBytes = 0;

  for (const asset of priceOcrAssets(root)) {
    const emitted = await readFile(path.join(dist, asset.fileName)).catch(() => null);

    if (emitted === null) {
      throw new Error(`Self-hosted price reader file ${asset.fileName} is missing.`);
    }

    if (emitted.byteLength > asset.maxBytes) {
      throw new Error(
        `Price reader file ${asset.fileName} is over budget: ${emitted.byteLength} > ${asset.maxBytes} bytes.`,
      );
    }

    if (!emitted.equals(await readFile(asset.source))) {
      throw new Error(
        `Self-hosted price reader file ${asset.fileName} does not match its pinned package.`,
      );
    }

    priceReaderAssetBytes += emitted.byteLength;
  }

  if (priceReaderAssetBytes > MAX_PRICE_READER_ASSET_BYTES) {
    throw new Error(
      `Price reader files are over budget: ${priceReaderAssetBytes} > ${MAX_PRICE_READER_ASSET_BYTES} bytes.`,
    );
  }

  return [
    `price reader JS ${priceReaderJsBytes} bytes / ${priceReaderJsGzipBytes} gzip`,
    `price reader files ${priceReaderAssetBytes} bytes`,
  ];
};

const barcodeEngineSummary = await validateBarcodeEngine();
const priceReaderSummary = await validatePriceReader();

const serviceWorker = await readFile(path.join(dist, "sw.js"), "utf8");

if (!serviceWorker.includes('url:"index.html"')) {
  throw new Error("The service worker precache manifest has an unexpected format.");
}

if (serviceWorker.includes('url:"assets/ocr/')) {
  throw new Error("The price reader files must not be precached for every visitor.");
}

if (serviceWorker.includes('url:"screenshots/')) {
  throw new Error("The install screenshots must not be precached for every visitor.");
}

for (const file of initialJsFiles) {
  const fileContent = await readFile(path.join(assets, file), "utf8");

  if (fileContent.includes("zxing_reader")) {
    throw new Error(`Initial bundle ${file} includes the barcode engine.`);
  }

  if (fileContent.includes("tessedit_char_whitelist")) {
    throw new Error(`Initial bundle ${file} includes the price reader.`);
  }
}

for (const file of jsFiles) {
  const fileContent = await readFile(path.join(assets, file), "utf8");

  for (const marker of forbiddenMarkers) {
    if (fileContent.includes(marker)) {
      throw new Error(
        `Public bundle leaked guarded evidence code marker "${marker}" in ${file}.`,
      );
    }
  }
}

console.log(
  `Public build validated: ${[
    `initial JS ${initialJsBytes} bytes / ${initialJsGzipBytes} gzip`,
    `total JS ${totalJsBytes} bytes / ${totalJsGzipBytes} gzip`,
    `largest JS chunk ${largestJsChunkBytes} bytes`,
    `lazy JS ${lazyJsFiles.length} chunk(s) / ${lazyJsBytes} bytes`,
    ...barcodeEngineSummary,
    ...priceReaderSummary,
    `initial CSS ${initialCssBytes} bytes / ${initialCssGzipBytes} gzip`,
    `total CSS ${totalCssBytes} bytes / ${totalCssGzipBytes} gzip`,
    "installable offline shell present",
    "no guarded evidence markers",
  ].join("; ")}.`,
);
