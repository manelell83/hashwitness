import { useEffect, useState } from "react";
import { api, type MetricsReport } from "../api.ts";
import { ConfusionMatrix } from "../components/charts/ConfusionMatrix.tsx";
import { CostCurveChart } from "../components/charts/CostCurveChart.tsx";
import { CountUp } from "../components/charts/CountUp.tsx";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function MetricsScreen() {
  const [m, setM] = useState<MetricsReport | null | undefined>(undefined); // undefined = loading
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.metrics().then(setM).catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (m === undefined) return <p className="muted">Loading…</p>;
  if (m === null) {
    return (
      <section className="card">
        <h1>Metrics</h1>
        <p>No simulation results yet. They are measured by the simulation harness: run <span className="mono">pnpm sim</span>.</p>
      </section>
    );
  }

  const saved = m.baseline.queries ? 1 - m.bandit.queries / m.baseline.queries : 0;
  const costSaved = m.baseline.costUnits ? 1 - m.bandit.costUnits / m.baseline.costUnits : 0;
  return (
    <div className="stack">
      <section className="card">
        <h1>Metrics</h1>
        <p>
          Measured over {m.scenarios} simulated scenarios (seed {m.seed}). Adaptive mirror selection (Thompson sampling)
          vs querying every mirror.
        </p>
        <div className="tiles">
          <div className="tile">
            <span className="tile-label">Queries used (bandit)</span>
            <span className="tile-value"><CountUp value={m.bandit.queries} /></span>
            <span className="muted">vs {m.baseline.queries.toLocaleString()} query-all ({pct(saved)} fewer)</span>
          </div>
          <div className="tile">
            <span className="tile-label">Cost (bandit)</span>
            <span className="tile-value"><CountUp value={m.bandit.costUnits} /></span>
            <span className="muted">units vs {m.baseline.costUnits.toLocaleString()} ({pct(costSaved)} less)</span>
          </div>
          <div className="tile">
            <span className="tile-label">Accepted a lie</span>
            <span className="tile-value">{pct(m.bandit.fooledRate)}</span>
            <span className="muted">of attacks · query-all: {pct(m.baseline.fooledRate)}</span>
          </div>
          <div className="tile">
            <span className="tile-label">Attacker exposed</span>
            <span className="tile-value">{pct(m.bandit.detectionRate)}</span>
            <span className="muted">of attacks · query-all: {pct(m.baseline.detectionRate)}</span>
          </div>
          <div className="tile">
            <span className="tile-label">False-positive rate</span>
            <span className="tile-value">{pct(m.bandit.falsePositiveRate)}</span>
            <span className="muted">query-all: {pct(m.baseline.falsePositiveRate)}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Cumulative query cost</h2>
        <CostCurveChart data={m.costCurve} />
      </section>

      <section className="card">
        <h2>Attack classification</h2>
        <p className="muted">Classifier: {m.confusion.classifier}</p>
        <ConfusionMatrix labels={m.confusion.labels} matrix={m.confusion.matrix} />
      </section>

      {m.confusionLlm && (
        <section className="card">
          <h2>AI agent classification</h2>
          <p className="muted">
            Engine: {m.confusionLlm.classifier}. First {m.confusionLlm.scenarios} scenarios:{" "}
            {m.confusionLlm.engine.notNeeded} with nothing to explain (counted as benign),{" "}
            {m.confusionLlm.engine.fallback} fell back to the rules (left out). The AI never changes a verdict.
          </p>
          <ConfusionMatrix labels={m.confusionLlm.labels} matrix={m.confusionLlm.matrix} />
        </section>
      )}
      <p className="muted">Generated {new Date(m.generatedAt).toLocaleString()}.</p>
    </div>
  );
}
