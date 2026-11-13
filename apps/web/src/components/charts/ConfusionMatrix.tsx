const LABEL: Record<string, string> = {
  tamper: "Tamper", replay: "Replay", equivocation: "Equivocation", benign_fault: "Benign fault",
};

/**
 * Agent classification vs ground truth. Rows = actual, columns = predicted.
 * Single-hue sequential fill (accent), strength = share of the row. Values always printed: color is never alone.
 */
export function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  const correct = labels.reduce((a, _, i) => a + (matrix[i]?.[i] ?? 0), 0);
  return (
    <figure className="chart">
      <p className="muted">Accuracy {total ? Math.round((correct / total) * 100) : 0}% ({correct} of {total})</p>
      <div className="matrix-wrap">
        <table className="matrix">
          <caption className="sr-only">Rows: actual attack. Columns: predicted attack.</caption>
          <thead>
            <tr>
              <th scope="col" className="matrix-corner">Actual ↓ / Predicted →</th>
              {labels.map((l) => <th key={l} scope="col">{LABEL[l] ?? l}</th>)}
            </tr>
          </thead>
          <tbody>
            {labels.map((actual, i) => {
              const row = matrix[i] ?? [];
              const rowTotal = row.reduce((a, b) => a + b, 0);
              return (
                <tr key={actual}>
                  <th scope="row">{LABEL[actual] ?? actual}</th>
                  {labels.map((pred, j) => {
                    const v = row[j] ?? 0;
                    const share = rowTotal ? v / rowTotal : 0;
                    return (
                      <td key={pred} className={i === j ? "is-diagonal" : undefined}
                        style={{ ["--share" as string]: `${Math.round(share * 85)}%` }}
                        title={`Actual ${LABEL[actual] ?? actual}, predicted ${LABEL[pred] ?? pred}: ${v} (${Math.round(share * 100)}%)`}>
                        {v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
