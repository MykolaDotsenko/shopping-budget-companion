import { readFile, writeFile } from "node:fs/promises";

const FULL_SHA = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const VERSION =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

const requiredArtifact = (artifacts, name) => {
  const matches = artifacts.filter((artifact) => artifact?.name === name);

  if (matches.length !== 1) {
    throw new Error(
      "Release source must expose exactly one artifact named " +
        name +
        "; found " +
        matches.length +
        ".",
    );
  }

  const artifact = matches[0];

  if (artifact.expired !== false) {
    throw new Error(
      "Release artifact " + name + " must be explicitly present and unexpired.",
    );
  }

  if (!Number.isSafeInteger(artifact.id) || artifact.id <= 0) {
    throw new Error(
      "Release artifact " + name + " has no valid immutable artifact ID.",
    );
  }

  if (typeof artifact.digest !== "string" || !DIGEST.test(artifact.digest)) {
    throw new Error(
      "Release artifact " + name + " has no valid SHA-256 artifact digest.",
    );
  }

  return artifact;
};

export const validateReleaseContract = ({
  version,
  sourceSha,
  qualityRunId,
  mainSha,
  packageManifest,
  qualityRun,
  artifacts,
}) => {
  const versionMatch = typeof version === "string" ? VERSION.exec(version) : null;
  if (versionMatch === null) {
    throw new Error(
      "version must be canonical SemVer without a leading v or build metadata.",
    );
  }

  const prerelease = versionMatch[4];
  if (
    prerelease !== undefined &&
    prerelease
      .split(".")
      .some(
        (identifier) =>
          /^[0-9]+$/.test(identifier) &&
          identifier.length > 1 &&
          identifier.startsWith("0"),
      )
  ) {
    throw new Error(
      "numeric SemVer prerelease identifiers must not contain leading zeroes.",
    );
  }

  if (typeof sourceSha !== "string" || !FULL_SHA.test(sourceSha)) {
    throw new Error("source_sha must be a lowercase full 40-character Git SHA.");
  }

  if (typeof mainSha !== "string" || !FULL_SHA.test(mainSha)) {
    throw new Error("main SHA must be a lowercase full 40-character Git SHA.");
  }

  if (sourceSha !== mainSha) {
    throw new Error(
      "Release source " + sourceSha + " is not the current main head " + mainSha + ".",
    );
  }

  const runId = String(qualityRunId ?? "");
  if (!POSITIVE_INTEGER.test(runId)) {
    throw new Error("quality_run_id must be a positive integer.");
  }

  if (packageManifest?.version !== version) {
    throw new Error(
      "package.json version " +
        String(packageManifest?.version) +
        " does not match requested release " +
        version +
        ".",
    );
  }

  const expectedRunId = Number(runId);
  if (!Number.isSafeInteger(expectedRunId)) {
    throw new Error("quality_run_id must be a safe positive integer.");
  }

  if (
    qualityRun?.id !== expectedRunId ||
    qualityRun?.name !== "Quality" ||
    qualityRun?.event !== "push" ||
    qualityRun?.head_branch !== "main" ||
    qualityRun?.head_sha !== sourceSha ||
    qualityRun?.status !== "completed" ||
    qualityRun?.conclusion !== "success"
  ) {
    throw new Error(
      "Selected Quality run is not a completed successful push-to-main run for the exact release source SHA.",
    );
  }

  if (!Array.isArray(artifacts)) {
    throw new Error("Quality-run artifacts payload is not an array.");
  }

  const pagesSite = requiredArtifact(artifacts, "pages-site");
  const sbomName = "sbom-" + sourceSha;
  const sbom = requiredArtifact(artifacts, sbomName);
  const androidName = "android-apk-" + sourceSha;
  const androidApk = requiredArtifact(artifacts, androidName);

  return Object.freeze({
    schemaVersion: 2,
    product: "shopping-budget-companion",
    version,
    tag: "v" + version,
    prerelease: prerelease !== undefined,
    sourceSha,
    qualityRunId: expectedRunId,
    pagesSite: Object.freeze({
      artifactId: pagesSite.id,
      digest: pagesSite.digest,
    }),
    sbom: Object.freeze({
      artifactId: sbom.id,
      digest: sbom.digest,
      name: sbom.name,
    }),
    androidApk: Object.freeze({
      artifactId: androidApk.id,
      digest: androidApk.digest,
      name: androidApk.name,
    }),
  });
};

const runningAsCli =
  process.argv[1]?.endsWith("validate-release-contract.mjs") ?? false;

if (runningAsCli) {
  const [runPath, artifactsPath, packagePath, outputPath] = process.argv.slice(2);

  if (!runPath || !artifactsPath || !packagePath || !outputPath) {
    throw new Error(
      "Usage: validate-release-contract.mjs <run.json> <artifacts.json> <package.json> <output.json>",
    );
  }

  const [qualityRun, artifactEnvelope, packageManifest] = await Promise.all([
    readFile(runPath, "utf8").then(JSON.parse),
    readFile(artifactsPath, "utf8").then(JSON.parse),
    readFile(packagePath, "utf8").then(JSON.parse),
  ]);

  const manifest = validateReleaseContract({
    version: process.env.RELEASE_VERSION,
    sourceSha: process.env.SOURCE_SHA,
    qualityRunId: process.env.QUALITY_RUN_ID,
    mainSha: process.env.MAIN_SHA,
    packageManifest,
    qualityRun,
    artifacts: artifactEnvelope.artifacts,
  });

  await writeFile(
    outputPath,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  console.log(
    "Release contract validated for " +
      manifest.tag +
      " at " +
      manifest.sourceSha +
      ".",
  );
}
