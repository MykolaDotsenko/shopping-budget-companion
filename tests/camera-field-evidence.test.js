import { describe, expect, it } from "vitest";

import {
  BARCODE_SCENARIOS,
  OCR_SCENARIOS,
  VISUAL_SCENARIOS,
  parseCameraFieldEvidence,
  summarizeCameraFieldEvidence,
} from "../scripts/camera-field-evidence.mjs";

const privacy = {
  networkTransmission: false,
  containsImages: false,
  containsProductNames: false,
  containsPrices: false,
  containsStoreNames: false,
  containsParticipantIdentity: false,
};

const barcode = (overrides = {}) => ({
  capability: "barcode",
  scenario: "B-ORDINARY",
  conditions: ["normal"],
  engine: "native",
  runtimeState: "warm",
  decisionLatencyMs: 700,
  outcome: "correct",
  manualFallbackUsed: false,
  correctionOrRejection: false,
  preference: "feature",
  ...overrides,
});

const visual = (overrides = {}) => ({
  capability: "visual",
  scenario: "V-PRODUCE",
  conditions: ["normal"],
  engine: "webgpu",
  runtimeState: "warm",
  candidateListLatencyMs: 850,
  decisionLatencyMs: 1200,
  correctRank: 1,
  outcome: "accepted-correct",
  manualFallbackUsed: false,
  preference: "feature",
  confusionClass: null,
  ...overrides,
});

const ocr = (overrides = {}) => ({
  capability: "ocr",
  scenario: "O-COMMA",
  conditions: ["normal"],
  runtimeState: "warm",
  decisionLatencyMs: 1100,
  correctCandidateRank: 1,
  outcome: "accepted-correct",
  manualFallbackUsed: false,
  correctionOrRejection: false,
  preference: "feature",
  cognitiveEffort: "low",
  ...overrides,
});

const report = (overrides = {}) => ({
  schemaVersion: 1,
  evidenceId: "FIELD-001",
  buildRevision: "a".repeat(40),
  capturedAt: "2026-10-01T12:00:00.000Z",
  privacy,
  device: {
    platform: "android",
    model: "Pixel 8",
    osVersion: "17",
    browser: "chromium",
    browserVersion: "140",
    network: "wifi",
  },
  observations: [barcode(), visual(), ocr()],
  ...overrides,
});

