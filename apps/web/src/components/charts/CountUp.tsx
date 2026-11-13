import { useEffect, useState } from "react";

/** Motion moment 3: counts up once on mount. Final value at once under reduced motion. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), durationMs = 900 }: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
}) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) return setShown(value);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setShown(value * (1 - (1 - t) ** 3)); // ease-out cubic
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduce]);

  // The accessible value is the final one; only the visual digits animate.
  return (
    <span aria-label={format(value)}>
      <span aria-hidden="true">{format(shown)}</span>
    </span>
  );
}
