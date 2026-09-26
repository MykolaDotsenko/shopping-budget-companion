const MAX_FRAMES = 600;

const focusHeading = (
  selector: string,
  framesLeft: number,
  first: boolean,
): void => {
  const heading = document.querySelector<HTMLElement>(selector);

  if (heading !== null) {
    const focused = document.activeElement;

    if (first || focused === null || focused === document.body) {
      heading.focus();
    }

    return;
  }

  if (framesLeft > 0) {
    window.requestAnimationFrame(() => {
      focusHeading(selector, framesLeft - 1, false);
    });
  }
};

export const focusNextScreen = (headingId?: string): void => {
  const selector =
    headingId === undefined ? "main h1[tabindex]" : `h1[id="${headingId}"][tabindex]`;

  queueMicrotask(() => {
    focusHeading(selector, MAX_FRAMES, true);
  });
};
