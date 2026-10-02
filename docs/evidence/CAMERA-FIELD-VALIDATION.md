# Camera Field Validation

## Status

**FIELD EVIDENCE PROTOCOL — issue #88.**

This protocol validates the three shipped camera accelerators on real phones in real stores:

- barcode identification;
- visual product recognition;
- price-tag OCR.

Automated tests cannot close this gate. The analyzer exists to make physical evidence consistent, privacy-safe and auditable; it does not manufacture field evidence or make the product decision automatically.

## Evidence boundary

Field evidence files must contain no:

- camera images;
- product names;
- prices;
- store names;
- participant identity;
- network telemetry.

The JSON contract requires all privacy declarations to remain `false` and rejects unknown observation fields. This prevents a convenient free-text note from silently becoming product/store/participant data.

Device model, OS version and browser version are allowed because camera/browser behaviour is the subject of the study.

## One immutable baseline

Prefer one exact production commit for a decision cycle.

Every evidence file contains a 40-character `buildRevision`. The analyzer reports mixed revisions and refuses to mark the coverage contract complete when more than one revision is present.

If remediation changes camera behaviour, start a new decision cycle on the remediated SHA rather than mixing before/after evidence.

## Create an evidence skeleton

Run:

```bash
npm run field:report -- --template > field-001.json
```

Replace all placeholders before collecting evidence.

Keep completed evidence outside the public repository. Do not commit real-store evidence files.

## Validate and summarize

Run:

```bash
npm run field:report -- field-001.json field-002.json > camera-field-summary.json
```

The command fails on:

- malformed schema;
- weakened privacy declarations;
- unsupported Android/iOS browser pair;
- unknown/free-text observation fields;
- duplicate evidence IDs.

The aggregate summary is safe to retain because it contains only counts, rates, latency summaries, coverage state and build revisions.

## Device minimum

The decision cycle is not coverage-complete until evidence contains:

- Android + Chromium;
- iPhone + Safari;
- native barcode path;
- ZXing fallback path;
- WebGPU visual-recognition path;
- WASM visual-recognition path;
- cold and warm visual-recognition use;
- cold and warm OCR use.

A path that the chosen hardware genuinely cannot expose must not be invented. Use a second representative device if needed.

## Scenario coverage

### Barcode

Required scenarios:

- ordinary EAN/UPC;
- small code;
- curved packaging;
- glossy packaging;
- poor lighting;
- store-printed code;
- ambiguous/wrong scan opportunity;
- manual fallback.

Record for every observation:

- engine: native or fallback;
- cold/warm runtime state;
- scan-to-human-decision latency;
- correct / wrong / no-read / timeout;
- manual fallback;
- correction/rejection;
- preference versus manual entry.

### Visual recognition

Required scenarios:

- loose produce;
- product already represented by Price Memory;
- same brand / different size;
- same brand / different flavour;
- visually similar packaging;
- glare;
- angle;
- partial occlusion;
- clutter.

Record:

- WebGPU or WASM;
- cold/warm runtime;
- capture-to-candidate-list latency;
- capture-to-human-decision latency;
- correct candidate rank when present;
- accepted-correct / accepted-wrong / rejected / no-result / timeout;
- manual fallback;
- preference versus manual entry;
- bounded confusion class, never a product name.

The analyzer reports top-1 and top-3 accuracy. Ranking remains ranking context, not calibrated probability.

### Price-tag OCR

Required scenarios:

- comma decimal;
- dot decimal;
- split/superscript cents;
- regular + member price;
- unit price;
- discounted price;
- multi-buy;
- percentage discount;
- offer dates;
- numeric distractors;
- no-valid-price case;
- glare;
- angle;
- blur;
- poor lighting.

Record:

- cold/warm runtime;
- capture-to-human-decision latency;
- correct candidate rank when present;
- accepted-correct / accepted-wrong / rejected / no-result / timeout;
- manual fallback;
- correction/rejection;
- preference versus manual entry;
- low/medium/high cognitive effort if explicitly observed.

## Analyzer outputs

The aggregate includes:

### Barcode

- success rate;
- correct/wrong reads;
- failures/timeouts;
- manual-fallback rate;
- correction/rejection rate;
- median decision latency;
- preference counts.

### Visual recognition

- accepted-correct rate;
- top-1 accuracy;
- top-3 accuracy;
- wrong accepts;
- rejections;
- manual-fallback rate;
- median candidate-list latency;
- median decision latency;
- preference counts.

### OCR

- accepted-correct rate;
- top-1 candidate rate;
- top-3 candidate rate;
- missing-candidate rate;
- manual-fallback rate;
- correction/rejection rate;
- median decision latency;
- cognitive-effort counts;
- preference counts.

## Human decision record

The analyzer deliberately exposes no automatic verdict.

For each capability, record one human decision after reviewing both quantitative results and observed friction:

- **KEEP**
- **REMEDIATE**
- **DISABLE**

Use this structure:

```text
Capability:
Baseline SHA:
Evidence files / devices:
Coverage complete: yes/no

Decision: KEEP | REMEDIATE | DISABLE

Why:
- quantitative evidence:
- repeated observed friction:
- trust/safety concern:
- manual fallback quality:
- runtime/UX cost:

Follow-up:
- none, or focused remediation issue URL/number
```

Do not convert one successful demo into a KEEP decision. Do not convert one failure into DISABLE unless it exposes a severe reliability/trust problem.

## Closure rule for issue #88

Issue #88 can close only when:

1. Android real-store evidence exists;
2. iPhone real-store evidence exists;
3. the analyzer reports the required path/scenario coverage complete, or a documented hardware limitation explains a deliberately untested path;
4. barcode has an explicit human KEEP/REMEDIATE/DISABLE record;
5. visual recognition has an explicit human KEEP/REMEDIATE/DISABLE record;
6. OCR has an explicit human KEEP/REMEDIATE/DISABLE record;
7. every REMEDIATE decision has a focused implementation issue.

Green CI, synthetic camera files and manually invented JSON do not satisfy this gate.
