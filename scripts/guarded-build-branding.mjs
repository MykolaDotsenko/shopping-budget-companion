import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const PUBLIC_METADATA = Object.freeze({
  title:
    "<title>Shopping Budget Companion — know what’s left before checkout</title>",
  description:
    'content="Set a shopping limit, add prices as you go and always see what’s left before checkout. No account, no bank connection, works offline once opened."',
  theme: '<meta name="theme-color" content="#f4f1eb" />',
  applicationName:
    '<meta name="application-name" content="Shopping Budget Companion" />',
});

const replaceRequired = (html, from, to, label) => {
  if (!html.includes(from)) {
    throw new Error(
      `Internal build metadata could not find expected ${label}: ${from}`,
    );
  }

  return html.replace(from, to);
};

export const applyGuardedBuildBrandingHtml = (
  original,
  {
    title,
    description,
    applicationName = "Shopping Budget Companion",
    themeColor = "#f4f1eb",
  },
) => {
  let next = original;

  next = replaceRequired(
    next,
    PUBLIC_METADATA.title,
    `<title>${title}</title>`,
    "title",
  );
  next = replaceRequired(
    next,
    PUBLIC_METADATA.description,
    `content="${description}"`,
    "description",
  );
  next = replaceRequired(
    next,
    PUBLIC_METADATA.theme,
    [
      `<meta name="theme-color" content="${themeColor}" />`,
      '<meta name="robots" content="noindex,nofollow,noarchive" />',
    ].join("\n    "),
    "theme metadata",
  );
  next = replaceRequired(
    next,
    PUBLIC_METADATA.applicationName,
    `<meta name="application-name" content="${applicationName}" />`,
    "application name",
  );

  if (
    !next.includes(`<title>${title}</title>`) ||
    !next.includes(`content="${description}"`) ||
    !next.includes('name="robots" content="noindex,nofollow,noarchive"') ||
    !next.includes(`name="application-name" content="${applicationName}"`)
  ) {
    throw new Error("Internal build metadata verification failed");
  }

  return next;
};

export const prepareGuardedBuildBranding = async ({
  target,
  title,
  description,
  applicationName,
  themeColor,
}) => {
  const resolvedTarget = resolve(target);
  const original = await readFile(resolvedTarget, "utf8");
  const next = applyGuardedBuildBrandingHtml(original, {
    title,
    description,
    ...(applicationName === undefined ? {} : { applicationName }),
    ...(themeColor === undefined ? {} : { themeColor }),
  });

  await writeFile(resolvedTarget, next, "utf8");
};
