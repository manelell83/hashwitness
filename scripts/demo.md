# HashWitness: 4-minute demo script

Screen-shared, browser at 1280 px or wider so the Attack Lab shows two columns side by side.

## Before the demo (5 minutes earlier)

```bash
pnpm demo
```

`pnpm demo` seeds everything (topics, registry, simulation results) and starts the fake mirror, the API and the web app.
Wait for `api on http://127.0.0.1:5552` and `forensic agent: …` in the terminal, then open http://localhost:5173.

Checklist:
- [ ] Attack Lab → mode **Honest** (reset from the last rehearsal).
- [ ] Run one Verify on `DIP-002` so the first real call has warmed up the connections.
- [ ] Second tab ready on the attestation topic in HashScan (link in the Audit log header).
- [ ] If the venue network is unreliable: set `DEMO_REPLAY=1` in `.env` and restart `pnpm dev`. The AI block then uses
      recorded outputs (or the rule-based classifier, labelled as such). Verification itself still needs testnet.

## Script

| Time | Screen | Action | Say |
|---|---|---|---|
| 0:00–0:30 | Verify | Nothing yet. | "A school issues diplomas on Hedera; a recruiter checks them. Consensus is trustworthy, but apps read Hedera through **one mirror node** that returns plain JSON with no proof. If that mirror lies, say it hides a revocation, the recruiter accepts a revoked diploma." |
| 0:30–1:00 | Verify | Type `DIP-002`, click **Verify**. | "HashWitness asks several mirrors, recomputes Hedera's SHA-384 running-hash chain locally, and checks the chain head against a **consensus node**. Valid. Every check is anchored back on Hedera: here is the attestation." Point at **View on HashScan ↗**. |
| 1:00–2:00 | Attack Lab | Click **Tamper**. Credential `DIP-001`. Click **Verify**. | "One mirror is now malicious. It deletes the revocation and rebuilds a perfectly valid-looking hash chain." Left card shows **✓ Valid** at once: "The naive app trusts it." Right card: mirrors appear one by one, the attacker row turns red, **✕ Revoked**: "HashWitness catches it: the forged history doesn't end at the hash the consensus network reports." Scroll to **Differences by sequence number**: "Exactly which messages were altered." |
| 2:00–2:40 | Attack Lab | **Replay** → **Verify**, then **Equivocate** → **Verify**. | Replay: "An old snapshot from before the revocation: flagged **Stale view**." Equivocate: "The nastiest one: the mirror tells HashWitness the truth and lies to everyone else. We send an anonymous probe; it's caught as **Two-faced**." |
| 2:40–3:10 | Attack Lab (report) | Scroll to **AI analysis**. | "An AI agent explains the attack and recommends an action. It only sees structured evidence, never raw mirror data, so it can't be prompt-injected through a mirror. And it **proposes, does not decide**: the verdict comes from cryptography." |
| 3:10–3:30 | Audit log | Open **Audit log**. Click **View transaction on HashScan ↗** on the top entry. | "Each verification and its full report hash are on the Hedera Consensus Service. Change one byte of a stored report and it shows as edited." |
| 3:30–3:50 | Metrics | Open **Metrics**. | "Querying every mirror every time is expensive. A Thompson-sampling bandit learns which mirrors are reliable and cheap: about 3 queries instead of 10, ~77 % less cost in our simulation, and it never accepted a lie. Honest trade-off: it exposes the attacker less often, which is what the audit rate tunes." |
| 3:50–4:00 | Any | | "Hedera is the anchor of trust, used for registry, attestations and the consensus-node check. HashWitness makes mirror reads verifiable. Thank you." |

After the demo: Attack Lab → **Honest**.

## If something goes wrong

| Symptom | Fix |
|---|---|
| "Attacker mirror is not running" | Port 5551 busy or stopped: restart `pnpm dev`. |
| Verify takes > 10 s or fails | Testnet or mirror slow. Retry once; then show the Audit log and Metrics (no live call needed), and walk through a previous attestation on HashScan. |
| AI block says "Rule-based" | Expected when no LLM key is set or the call timed out (5 s). Say: "the deterministic fallback; the verdict never depended on the AI anyway." |
| Replay shows Valid → Revoked in the naive card | The registry is not in the demo order. Run `pnpm demo:seed` (it checks and explains). |
