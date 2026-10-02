# Real-Store Camera Validation

## Status

**PLANNED / GATED field-evidence protocol for issue #88.**

Barcode identification, Product visual recognition and price-tag OCR are already shipped behind independent build kill switches. Automated tests prove software contracts; this protocol exists for evidence that automation cannot establish: real cameras, real packaging, store lighting, device performance and actual human fallback behaviour.

Completed participant or store logs must not be committed to this public repository.

## Decision unit

Evaluate each capability separately:

- barcode;
- Product visual recognition;
- price-tag OCR.

For each, the final human decision is exactly one of:

- **KEEP**
- **REMEDIATE**
- **DISABLE**

One capability may be disabled without weakening manual price entry or the other camera modes.

## Fixed production identity

Before a field session record:

- production URL;
- release tag when available;
- exact source SHA;
- device and browser;
- OS version;
- whether the run is cold or warm.

Do not mix materially different source SHAs in one summary without separating their evidence.

## Privacy rules

The field log is operational evidence, not shopping data.

Do not record:

- photos or video;
- product names or brands;
- barcode values;
- actual shelf prices;
- store names;
- shopping lists;
- budgets;
- app local-storage contents;
- participant names or contact details.

Use scenario codes and outcome categories only. Example: B-CURVED-03, not a product name.

## Devices and runtime paths

At minimum cover:

1. representative Android with current Chromium;
2. representative iPhone with current Safari/WebKit;
3. barcode native detector where the device exposes the required retail formats;
4. barcode WASM fallback;
5. visual WebGPU where available;
6. visual WASM fallback;
7. cold and warm OCR;
8. cold and warm visual recognition.

If a runtime path is genuinely unavailable on the selected device, record **not available** rather than pretending it was tested.

## Measurement boundaries

### Barcode

Start:

> camera preview is ready and the tester intentionally places the barcode inside the scan frame.

Stop:

> the tester accepts or rejects the identity result, or deliberately chooses manual fallback.

Record read success, wrong read, timeout or no result, correction or rejection, and fallback.

### Product visual recognition

Start:

> tester intentionally activates capture with the target framed.

Stop:

> tester chooses a candidate, chooses None of these, or deliberately falls back to manual entry.

Record top-1 correctness, whether the correct option appears in top 3, cold or warm runtime and confusion category.

### Price-tag OCR

Start:

> tester intentionally activates price-tag capture with the label framed.

Stop:

> tester chooses a candidate, rejects all candidates, or deliberately falls back to manual entry.

Record correct candidate rank, wrong or missing candidate, cold or warm runtime and fallback.

Human-decision time may be measured with a stopwatch or timestamped field tool. Do not infer it from Playwright duration.

## Coverage matrix

Before a final decision, exercise every relevant scenario at least once on both device classes and repeat material failures enough to determine whether they reproduce.

### Barcode scenarios

| Code | Scenario |
| --- | --- |
| B-ORDINARY | ordinary EAN or UPC |
| B-SMALL | small printed code |
| B-CURVED | curved package |
| B-GLOSS | glossy or reflection-prone package |
| B-LOWLIGHT | poor lighting |
| B-STORE | store-printed code |
| B-WRONG | wrong or ambiguous read challenge |
| B-FALLBACK | deliberate manual fallback |

### Product scenarios

| Code | Scenario |
| --- | --- |
| V-PRODUCE | loose produce |
| V-RECENT | label already represented in personal recent labels |
| V-SAME-SIZE | same brand, different size challenge |
| V-SAME-FLAVOUR | same brand, different flavour challenge |
| V-SIMILAR | visually similar packaging |
| V-GLARE | glare |
| V-ANGLE | oblique angle |
| V-OCCLUDED | partial occlusion |
| V-CLUTTER | multiple nearby products |

### OCR scenarios

| Code | Scenario |
| --- | --- |
| O-COMMA | comma decimal |
| O-DOT | dot decimal |
| O-SUPER | split or superscript cents |
| O-MEMBER | regular plus member or loyalty prices |
| O-UNIT | unit price present |
| O-DISCOUNT | discounted plus regular price |
| O-MULTIBUY | multi-buy |
| O-PERCENT | percentage discount distractor |
| O-DATE | offer-date distractor |
| O-NUMERIC | weight, EAN or other numeric distractors |
| O-NONE | no valid price |
| O-GLARE | glare, blur or poor-angle challenge |

## Private facilitator log template

Copy this table into a private field document. Do not commit completed rows.

