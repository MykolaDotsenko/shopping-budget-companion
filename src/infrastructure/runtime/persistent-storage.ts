export const requestPersistentStorage = async (): Promise<boolean> => {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;

  if (storage === undefined || typeof storage.persist !== "function") {
    return false;
  }

  try {
    if (typeof storage.persisted === "function" && (await storage.persisted())) {
      return true;
    }

    return await storage.persist();
  } catch {
    return false;
  }
};
