export type Translate = (
  source: string,
  values?: Readonly<Record<string, string | number>>,
) => string;

export const englishTranslate: Translate = (source, values = {}) =>
  source.replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
