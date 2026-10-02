import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CAMERA_FIELD_SCHEMA_VERSION = 1;
export const CAMERA_FIELD_MAX_OBSERVATIONS = 500;

export const BARCODE_SCENARIOS = Object.freeze([
  "B-ORDINARY",
  "B-SMALL",
  "B-CURVED",
  "B-GLOSS",
  "B-LOWLIGHT",
  "B-STORE",
  "B-WRONG",
  "B-FALLBACK",
]);

export const VISUAL_SCENARIOS = Object.freeze([
  "V-PRODUCE",
  "V-RECENT",
  "V-SAME-SIZE",
  "V-SAME-FLAVOUR",
  "V-SIMILAR",
  "V-GLARE",
  "V-ANGLE",
  "V-OCCLUDED",
  "V-CLUTTER",
]);

export const OCR_SCENARIOS = Object.freeze([
  "O-COMMA",
  "O-DOT",
  "O-SUPER",
  "O-MEMBER",
  "O-UNIT",
  "O-DISCOUNT",
  "O-MULTIBUY",
  "O-PERCENT",
  "O-DATE",
  "O-NUMERIC",
  "O-NONE",
  "O-GLARE",
]);

const CONDITIONS = new Set([
  "normal",
  "glare",
  "poor-lighting",
  "small-target",
  "curved-surface",
  "angle",
  "blur",
  "partial-occlusion",
  "clutter",
]);
const PREFERENCES = new Set(["feature", "manual", "neutral", "not-asked"]);
const RUNTIME_STATES = new Set(["cold", "warm"]);
const BUILD_REVISION = /^[0-9a-f]{40}$/;
const EVIDENCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const exactKeys = (value, keys) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNonNegative = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isIsoTimestamp = (value) => {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};
const isShortText = (value, max) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const isConditions = (value) =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= 4 &&
  new Set(value).size === value.length &&
  value.every((item) => CONDITIONS.has(item));

const isPrivacy = (value) =>
  isRecord(value) &&
  exactKeys(value, [
    "networkTransmission",
    "containsImages",
    "containsProductNames",
    "containsPrices",
    "containsStoreNames",
    "containsParticipantIdentity",
  ]) &&
  value.networkTransmission === false &&
  value.containsImages === false &&
  value.containsProductNames === false &&
  value.containsPrices === false &&
  value.containsStoreNames === false &&
  value.containsParticipantIdentity === false;

const isDevice = (value) => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "platform",
      "model",
      "osVersion",
      "browser",
      "browserVersion",
      "network",
    ]) ||
    !isShortText(value.model, 80) ||
    !isShortText(value.osVersion, 32) ||
    !isShortText(value.browserVersion, 32) ||
    !["wifi", "cellular", "offline"].includes(value.network)
  ) {
    return false;
  }

  return (
    (value.platform === "android" && value.browser === "chromium") ||
    (value.platform === "ios" && value.browser === "safari")
  );
};

const isCommonObservation = (value, scenarioSet) =>
  isRecord(value) &&
  scenarioSet.has(value.scenario) &&
  isConditions(value.conditions) &&
  RUNTIME_STATES.has(value.runtimeState) &&
  isFiniteNonNegative(value.decisionLatencyMs) &&
  typeof value.manualFallbackUsed === "boolean" &&
  PREFERENCES.has(value.preference);

const isBarcodeObservation = (value) =>
  isCommonObservation(value, new Set(BARCODE_SCENARIOS)) &&
  exactKeys(value, [
    "capability",
    "scenario",
    "conditions",
    "engine",
    "runtimeState",
    "decisionLatencyMs",
    "outcome",
    "manualFallbackUsed",
    "correctionOrRejection",
    "preference",
  ]) &&
  value.capability === "barcode" &&
  ["native", "fallback"].includes(value.engine) &&
  ["correct", "wrong", "no-read", "timeout"].includes(value.outcome) &&
  typeof value.correctionOrRejection === "boolean";

