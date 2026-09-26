import type { StorageLike } from "./shopping-storage";

export interface StorageRevision {
  remember(): void;
  isCurrent(): boolean;
}

export const createStorageRevision = (
  storage: StorageLike | null | undefined,
  keys: readonly string[],
): StorageRevision => {
  let known: readonly (string | null)[] | null = null;

  const read = (): readonly (string | null)[] | null => {
    if (storage === null || storage === undefined) {
      return null;
    }

    try {
      return keys.map((key) => storage.getItem(key));
    } catch {
      return null;
    }
  };

  return {
    remember(): void {
      known = read();
    },
    isCurrent(): boolean {
      if (known === null) {
        return true;
      }

      const current = read();

      return (
        current === null ||
        current.every((value, index) => value === known?.[index])
      );
    },
  };
};
