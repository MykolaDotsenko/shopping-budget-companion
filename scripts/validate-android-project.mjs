import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

const [packageJsonText, viteConfig, appGradle, manifest, activity] =
  await Promise.all([
    read("package.json"),
    read("vite.config.js"),
    read("android/app/build.gradle"),
    read("android/app/src/main/AndroidManifest.xml"),
    read(
      "android/app/src/main/java/io/github/mykoladotsenko/shoppingbudgetcompanion/MainActivity.java",
    ),
  ]);

const packageJson = JSON.parse(packageJsonText);

const requireText = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requireText(
  viteConfig,
  /VITE_SHOPPING_ANDROID_WRAPPER/,
  "Vite config must expose the Android-wrapper build boundary.",
);
requireText(
  appGradle,
  /compileSdk\s+36/,
  "Android wrapper must compile against API 36.",
);
requireText(
  appGradle,
  /targetSdk\s+36/,
  "Android wrapper must target API 36.",
);
requireText(
  appGradle,
  /androidx\.webkit:webkit:1\.17\.1/,
  "Android wrapper must keep the pinned stable AndroidX WebKit dependency.",
);
requireText(
  appGradle,
  /new JsonSlurper\(\)\.parse\(file\("\.\.\/\.\.\/package\.json"\)\)/,
  "Android versionName must derive from package.json.",
);
requireText(
  manifest,
  /android\.permission\.CAMERA/,
  "Android wrapper must declare camera permission for optional camera tools.",
);
requireText(
  manifest,
  /android:allowBackup="false"/,
  "Android wrapper must keep local shopping data out of Android backup.",
);
requireText(
  manifest,
  /android:usesCleartextTraffic="false"/,
  "Android wrapper must reject cleartext network traffic.",
);
requireText(
  activity,
  /WebViewAssetLoader/,
  "Android wrapper must load bundled content through WebViewAssetLoader.",
);
requireText(
  activity,
  /setAllowFileAccess\(false\)/,
  "Android wrapper must keep WebView file access disabled.",
);
requireText(
  activity,
  /setMixedContentMode\(WebSettings\.MIXED_CONTENT_NEVER_ALLOW\)/,
  "Android wrapper must reject mixed content.",
);
requireText(
  activity,
  /RESOURCE_VIDEO_CAPTURE/,
  "Android wrapper must explicitly gate WebView camera access.",
);
requireText(
  activity,
  /requestsOnlyVideoCapture/,
  "Android wrapper must not grant future WebView permission types implicitly.",
);

if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
  throw new Error("package.json must expose the Android release version.");
}

console.log(
  `Android wrapper contract validated for Shopping Budget Companion ${packageJson.version}.`,
);
