import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const source = path.resolve(process.argv[2] ?? "dist-android");
const destination = path.resolve("android/app/src/main/assets/web");
const indexPath = path.join(source, "index.html");

const index = await readFile(indexPath, "utf8");

if (/\b(?:src|href)=["']\/shopping-budget-companion\//.test(index)) {
  throw new Error(
    "Android web payload must use relative asset URLs; build Vite with --base=./.",
  );
}

if (/\b(?:src|href)=["']file:/.test(index)) {
  throw new Error("Android web payload must never depend on file:// URLs.");
}

for (const forbidden of ["qa", "beta", "cohort"]) {
  if (index.includes(`/${forbidden}/`)) {
    throw new Error(
      `Android public payload must not reference guarded ${forbidden} surfaces.`,
    );
  }
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

console.log(`Prepared Android web assets from ${source}.`);
