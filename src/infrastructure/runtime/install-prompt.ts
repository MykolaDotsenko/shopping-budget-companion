interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

export interface InstallPrompt {
  readonly install: () => void;
}

export interface InstallPromptSource {
  readonly current: () => InstallPrompt | null;
  readonly subscribe: (listener: () => void) => () => void;
}

export const listenForInstallPrompt = (
  target: Window | undefined = typeof window === "undefined" ? undefined : window,
): InstallPromptSource => {
  let available: InstallPrompt | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: InstallPrompt | null): void => {
    available = next;

    for (const listener of listeners) {
      listener();
    }
  };

  target?.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    const deferred = event as BeforeInstallPromptEvent;

    publish({
      install: () => {
        publish(null);

        try {
          void Promise.resolve(deferred.prompt()).catch(() => undefined);
        } catch {
          return;
        }
      },
    });
  });
  target?.addEventListener("appinstalled", () => {
    publish(null);
  });

  return {
    current: () => available,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const isInstalledApp = (
  target: Window | undefined = typeof window === "undefined" ? undefined : window,
): boolean =>
  target !== undefined &&
  ((typeof target.matchMedia === "function" &&
    target.matchMedia("(display-mode: standalone)").matches) ||
    (target.navigator as Navigator & { readonly standalone?: boolean })
      .standalone === true);

export const isIosSafari = (userAgent: string, maxTouchPoints: number): boolean =>
  (/iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) &&
  /Version\/[\d.]+.*Safari\//.test(userAgent) &&
  !/CriOS|FxiOS|EdgiOS/.test(userAgent);
