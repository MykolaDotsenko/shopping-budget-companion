import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;
const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9]\d*$/;

export const releaseTag = (version) => `v${version}`;

export const validateReleaseContract = ({
  version,
  sourceSha,
  qualityRunId,
  packageVersion,
}) => {
  if (!RELEASE_VERSION.test(version)) {
    throw new Error(
      `Release version must be an exact stable semver (x.y.z), received "${version}".`,
    );
  }

  if (!FULL_GIT_SHA.test(sourceSha)) {
    throw new Error(
      "Release source_sha must be a lowercase 40-character Git SHA.",
    );
  }

  if (!RUN_ID.test(qualityRunId)) {
    throw new Error("Release quality_run_id must be a positive integer.");
  }

  if (packageVersion !== version) {
    throw new Error(
      `package.json version ${packageVersion} does not match requested release ${version}.`,
    );
  }

  return {
    version,
    tag: releaseTag(version),
    sourceSha,
    qualityRunId,
  };
};

const runningAsCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runningAsCli) {
  try {
    const packageManifest = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8"),
    );
    const contract = validateReleaseContract({
      version: process.env.RELEASE_VERSION ?? "",
      sourceSha: process.env.SOURCE_SHA ?? "",
      qualityRunId: process.env.QUALITY_RUN_ID ?? "",
      packageVersion: packageManifest.version,
    });

    process.stdout.write(`${JSON.stringify(contract)}\n`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Release contract validation failed.",
    );
    process.exitCode = 1;
  }
}
