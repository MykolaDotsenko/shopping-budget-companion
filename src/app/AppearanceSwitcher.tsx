import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  APPEARANCE_MODES,
  applyAppearanceToDocument,
  persistAppearancePreference,
  readAppearancePreference,
  type AppearanceMode,
} from "./appearance";
import styles from "./AppearanceSwitcher.module.css";

const LABELS: Readonly<Record<AppearanceMode, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  aurora: "Aurora",
};

type NeonIgnition = typeof import("./neon-ignition");

let ignition: Promise<NeonIgnition> | undefined;

const loadIgnition = (): Promise<NeonIgnition> => {
  ignition ??= import("./neon-ignition").catch((error: unknown) => {
    ignition = undefined;
    throw error;
  });

  return ignition;
};

const canIgnite = (): boolean =>
  typeof document.startViewTransition === "function" &&
  typeof window.matchMedia === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function AppearanceSwitcher() {
  const [mode, setMode] = useState<AppearanceMode>(() =>
    readAppearancePreference(),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const latestChoice = useRef(mode);

  useEffect(() => {
    applyAppearanceToDocument(mode);

    if (
      mode !== "system" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemChrome = () => {
      applyAppearanceToDocument("system", document, media.matches);
    };

    media.addEventListener?.("change", syncSystemChrome);

    return () => {
      media.removeEventListener?.("change", syncSystemChrome);
    };
  }, [mode]);

  const apply = (nextMode: AppearanceMode) => {
    setMode(nextMode);
    setSaveFailed(!persistAppearancePreference(nextMode));
    applyAppearanceToDocument(nextMode);
  };

  const choose = (nextMode: AppearanceMode, trigger: HTMLElement) => {
    const previous = latestChoice.current;
    latestChoice.current = nextMode;

    if (nextMode !== "aurora" || previous === "aurora" || !canIgnite()) {
      apply(nextMode);
      return;
    }

    const box = (
      trigger.querySelector('[aria-hidden="true"]') ?? trigger
    ).getBoundingClientRect();
    const commit = () => {
      if (latestChoice.current === "aurora") {
        flushSync(() => {
          apply("aurora");
        });
      }
    };

    loadIgnition().then(
      ({ igniteNeon }) => {
        if (latestChoice.current === "aurora") {
          igniteNeon(
            { x: box.left + box.width / 2, y: box.top + box.height / 2 },
            commit,
          );
        }
      },
      commit,
    );
  };

  return (
    <section className={styles.appearance} aria-labelledby="appearance-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Appearance</p>
          <h2 id="appearance-title">Choose a look</h2>
        </div>
        <span className={styles.current}>{LABELS[mode]}</span>
      </div>

      <div className={styles.options} role="group" aria-label="Appearance theme">
        {APPEARANCE_MODES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={styles.option}
            aria-pressed={mode === candidate}
            data-mode={candidate}
            onPointerDown={() => {
              if (candidate === "aurora" && canIgnite()) {
                loadIgnition().catch(() => undefined);
              }
            }}
            onClick={(event) => {
              choose(candidate, event.currentTarget);
            }}
          >
            <span className={styles.swatch} aria-hidden="true" />
            <span>{LABELS[candidate]}</span>
          </button>
        ))}
      </div>

      {saveFailed ? (
        <p className={styles.saveWarning} role="status">
          Appearance changed for this session but could not be saved.
        </p>
      ) : null}
    </section>
  );
}
