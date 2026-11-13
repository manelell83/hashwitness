import { useRef, useState, type PointerEvent } from "react";

export interface CostPoint { scenario: number; bandit: number; baseline: number }

// Geometry (SVG user units; the SVG scales to its container width).
const W = 640, H = 280, M = { t: 16, r: 96, b: 36, l: 56 };
const PW = W - M.l - M.r, PH = H - M.t - M.b;

/** Rounds the axis maximum up to 1, 2 or 5 × 10^k and returns 4 even ticks. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((s) => s * mag >= raw) ?? 10) * mag;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/**
 * Cumulative query cost per scenario: Thompson-sampling bandit (accent, solid) vs query-all baseline
 * (muted, dashed). One y-axis. Crosshair + tooltip on hover. Data comes only from props.
 */
export function CostCurveChart({ data }: { data: CostPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  if (data.length === 0) return <p className="muted">No data.</p>;

  const n = data.length;
  const yTicks = niceTicks(Math.max(...data.map((d) => Math.max(d.bandit, d.baseline))));
  const yMax = yTicks.at(-1)!;
  const x = (i: number) => M.l + (n === 1 ? PW / 2 : (i / (n - 1)) * PW);
  const y = (v: number) => M.t + PH - (v / yMax) * PH;
  const path = (key: "bandit" | "baseline") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join("");
  const xTicks = [...new Set([0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round((3 * (n - 1)) / 4), n - 1])];
  const last = data[n - 1]!;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - M.l) / PW) * (n - 1)))));
  };
  const h = hover === null ? null : data[hover]!;

  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><svg width="28" height="10"><line x1="0" y1="5" x2="28" y2="5" className="series-bandit" /></svg> Bandit (Thompson sampling)</span>
        <span><svg width="28" height="10"><line x1="0" y1="5" x2="28" y2="5" className="series-baseline" /></svg> Query every mirror</span>
      </div>
      <div className="chart-plot">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Cumulative query cost over ${n} scenarios: bandit ${last.bandit}, query-all ${last.baseline}`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={M.l} x2={M.l + PW} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={M.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">{t.toLocaleString()}</text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} className="chart-tick" x={x(i)} y={H - 12} textAnchor="middle">{data[i]!.scenario}</text>
          ))}
          <text className="chart-tick" x={M.l + PW / 2} y={H} textAnchor="middle" dominantBaseline="text-after-edge">scenario</text>

          <path d={path("baseline")} className="series-baseline" fill="none" />
          <path d={path("bandit")} className="series-bandit" fill="none" />

          {/* direct labels at the line ends (text tokens, not series colors) */}
          <text className="chart-label" x={x(n - 1) + 8} y={y(last.baseline)} dominantBaseline="middle">Query-all</text>
          <text className="chart-label" x={x(n - 1) + 8} y={y(last.bandit)} dominantBaseline="middle">Bandit</text>

          {h && hover !== null && (
            <g pointerEvents="none">
              <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + PH} />
              <circle className="marker-baseline" cx={x(hover)} cy={y(h.baseline)} r={5} />
              <circle className="marker-bandit" cx={x(hover)} cy={y(h.bandit)} r={5} />
            </g>
          )}
          <rect x={M.l} y={M.t} width={PW} height={PH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {h && hover !== null && (
          <div className="chart-tooltip" role="status" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <strong>Scenario {h.scenario}</strong>
            <span>Bandit: {h.bandit.toLocaleString()}</span>
            <span>Query-all: {h.baseline.toLocaleString()}</span>
            <span>Saved: {h.baseline ? Math.round((1 - h.bandit / h.baseline) * 100) : 0}%</span>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show data table</summary>
        <table>
          <thead><tr><th scope="col">Scenario</th><th scope="col">Bandit (cumulative)</th><th scope="col">Query-all (cumulative)</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.scenario}><td>{d.scenario}</td><td>{d.bandit}</td><td>{d.baseline}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
