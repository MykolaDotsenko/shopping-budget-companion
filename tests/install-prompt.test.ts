import { describe, expect, it, vi } from "vitest";

import {
  isInstalledApp,
  isIosSafari,
  listenForInstallPrompt,
} from "../src/infrastructure/runtime/install-prompt";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1";
const IPHONE_IN_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 380.0.0.0";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";

const promptEvent = (prompt: () => Promise<unknown>) =>
  Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt });

describe("install prompt", () => {
  it("holds back the browser's own prompt and offers it once", async () => {
    const target = new EventTarget() as unknown as Window;
    const source = listenForInstallPrompt(target);
    const listener = vi.fn();
    source.subscribe(listener);
    const prompt = vi.fn(() => Promise.resolve());
    const event = promptEvent(prompt);

    expect(source.current()).toBeNull();

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const offered = source.current();
    expect(offered).not.toBeNull();
    expect(source.current()).toBe(offered);

    offered?.install();

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(source.current()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    await Promise.resolve();
  });

  it("forgets the prompt once the app is installed and stops notifying after unsubscribe", () => {
    const target = new EventTarget() as unknown as Window;
    const source = listenForInstallPrompt(target);
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    target.dispatchEvent(promptEvent(() => Promise.resolve()));
    target.dispatchEvent(new Event("appinstalled"));

    expect(source.current()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    target.dispatchEvent(promptEvent(() => Promise.resolve()));

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("survives a prompt that throws or rejects", async () => {
    const target = new EventTarget() as unknown as Window;
    const source = listenForInstallPrompt(target);

    target.dispatchEvent(
      promptEvent(() => {
        throw new Error("not allowed");
      }),
    );
    expect(() => source.current()?.install()).not.toThrow();

    target.dispatchEvent(promptEvent(() => Promise.reject(new Error("dismissed"))));
    expect(() => source.current()?.install()).not.toThrow();
    await Promise.resolve();
  });

  it("does nothing without a window", () => {
    const source = listenForInstallPrompt(undefined);

    expect(source.current()).toBeNull();
    expect(isInstalledApp(undefined)).toBe(false);
  });

  it("recognises an app opened from the home screen", () => {
    const standalone = {
      matchMedia: () => ({ matches: true }),
      navigator: {},
    } as unknown as Window;
    const iosHomeScreen = {
      navigator: { standalone: true },
    } as unknown as Window;
    const browserTab = {
      matchMedia: () => ({ matches: false }),
      navigator: {},
    } as unknown as Window;

    expect(isInstalledApp(standalone)).toBe(true);
    expect(isInstalledApp(iosHomeScreen)).toBe(true);
    expect(isInstalledApp(browserTab)).toBe(false);
  });

  it("recognises Safari on iPhone and iPad only", () => {
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
    expect(isIosSafari(IPAD_DESKTOP_SAFARI, 5)).toBe(true);
    expect(isIosSafari(IPAD_DESKTOP_SAFARI, 0)).toBe(false);
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
    expect(isIosSafari(IPHONE_IN_APP, 5)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME, 5)).toBe(false);
  });
});