| Attempt | Capability | Scenario | Device/browser | Engine/path | Cold/warm | Human decision ms | Result | Rank/top-3 | Manual fallback | Correction/rejection | Notes code |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| 001 | barcode | B-CURVED | Android/Chrome | native or fallback | warm |  | success or wrong or no-result | n/a | yes or no | yes or no | short non-content code |

Allowed Result values should stay capability-specific and mechanical:

- barcode: correct, wrong, no-read, timeout, runtime-error;
- Product: accepted-correct, accepted-wrong, rejected, no-result, timeout, runtime-error;
- OCR: accepted-correct, accepted-wrong, rejected, no-result, timeout, runtime-error.

Correct candidate rank remains a separate numeric field for Product and OCR, so top-1/top-3 analysis is derived from the evidence rather than encoded ambiguously into the result label.

Do not invent calibrated confidence percentages from model scores.

## Session checklist

Before each session:

- [ ] exact production source SHA recorded;
- [ ] camera permissions reset or known;
- [ ] device, browser and OS recorded;
- [ ] network state appropriate for the path being tested;
- [ ] cold or warm state identified;
- [ ] manual price entry verified available.

After each session:

- [ ] no photos or shopping content retained in the log;
- [ ] wrong results preserved rather than discarded;
- [ ] fallback and correction recorded;
- [ ] notable confusion expressed only as a scenario or error code;
- [ ] blocking crash, data-loss or trust issue escalated immediately.

## Capability summary

For each capability summarize mechanically:

- attempts;
- successful or correct outcomes;
- wrong outcomes;
- missing or no-result outcomes;
- runtime failures;
- manual fallbacks;
- corrections or rejections;
- median human-decision time if the sample is comparable;
- cold versus warm behaviour;
- device or runtime-path differences;
- repeated confusion scenarios.

Do not merge unlike timing boundaries into one latency number.

## Decision record

### Barcode

Decision: **KEEP / REMEDIATE / DISABLE**

Evidence:
- device and runtime coverage:
- repeated strengths:
- repeated failures:
- fallback quality:
- trust or safety concern:
- rationale:

### Product visual recognition

Decision: **KEEP / REMEDIATE / DISABLE**

Evidence:
- WebGPU and WASM coverage:
- top-1 and top-3 pattern:
- repeated confusion classes:
- cold and warm cost:
- fallback quality:
- rationale:

If SKU or package confusion is material, the already-preferred remediation hypothesis is bounded reference-image embedding retrieval. Do not add an arbitrary confidence threshold without field calibration.

### Price-tag OCR

Decision: **KEEP / REMEDIATE / DISABLE**

Evidence:
- label and scenario coverage:
- correct-candidate rank pattern:
- wrong or missing pattern:
- cold and warm cost:
- fallback quality:
- rationale:

## Non-negotiable boundaries

Whatever the decision:

- barcode and Product mode never provide authoritative current shelf price;
- OCR text remains untrusted transient input;
- explicit human confirmation precedes ShoppingTrip mutation;
- camera images remain transient;
- runtime or network failure never blocks manual entry;
- build kill switches remain available until field evidence is mature.

Automated fixtures, a green CI matrix or a single successful store demo cannot close issue #88.

## Structured local evidence analyzer

The repository includes a local-only analyzer so the private facilitator log can be validated and summarized without adding production telemetry.

Create a local evidence skeleton:

```bash
mkdir -p .field-evidence
npm run field:report -- --template > .field-evidence/field-001.json
```

The `.field-evidence/` directory is ignored by Git. Do not force-add completed reports.

Validate and aggregate one decision cycle:

```bash
npm run field:report -- \
  .field-evidence/android-001.json \
  .field-evidence/iphone-001.json \
  > .field-evidence/camera-field-summary.json
```

The machine-readable contract intentionally contains no images, product names, barcode values, prices, store names or participant identity. Unknown observation fields and weakened privacy declarations are rejected rather than silently retained.

The analyzer verifies:

- one exact 40-character build revision per decision cycle;
- Android/Chromium and iPhone/Safari evidence;
- native and fallback barcode paths;
- WebGPU and WASM Product paths;
- cold and warm Product/OCR paths;
- every required barcode, Product and OCR scenario separately on both device classes;
- unique evidence IDs;
- bounded mechanical outcome categories.

It summarizes success/correctness, top-1/top-3 candidate placement, fallback/correction rates, latency medians, preference counts and cognitive-effort counts. It never emits an automatic KEEP / REMEDIATE / DISABLE verdict.

A complete analyzer coverage result means only that the evidence matrix was exercised. It does not mean a capability passed field validation. The final capability decisions remain human and must use the decision records above.
