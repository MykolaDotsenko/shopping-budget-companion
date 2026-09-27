import "./neon-ignition.css";

export interface IgnitionPoint {
  readonly x: number;
  readonly y: number;
}

interface Spark {
  readonly angle: number;
  readonly reach: number;
  readonly length: number;
  readonly width: number;
  readonly color: string;
  readonly delay: number;
  readonly life: number;
}

const PALETTE = ["#8de8ff", "#9d8cff", "#ff8ad8", "#ffffff"] as const;
const SPARK_COUNT = 48;
const REVEAL_MS = 1100;
const BURST_MS = 1400;
const SETTLE_MS = 2000;
const TAU = Math.PI * 2;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

const createSparks = (): readonly Spark[] =>
  Array.from({ length: SPARK_COUNT }, (_, index) => ({
    angle: (index / SPARK_COUNT) * TAU + Math.random() * 0.4,
    reach: 90 + Math.random() * 220,
    length: 14 + Math.random() * 32,
    width: 1.4 + Math.random() * 2.4,
    color: PALETTE[index % PALETTE.length] ?? PALETTE[0],
    delay: Math.random() * 150,
    life: 620 + Math.random() * 500,
  }));

export const igniteNeon = (origin: IgnitionPoint, commit: () => void): void => {
  const root = document.documentElement;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const reach =
    Math.hypot(
      Math.max(origin.x, width - origin.x),
      Math.max(origin.y, height - origin.y),
    ) + 48;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const sparks = createSparks();
  let reveal: Animation | undefined;
  let frame = 0;
  let started = 0;

  canvas.className = "neon-burst";
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.setAttribute("aria-hidden", "true");

  const revealProgress = (elapsed: number): number => {
    const progress = reveal?.effect?.getComputedTiming().progress;

    if (typeof progress === "number") {
      return progress;
    }

    return elapsed >= REVEAL_MS ? 1 : easeOutCubic(elapsed / REVEAL_MS);
  };

  const ring = (
    paint: CanvasRenderingContext2D,
    radius: number,
    lineWidth: number,
    style: string | CanvasGradient,
    alpha: number,
  ): void => {
    if (radius <= 0 || alpha <= 0) {
      return;
    }

    paint.globalAlpha = alpha;
    paint.strokeStyle = style;
    paint.lineWidth = lineWidth;
    paint.beginPath();
    paint.arc(origin.x, origin.y, radius, 0, TAU);
    paint.stroke();
  };

  const drawFlash = (paint: CanvasRenderingContext2D, elapsed: number): void => {
    const t = elapsed / 650;

    if (t >= 1) {
      return;
    }

    const radius = 46 + easeOutCubic(t) * 340;
    const glow = paint.createRadialGradient(
      origin.x,
      origin.y,
      0,
      origin.x,
      origin.y,
      radius,
    );

    glow.addColorStop(0, "rgb(255 255 255 / 1)");
    glow.addColorStop(0.12, "rgb(223 252 255 / 0.9)");
    glow.addColorStop(0.3, "rgb(143 243 255 / 0.52)");
    glow.addColorStop(0.56, "rgb(157 140 255 / 0.28)");
    glow.addColorStop(0.78, "rgb(255 138 216 / 0.13)");
    glow.addColorStop(1, "rgb(157 140 255 / 0)");
    paint.globalAlpha = t < 0.14 ? t / 0.14 : 1 - (t - 0.14) / 0.86;
    paint.fillStyle = glow;
    paint.beginPath();
    paint.arc(origin.x, origin.y, radius, 0, TAU);
    paint.fill();
  };

  const drawRim = (
    paint: CanvasRenderingContext2D,
    progress: number,
    elapsed: number,
  ): void => {
    if (progress >= 1) {
      return;
    }

    const radius = progress * reach;
    const fade = 1 - progress ** 3;
    const spectrum = paint.createConicGradient(elapsed / 260, origin.x, origin.y);

    spectrum.addColorStop(0, "#8de8ff");
    spectrum.addColorStop(0.33, "#9d8cff");
    spectrum.addColorStop(0.66, "#ff8ad8");
    spectrum.addColorStop(1, "#8de8ff");
    ring(paint, radius, 88, "#9d8cff", 0.13 * fade);
    ring(paint, radius, 42, "#8ff3ff", 0.24 * fade);
    ring(paint, radius, 12, spectrum, 0.55 * fade);
    ring(paint, radius, 5, spectrum, fade);
    ring(paint, radius, 1.8, "#ffffff", 0.95 * fade);
    ring(paint, radius * 0.88, 3, "#ff8ad8", 0.52 * fade);
    ring(paint, radius * 0.72, 2.2, "#8ff3ff", 0.34 * fade);
  };

  const drawSparks = (paint: CanvasRenderingContext2D, elapsed: number): void => {
    paint.lineCap = "round";

    for (const spark of sparks) {
      const t = (elapsed - spark.delay) / spark.life;

      if (t <= 0 || t >= 1) {
        continue;
      }

      const head = 12 + easeOutCubic(t) * spark.reach;
      const tail = Math.max(12, head - spark.length * (1 - t * 0.6));
      const cos = Math.cos(spark.angle);
      const sin = Math.sin(spark.angle);
      const alpha = 1 - t * t;

      for (const [lineWidth, strength] of [
        [spark.width * 5.2, 0.12],
        [spark.width * 3.2, 0.28],
        [spark.width, 1],
      ] as const) {
        paint.globalAlpha = alpha * strength;
        paint.strokeStyle = spark.color;
        paint.lineWidth = lineWidth;
        paint.beginPath();
        paint.moveTo(origin.x + cos * tail, origin.y + sin * tail);
        paint.lineTo(origin.x + cos * head, origin.y + sin * head);
        paint.stroke();
      }
    }
  };

  const draw = (now: number): void => {
    if (context === null) {
      return;
    }

    const elapsed = now - started;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    if (elapsed >= BURST_MS) {
      return;
    }

    context.globalCompositeOperation = "lighter";
    drawFlash(context, elapsed);
    drawRim(context, revealProgress(elapsed), elapsed);
    drawSparks(context, elapsed);
    frame = requestAnimationFrame(draw);
  };

  const play = (): void => {
    started = performance.now();
    frame = requestAnimationFrame(draw);
  };

  const finish = (): void => {
    cancelAnimationFrame(frame);
    canvas.remove();
    delete root.dataset.neonIgnition;
  };

  root.dataset.neonIgnition = "";

  const transition = document.startViewTransition(() => {
    commit();
    document.body.append(canvas);
  });

  transition.ready.then(
    () => {
      reveal = root.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${reach}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        {
          duration: REVEAL_MS,
          easing: "cubic-bezier(0.45, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
      play();
    },
    play,
  );
  window.setTimeout(finish, SETTLE_MS);
};
