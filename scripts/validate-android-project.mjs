import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

const [
  packageJsonText,
  viteConfig,
  appGradle,
  manifest,
  activity,
  legacyBackupRules,
  dataExtractionRules,
] = await Promise.all([
    read("package.json"),
    read("vite.config.js"),
    read("android/app/build.gradle"),
    read("android/app/src/main/AndroidManifest.xml"),
    read(
      "android/app/src/main/java/io/github/mykoladotsenko/shoppingbudgetcompanion/MainActivity.java",
    ),
    read("android/app/src/main/res/xml/backup_rules.xml"),
    read("android/app/src/main/res/xml/data_extraction_rules.xml"),
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
  "Android wrapper must keep legacy backup disabled.",
);
requireText(
  manifest,
  /android:fullBackupContent="@xml\/backup_rules"/,
  "Android wrapper must declare explicit Android 11-and-lower backup rules.",
);
requireText(
  manifest,
  /android:dataExtractionRules="@xml\/data_extraction_rules"/,
  "Android wrapper must declare Android 12+ data extraction rules.",
);
for (const domain of [
  "root",
  "file",
  "database",
  "sharedpref",
  "external",
  "device_root",
  "device_file",
  "device_database",
  "device_sharedpref",
]) {
  requireText(
    legacyBackupRules,
    new RegExp(`<exclude\\s+domain="${domain}"\\s+path="\\."\\s*/>`),
    `Legacy Android backup rules must exclude ${domain} data.`,
  );

  const matches = dataExtractionRules.match(
    new RegExp(`<exclude\\s+domain="${domain}"\\s+path="\\."\\s*/>`, "g"),
  );
  if ((matches?.length ?? 0) !== 2) {
    throw new Error(
      `Android 12+ data extraction rules must exclude ${domain} from both cloud backup and device transfer.`,
    );
  }
}
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
