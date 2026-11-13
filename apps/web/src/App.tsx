import { useEffect, useState } from "react";
import { api, type Config } from "./api.ts";
import { AttackLabScreen } from "./screens/AttackLabScreen.tsx";
import { VerifyScreen } from "./screens/VerifyScreen.tsx";

type Screen = "verify" | "lab";
const SCREENS: { id: Screen; label: string }[] = [
  { id: "verify", label: "Verify" },
  { id: "lab", label: "Attack Lab" },
];

export function App() {
  const [screen, setScreen] = useState<Screen>("verify");
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The API may start a second after the page (pnpm dev starts everything at once): retry briefly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 15 && !cancelled; attempt++) {
        try {
          const c = await api.config();
          if (!cancelled) { setConfig(c); setError(null); }
          return;
        } catch {
          if (attempt >= 2 && !cancelled) setError("Waiting for the API (pnpm dev)…");
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (!cancelled) setError("API not reachable. Start it with: pnpm dev");
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <img src="/logo.svg" alt="" width={36} height={36} />
          <span className="wordmark">HashWitness</span>
        </div>
        <nav aria-label="Screens">
          {SCREENS.map((s) => (
            <button key={s.id} type="button" className={`btn ${screen === s.id ? "" : "btn-ghost"}`}
              aria-current={screen === s.id ? "page" : undefined} onClick={() => setScreen(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="container">
        {error && <p className="error" role="alert">{error}</p>}
        {screen === "verify" && <VerifyScreen />}
        {screen === "lab" && config && <AttackLabScreen config={config} />}
      </main>
    </>
  );
}