const isRank = (value, max) =>
  value === null || (Number.isSafeInteger(value) && value >= 1 && value <= max);

const isVisualObservation = (value) =>
  isCommonObservation(value, new Set(VISUAL_SCENARIOS)) &&
  exactKeys(value, [
    "capability",
    "scenario",
    "conditions",
    "engine",
    "runtimeState",
    "candidateListLatencyMs",
    "decisionLatencyMs",
    "correctRank",
    "outcome",
    "manualFallbackUsed",
    "preference",
    "confusionClass",
  ]) &&
  value.capability === "visual" &&
  ["webgpu", "wasm"].includes(value.engine) &&
  isFiniteNonNegative(value.candidateListLatencyMs) &&
  isRank(value.correctRank, 5) &&
  ["accepted-correct", "accepted-wrong", "rejected", "no-result", "timeout"].includes(value.outcome) &&
  (value.confusionClass === null ||
    ["same-brand-size", "same-brand-flavour", "similar-packaging", "produce-lookalike", "other"].includes(value.confusionClass));

const isOcrObservation = (value) =>
  isCommonObservation(value, new Set(OCR_SCENARIOS)) &&
  exactKeys(value, [
    "capability",
    "scenario",
    "conditions",
    "runtimeState",
    "decisionLatencyMs",
    "correctCandidateRank",
    "outcome",
    "manualFallbackUsed",
    "correctionOrRejection",
    "preference",
    "cognitiveEffort",
  ]) &&
  value.capability === "ocr" &&
  isRank(value.correctCandidateRank, 4) &&
  ["accepted-correct", "accepted-wrong", "rejected", "no-result", "timeout"].includes(value.outcome) &&
  typeof value.correctionOrRejection === "boolean" &&
  ["low", "medium", "high", "not-asked"].includes(value.cognitiveEffort);

const isObservation = (value) =>
  isRecord(value) &&
  (isBarcodeObservation(value) || isVisualObservation(value) || isOcrObservation(value));

export const parseCameraFieldEvidence = (value) => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "evidenceId",
      "buildRevision",
      "capturedAt",
      "privacy",
      "device",
      "observations",
    ]) ||
    value.schemaVersion !== CAMERA_FIELD_SCHEMA_VERSION ||
    typeof value.evidenceId !== "string" ||
    !EVIDENCE_ID.test(value.evidenceId) ||
    typeof value.buildRevision !== "string" ||
    !BUILD_REVISION.test(value.buildRevision) ||
    !isIsoTimestamp(value.capturedAt) ||
    !isPrivacy(value.privacy) ||
    !isDevice(value.device) ||
    !Array.isArray(value.observations) ||
    value.observations.length === 0 ||
    value.observations.length > CAMERA_FIELD_MAX_OBSERVATIONS ||
    !value.observations.every(isObservation)
  ) {
    return null;
  }

  return value;
};

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const rate = (numerator, denominator) =>
  denominator === 0 ? null : numerator / denominator;

const scenarioCoverage = (observations, required) => {
  const seen = new Set(observations.map((item) => item.scenario));
  const missing = required.filter((scenario) => !seen.has(scenario));
  return {
    covered: required.length - missing.length,
    required: required.length,
    missing,
    complete: missing.length === 0,
  };
};

const summarizeCapability = (observations, success) => ({
  observations: observations.length,
  successRate: rate(observations.filter(success).length, observations.length),
  manualFallbackRate: rate(
    observations.filter((item) => item.manualFallbackUsed).length,
    observations.length,
  ),
  medianDecisionLatencyMs: median(
    observations.map((item) => item.decisionLatencyMs),
  ),
  preference: {
    feature: observations.filter((item) => item.preference === "feature").length,
    manual: observations.filter((item) => item.preference === "manual").length,
    neutral: observations.filter((item) => item.preference === "neutral").length,
    notAsked: observations.filter((item) => item.preference === "not-asked").length,
  },
});

