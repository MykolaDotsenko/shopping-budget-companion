export const subscribeToStorageChangesFromOtherTabs = (
  onChange: () => void,
): (() => void) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const onStorage = (): void => {
    onChange();
  };
  const onVisible = (): void => {
    if (document.visibilityState === "visible") {
      onChange();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", onStorage);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
  };
};
