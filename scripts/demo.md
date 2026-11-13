# HashWitness: 4-minute demo script

Screen-shared, browser at 1280 px or wider so the Attack Lab shows the two cards side by side.

## Before the demo (10 minutes earlier)

```bash
pnpm demo
```

It seeds everything (topics, registry, simulation, offline cache), prints the URLs, and starts the attacker mirror, the
API and the web app. Wait for these terminal lines, then open **http://localhost:5173**:

- `api on http://127.0.0.1:5552  mirrors: hedera-public, hgraph (+ attacker)  k=2`
- `forensic agent: LLM openai/gpt-oss-20b`

Checklist:
- [ ] Attack Lab → mode **Honest** (reset from the last rehearsal).
- [ ] Run one Verify on `DIP-002`: warms the connections and refreshes the offline cache.
- [ ] Second browser tab on the attestation topic in HashScan (URL printed by `pnpm demo`).
- [ ] **Backup:** if testnet or the venue network is slow, stop with Ctrl+C and run `pnpm demo:offline` (no network:
      cached mirror responses and anchor, recorded AI answers, an orange banner says so, nothing is published).

## Script

| Time | Screen | Action | Say |
|---|---|---|---|
| 0:00–0:30 | Verify | Nothing yet. | "A school issues diplomas on Hedera; a recruiter checks them. Consensus is trustworthy, but apps read Hedera through **one mirror node**, which returns plain JSON with no proof. If that mirror hides a revocation, the recruiter accepts a revoked diploma." |
| 0:30–1:00 | Verify | Type `DIP-002`, click **Verify**. | "HashWitness asks two independent real mirrors, the Hedera public mirror and Hgraph, recomputes Hedera's SHA-384 running-hash chain locally, and checks the chain head against a **consensus node**. Valid. Every check is anchored back on Hedera." Point at **View on HashScan ↗**. |
| 1:00–2:00 | Attack Lab | Click **Tamper**. Credential `DIP-001`. Click **Verify**. | "A third mirror is now malicious. It deletes the revocation and rebuilds a perfectly valid-looking hash chain." Left card shows **✓ Valid**: "The naive app trusts it." Right card: the mirrors appear one by one, the attacker row turns red (**Forged history**), **✕ Revoked**: "Two honest mirrors outvote it, and the forged history doesn't end at the hash the consensus network reports." Scroll to **Differences by sequence number**: "Exactly which messages were altered." |
| 2:00–2:40 | Attack Lab | **Replay** → **Verify**, then **Equivocate** → **Verify**. | Replay: "An old snapshot from before the revocation: flagged **Stale view**." Equivocate: "The nastiest one: the mirror tells HashWitness the truth and lies to everyone else. An anonymous probe catches it as **Two-faced**." |
| 2:40–3:10 | Attack Lab (report) | Scroll to **AI analysis**. Point at the **Engine** pill. | "An AI agent explains the attack and recommends an action. The pill says which engine answered: here gpt-oss-20b on OpenRouter, under a second. It only sees structured evidence, never raw mirror data, so it can't be prompt-injected through a mirror. And it **proposes, it does not decide**: the verdict comes from cryptography. If the LLM is slow or wrong-shaped, a rule-based fallback answers, and the pill says so." |
| 3:10–3:30 | Audit log | Open **Audit log**. Click **View transaction on HashScan ↗** on the top entry. | "Each verification and its report hash are on the Hedera Consensus Service. Change one byte of a stored report and it shows as edited." |
| 3:30–3:50 | Metrics | Open **Metrics**, scroll through the tiles to **AI agent classification**. | "Querying every mirror every time is expensive. A Thompson-sampling bandit learns which mirrors are reliable and cheap: 3 queries instead of 10, 77 % less cost in our simulation, and it never accepted a lie. On 40 scenarios the AI agent matches our rules exactly; it adds explanations, not accuracy, and we say so." |
| 3:50–4:00 | Any | | "Hedera is the anchor of trust: registry, attestations, consensus-node check. HashWitness makes mirror reads verifiable. Thank you." |

After the demo: Attack Lab → **Honest**.

## If something goes wrong

| Symptom | Fix |
|---|---|
| Verify takes > 10 s or fails | Testnet or a mirror is slow. Retry once; otherwise Ctrl+C and `pnpm demo:offline` (30 s), same script. In offline mode, skip the HashScan clicks: nothing is published, and the banner says why. |
| AI pill says "Rule-based fallback (timeout)" | The LLM took more than 5 s. Say: "the deterministic fallback answered; the verdict never depended on the AI anyway." |
| "Attacker mirror is not running" | Port 5551 busy or stopped: restart `pnpm dev`. |
| hgraph row shows Unreachable | Free-tier limit or provider outage. The verdict still needs 2 agreeing mirrors: use `pnpm demo:offline`, or set `QUORUM_K=1` in `.env` and restart. |
| Replay shows Valid → Revoked in the naive card | The registry is not in the demo order. Run `pnpm demo:seed` (it checks and explains). |