export const summarizeCameraFieldEvidence = (reports) => {
  const parsed = reports.map(parseCameraFieldEvidence);
  if (parsed.some((report) => report === null)) {
    throw new TypeError("Camera field evidence contains an invalid report.");
  }

  const valid = parsed;
  const evidenceIds = valid.map((report) => report.evidenceId);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new RangeError("Camera field evidence IDs must be unique.");
  }

  const observations = valid.flatMap((report) =>
    report.observations.map((observation) => ({
      ...observation,
      platform: report.device.platform,
    })),
  );
  const barcode = observations.filter((item) => item.capability === "barcode");
  const visual = observations.filter((item) => item.capability === "visual");
  const ocr = observations.filter((item) => item.capability === "ocr");
  const revisions = [...new Set(valid.map((report) => report.buildRevision))].sort();

  const barcodeBase = summarizeCapability(
    barcode,
    (item) => item.outcome === "correct",
  );
  const visualBase = summarizeCapability(
    visual,
    (item) => item.outcome === "accepted-correct",
  );
  const ocrBase = summarizeCapability(
    ocr,
    (item) => item.outcome === "accepted-correct",
  );

  const readiness = {
    sameBuildRevision: revisions.length === 1,
    androidChromium: valid.some(
      (report) =>
        report.device.platform === "android" &&
        report.device.browser === "chromium",
    ),
    iphoneSafari: valid.some(
      (report) =>
        report.device.platform === "ios" &&
        report.device.browser === "safari",
    ),
    barcodeNative: barcode.some((item) => item.engine === "native"),
    barcodeFallback: barcode.some((item) => item.engine === "fallback"),
    visualWebGpu: visual.some((item) => item.engine === "webgpu"),
    visualWasm: visual.some((item) => item.engine === "wasm"),
    visualCold: visual.some((item) => item.runtimeState === "cold"),
    visualWarm: visual.some((item) => item.runtimeState === "warm"),
    ocrCold: ocr.some((item) => item.runtimeState === "cold"),
    ocrWarm: ocr.some((item) => item.runtimeState === "warm"),
    barcodeScenarios: {
      android: scenarioCoverage(
        barcode.filter((item) => item.platform === "android"),
        BARCODE_SCENARIOS,
      ),
      ios: scenarioCoverage(
        barcode.filter((item) => item.platform === "ios"),
        BARCODE_SCENARIOS,
      ),
    },
    visualScenarios: {
      android: scenarioCoverage(
        visual.filter((item) => item.platform === "android"),
        VISUAL_SCENARIOS,
      ),
      ios: scenarioCoverage(
        visual.filter((item) => item.platform === "ios"),
        VISUAL_SCENARIOS,
      ),
    },
    ocrScenarios: {
      android: scenarioCoverage(
        ocr.filter((item) => item.platform === "android"),
        OCR_SCENARIOS,
      ),
      ios: scenarioCoverage(
        ocr.filter((item) => item.platform === "ios"),
        OCR_SCENARIOS,
      ),
    },
  };

  readiness.complete =
    readiness.sameBuildRevision &&
    readiness.androidChromium &&
    readiness.iphoneSafari &&
    readiness.barcodeNative &&
    readiness.barcodeFallback &&
    readiness.visualWebGpu &&
    readiness.visualWasm &&
    readiness.visualCold &&
    readiness.visualWarm &&
    readiness.ocrCold &&
    readiness.ocrWarm &&
    readiness.barcodeScenarios.android.complete &&
    readiness.barcodeScenarios.ios.complete &&
    readiness.visualScenarios.android.complete &&
    readiness.visualScenarios.ios.complete &&
    readiness.ocrScenarios.android.complete &&
    readiness.ocrScenarios.ios.complete;

  return {
    schemaVersion: CAMERA_FIELD_SCHEMA_VERSION,
    reportCount: valid.length,
    buildRevisions: revisions,
    readiness,
    barcode: {
      ...barcodeBase,
      correctReads: barcode.filter((item) => item.outcome === "correct").length,
      wrongReads: barcode.filter((item) => item.outcome === "wrong").length,
      failuresOrTimeouts: barcode.filter(
        (item) => item.outcome === "no-read" || item.outcome === "timeout",
      ).length,
      correctionOrRejectionRate: rate(
        barcode.filter((item) => item.correctionOrRejection).length,
        barcode.length,
      ),
    },
    visual: {
      ...visualBase,
      top1Accuracy: rate(
        visual.filter((item) => item.correctRank === 1).length,
        visual.length,
      ),
      top3Accuracy: rate(
        visual.filter(
          (item) => item.correctRank !== null && item.correctRank <= 3,
        ).length,
        visual.length,
      ),
      medianCandidateListLatencyMs: median(
        visual.map((item) => item.candidateListLatencyMs),
      ),
      wrongAccepts: visual.filter((item) => item.outcome === "accepted-wrong").length,
      rejections: visual.filter((item) => item.outcome === "rejected").length,
    },
    ocr: {
      ...ocrBase,
      top1CandidateRate: rate(
        ocr.filter((item) => item.correctCandidateRank === 1).length,
        ocr.length,
      ),
      top3CandidateRate: rate(
        ocr.filter(
          (item) =>
            item.correctCandidateRank !== null &&
            item.correctCandidateRank <= 3,
        ).length,
        ocr.length,
      ),
      missingCandidateRate: rate(
        ocr.filter(
          (item) =>
            item.correctCandidateRank === null ||
            item.outcome === "no-result" ||
            item.outcome === "timeout",
        ).length,
        ocr.length,
      ),
      correctionOrRejectionRate: rate(
        ocr.filter((item) => item.correctionOrRejection).length,
        ocr.length,
      ),
      cognitiveEffort: {
        low: ocr.filter((item) => item.cognitiveEffort === "low").length,
        medium: ocr.filter((item) => item.cognitiveEffort === "medium").length,
        high: ocr.filter((item) => item.cognitiveEffort === "high").length,
        notAsked: ocr.filter((item) => item.cognitiveEffort === "not-asked").length,
      },
    },
  };
};