describe("camera field evidence", () => {
  it("accepts a privacy-safe representative field report", () => {
    expect(parseCameraFieldEvidence(report())).not.toBeNull();
  });

  it("rejects hidden/free-text fields so product or store data cannot drift into evidence", () => {
    const candidate = report({
      observations: [{ ...barcode(), productName: "Milk" }],
    });
    expect(parseCameraFieldEvidence(candidate)).toBeNull();
  });

  it("rejects invalid platform/browser pairs", () => {
    expect(
      parseCameraFieldEvidence(
        report({
          device: {
            platform: "ios",
            model: "iPhone",
            osVersion: "20",
            browser: "chromium",
            browserVersion: "140",
            network: "wifi",
          },
        }),
      ),
    ).toBeNull();
  });

  it("keeps runtime failures as explicit field evidence", () => {
    const candidate = report({
      observations: [
        barcode({
          scenario: "B-LOWLIGHT",
          outcome: "runtime-error",
          manualFallbackUsed: true,
        }),
        visual({
          scenario: "V-GLARE",
          outcome: "runtime-error",
          correctRank: null,
          manualFallbackUsed: true,
        }),
        ocr({
          scenario: "O-GLARE",
          outcome: "runtime-error",
          correctCandidateRank: null,
          manualFallbackUsed: true,
          correctionOrRejection: true,
        }),
      ],
    });

    const parsed = parseCameraFieldEvidence(candidate);
    expect(parsed).not.toBeNull();

    const summary = summarizeCameraFieldEvidence([candidate]);
    expect(summary.barcode.failuresOrTimeouts).toBe(1);
    expect(summary.visual.runtimeErrors).toBe(1);
    expect(summary.ocr.runtimeErrors).toBe(1);
  });

  it("rejects a report whose privacy declaration is weakened", () => {
    expect(
      parseCameraFieldEvidence(
        report({
          privacy: { ...privacy, containsImages: true },
        }),
      ),
    ).toBeNull();
  });

  it("reports metrics without auto-deciding KEEP/REMEDIATE/DISABLE", () => {
    const summary = summarizeCameraFieldEvidence([
      report({
        observations: [
          barcode(),
          barcode({
            scenario: "B-SMALL",
            outcome: "wrong",
            correctionOrRejection: true,
            manualFallbackUsed: true,
            preference: "manual",
            decisionLatencyMs: 1500,
          }),
          visual(),
          visual({
            scenario: "V-SIMILAR",
            correctRank: 3,
            outcome: "rejected",
            manualFallbackUsed: true,
            confusionClass: "V-SIMILAR",
          }),
          ocr(),
          ocr({
            scenario: "O-UNIT",
            correctCandidateRank: null,
            outcome: "no-result",
            manualFallbackUsed: true,
            correctionOrRejection: true,
            cognitiveEffort: "high",
          }),
        ],
      }),
    ]);

    expect(summary.barcode.successRate).toBe(0.5);
    expect(summary.barcode.wrongReads).toBe(1);
    expect(summary.visual.top1Accuracy).toBe(0.5);
    expect(summary.visual.top3Accuracy).toBe(1);
    expect(summary.ocr.top1CandidateRate).toBe(0.5);
    expect(summary.ocr.missingCandidateRate).toBe(0.5);
    expect(summary).not.toHaveProperty("verdict");
  });

  it("refuses duplicate evidence IDs", () => {
    expect(() =>
      summarizeCameraFieldEvidence([report(), report()]),
    ).toThrow(/IDs must be unique/);
  });

  it("does not mark coverage complete when scenarios exist on only one device class", () => {
    const allAndroid = report({
      observations: [
        ...BARCODE_SCENARIOS.map((scenario) => barcode({ scenario })),
        ...VISUAL_SCENARIOS.map((scenario) => visual({ scenario })),
        ...OCR_SCENARIOS.map((scenario) => ocr({ scenario })),
      ],
    });
    const minimalIphone = report({
      evidenceId: "FIELD-002",
      device: {
        platform: "ios",
        model: "iPhone",
        osVersion: "20",
        browser: "safari",
        browserVersion: "20",
        network: "wifi",
      },
      observations: [barcode(), visual(), ocr()],
    });

    const summary = summarizeCameraFieldEvidence([allAndroid, minimalIphone]);

    expect(summary.readiness.barcodeScenarios.android.complete).toBe(true);
    expect(summary.readiness.barcodeScenarios.ios.complete).toBe(false);
    expect(summary.readiness.visualScenarios.ios.complete).toBe(false);
    expect(summary.readiness.ocrScenarios.ios.complete).toBe(false);
    expect(summary.readiness.complete).toBe(false);
  });

  it("flags mixed build revisions instead of silently treating them as one baseline", () => {
    const summary = summarizeCameraFieldEvidence([
      report(),
      report({
        evidenceId: "FIELD-002",
        buildRevision: "b".repeat(40),
      }),
    ]);

    expect(summary.readiness.sameBuildRevision).toBe(false);
    expect(summary.readiness.complete).toBe(false);
  });

  it("marks the issue-88 coverage contract complete only when every path and scenario is represented", () => {
    const barcodeObservations = BARCODE_SCENARIOS.map((scenario, index) =>
      barcode({
        scenario,
        engine: index === 0 ? "native" : "fallback",
        runtimeState: index === 0 ? "cold" : "warm",
      }),
    );
    const visualObservations = VISUAL_SCENARIOS.map((scenario, index) =>
      visual({
        scenario,
        engine: index === 0 ? "webgpu" : "wasm",
        runtimeState: index === 0 ? "cold" : "warm",
      }),
    );
    const ocrObservations = OCR_SCENARIOS.map((scenario, index) =>
      ocr({
        scenario,
        runtimeState: index === 0 ? "cold" : "warm",
      }),
    );

    const android = report({
      observations: [
        ...barcodeObservations,
        ...visualObservations,
        ...ocrObservations,
      ],
    });
    const iphone = report({
      evidenceId: "FIELD-002",
      device: {
        platform: "ios",
        model: "iPhone",
        osVersion: "20",
        browser: "safari",
        browserVersion: "20",
        network: "wifi",
      },
      observations: [
        ...barcodeObservations,
        ...visualObservations,
        ...ocrObservations,
      ],
    });

    const summary = summarizeCameraFieldEvidence([android, iphone]);

    expect(summary.readiness.barcodeScenarios.android.complete).toBe(true);
    expect(summary.readiness.barcodeScenarios.ios.complete).toBe(true);
    expect(summary.readiness.visualScenarios.android.complete).toBe(true);
    expect(summary.readiness.visualScenarios.ios.complete).toBe(true);
    expect(summary.readiness.ocrScenarios.android.complete).toBe(true);
    expect(summary.readiness.ocrScenarios.ios.complete).toBe(true);
    expect(summary.readiness.complete).toBe(true);
  });
});
