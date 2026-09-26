import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

import { priceOcrAssetDir, priceOcrAssets } from "./scripts/price-ocr-assets.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const appVersion = JSON.parse(
  readFileSync(path.join(rootDir, "package.json"), "utf8"),
).version;
const priceOcrAssetDirectory = priceOcrAssetDir(rootDir);
const priceOcrFiles = priceOcrAssets(rootDir);

const selfHostedPriceReader = (enabled) => ({
  name: "self-hosted-price-reader",
  configureServer(server) {
    if (!enabled) {
      return;
    }

    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const asset = priceOcrFiles.find((candidate) =>
        pathname.endsWith(`/${candidate.fileName}`),
      );

      if (asset === undefined) {
        next();
        return;
      }

      response.setHeader(
        "Content-Type",
        asset.fileName.endsWith(".wasm")
          ? "application/wasm"
          : asset.fileName.endsWith(".js")
            ? "text/javascript"
            : "application/octet-stream",
      );
      response.end(readFileSync(asset.source));
    });
  },
  generateBundle() {
    if (!enabled) {
      return;
    }

    for (const asset of priceOcrFiles) {
      this.emitFile({
        type: "asset",
        fileName: asset.fileName,
        source: readFileSync(asset.source),
      });
    }
  },
});

export default defineConfig(() => {
  const cohortAnalysisEnabled =
    process.env.VITE_SHOPPING_COHORT_ANALYSIS === "1";
  const evidenceEnabled =
    process.env.VITE_SHOPPING_QA_TIMING === "1" ||
    process.env.VITE_SHOPPING_BETA_EVIDENCE === "1" ||
    cohortAnalysisEnabled;
  const priceOcrBuild =
    !cohortAnalysisEnabled && process.env.VITE_SHOPPING_PRICE_OCR !== "0";

  return {
    define: {
      __SHOPPING_APP_VERSION__: JSON.stringify(appVersion),
      __PRICE_OCR_ASSET_DIR__: JSON.stringify(priceOcrAssetDirectory),
    },
    plugins: [
      react(),
      selfHostedPriceReader(priceOcrBuild),
      VitePWA({
        disable: evidenceEnabled,
        strategies: "generateSW",
        registerType: "prompt",
        injectRegister: "auto",
        includeAssets: [
          "favicon.svg",
          "favicon-32.png",
          "apple-touch-icon.png",
          "pwa-icon-192.png",
          "pwa-icon-512.png",
          "pwa-maskable-512.png",
        ],
        manifest: {
          id: "./",
          name: "Shopping Budget Companion",
          short_name: "Shop Budget",
          description:
            "Set a shopping limit, add prices as you go and always see what’s left before checkout.",
          lang: "en",
          categories: ["shopping", "utilities"],
          start_url: "./",
          scope: "./",
          display: "standalone",
          background_color: "#f4f1eb",
          theme_color: "#f4f1eb",
          icons: [
            {
              src: "pwa-icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "pwa-icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "pwa-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          screenshots: [
            {
              src: "screenshots/trip.jpg",
              sizes: "780x1688",
              type: "image/jpeg",
              form_factor: "narrow",
              label: "See what’s left of your budget while you shop",
            },
            {
              src: "screenshots/entry.jpg",
              sizes: "780x1688",
              type: "image/jpeg",
              form_factor: "narrow",
              label: "Add a price and see what will be left before you add it",
            },
            {
              src: "screenshots/summary.jpg",
              sizes: "780x1688",
              type: "image/jpeg",
              form_factor: "narrow",
              label: "Compare your receipt with your budget when you finish",
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          navigateFallback: "index.html",
          navigateFallbackDenylist: [
            /\/qa(?:\/|$)/,
            /\/beta(?:\/|$)/,
            /\/cohort(?:\/|$)/,
            /\/camera-tools(?:\/|$)/,
            /\/study(?:\/|$)/,
            /\/privacy(?:\/|$)/,
          ],
          globPatterns: [
            "**/*.{js,css,html,svg,png,webmanifest}",
          ],
          globIgnores: ["**/assets/ocr/**"],
          runtimeCaching: [
            {
              urlPattern: ({ sameOrigin, url }) =>
                sameOrigin && url.pathname.includes("/assets/ocr/"),
              handler: "CacheFirst",
              options: {
                cacheName: "price-reader",
                expiration: { maxEntries: 8 },
              },
            },
            {
              urlPattern: ({ sameOrigin, url }) =>
                sameOrigin && url.pathname.endsWith(".wasm"),
              handler: "CacheFirst",
              options: {
                cacheName: "barcode-engine",
                expiration: { maxEntries: 2 },
              },
            },
          ],
        },
      }),
    ],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "react",
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        "#app-entry": path.resolve(
          rootDir,
          cohortAnalysisEnabled
            ? "src/qa/RetentionCohortAnalyzerApp.tsx"
            : "src/App.tsx",
        ),
        "#shopping-evidence": path.resolve(
          rootDir,
          evidenceEnabled
            ? "src/qa/use-shopping-evidence-enabled.tsx"
            : "src/qa/use-shopping-evidence.tsx",
        ),
      },
    },
  };
});