export const cameraFieldTemplate = () => ({
  schemaVersion: CAMERA_FIELD_SCHEMA_VERSION,
  evidenceId: "FIELD-001",
  buildRevision: "REPLACE_WITH_40_CHAR_GIT_SHA",
  capturedAt: new Date(0).toISOString(),
  privacy: {
    networkTransmission: false,
    containsImages: false,
    containsProductNames: false,
    containsPrices: false,
    containsStoreNames: false,
    containsParticipantIdentity: false,
  },
  device: {
    platform: "android",
    model: "REPLACE_WITH_DEVICE_MODEL",
    osVersion: "REPLACE_WITH_OS_VERSION",
    browser: "chromium",
    browserVersion: "REPLACE_WITH_BROWSER_VERSION",
    network: "wifi",
  },
  observations: [],
});

const runningAsCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runningAsCli) {
  const args = process.argv.slice(2);

  if (args.length === 1 && args[0] === "--template") {
    console.log(JSON.stringify(cameraFieldTemplate(), null, 2));
  } else if (args.length === 0 || args.includes("--help")) {
    console.log(
      "Usage: node scripts/camera-field-evidence.mjs --template | <evidence.json> [more.json ...]",
    );
  } else {
    try {
      const reports = await Promise.all(
        args.map(async (file) =>
          JSON.parse(await readFile(path.resolve(file), "utf8")),
        ),
      );
      console.log(JSON.stringify(summarizeCameraFieldEvidence(reports), null, 2));
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "Camera field evidence failed.",
      );
      process.exitCode = 1;
    }
  }
}
