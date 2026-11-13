# HashWitness: 5-minute pitch script (team DigiHacks)

Deck: `HashWitness-DigiHacks.html` (press **N** to see these notes on screen). Total: about 4 min 55 s.
Speakers: **Manal** (slides 1–2), **Aymane** (slides 3–4), **Redone** (slides 5–7).
Every number below is measured (README, NOTES.md, simulation output); say "in simulation" where it says so.

| # | Slide | Speaker | Time |
|---|---|---|---|
| 1 | Project & team | Manal | 0:00–0:25 |
| 2 | Problem | Manal | 0:25–1:05 |
| 3 | Solution | Aymane | 1:05–1:45 |
| 4 | Product / PoC | Aymane | 1:45–2:45 |
| 5 | Technology & Hedera | Redone | 2:45–3:35 |
| 6 | Impact & adoption | Redone | 3:35–4:15 |
| 7 | Conclusion & vision | Redone | 4:15–4:55 |

## 1. HashWitness (Manal, 25 s)
Hi, we are DigiHacks: Manal, Aymane and Redone. Our project is HashWitness. In one sentence: it lets any application
verify the Hedera data it reads, without having to trust a single mirror node. The picture says it: several mirrors go
in, one of them lies, and only one verified truth comes out.

## 2. Problem (Manal, 40 s)
A school issues a diploma on Hedera and later revokes it. Consensus is final: the revocation is on the ledger. But a
recruiter's app never talks to consensus. It reads through one mirror node, a REST API that returns plain JSON with no
proof. If that one mirror is compromised, it can delete the revocation and re-forge the hash chain, serve an old
snapshot, or tell different clients different stories. The recruiter then accepts a revoked diploma.
**Hand-over:** "Aymane will show you how we fix that."

## 3. Solution (Aymane, 40 s)
HashWitness does three things. It **verifies**: it asks several mirrors, recomputes Hedera's own SHA-384 running-hash
chain locally, and checks that the chain ends exactly at the hash a consensus node reports. A forged history cannot.
It **explains**: an AI agent writes a forensic report. It **proves**: every verdict is attested on the Hedera Consensus
Service. One golden rule: the AI proposes, cryptography decides. No verdict ever depends on the AI.

## 4. Product / PoC (Aymane, 60 s)
This is our working proof of concept, on real testnet data. In the Attack Lab a third mirror is controlled by an
attacker. Left: a naive app trusting that mirror says **Valid**. Right: HashWitness. The two real mirrors, the Hedera
public mirror and Hgraph, agree; the attacker row is red, "Forged history", and the verdict is **Revoked**. Same for
replay, flagged "Stale view", and equivocation, flagged "Two-faced". The report shows exactly which sequence numbers
were altered, and the AI analysis, here answered by the LLM gpt-oss-20b.
*Option:* click the demo card to play the 86-second video, or switch to the live app (`pnpm demo`), then come back.
**Hand-over:** "Redone will explain why this needs Hedera."

## 5. Technology & Hedera (Redone, 50 s)
Why Hedera? Three reasons, all used in the code. One: the Consensus Service gives every message a running hash that
commits to the whole history. We reimplemented Hedera's exact algorithm and matched 100 out of 100 real testnet
messages, so a mirror cannot alter or drop a message unnoticed. Two: we read the topic head straight from a consensus
node. That anchor turns a majority vote into a proof. Three: every verification is attested on HCS, a public, ordered
audit log, for about 0.0053 HBAR each. Two mirrors are real, the attacker is simulated. The AI agent runs live on
OpenRouter with a rule-based fallback, and a Thompson-sampling bandit chooses which mirrors to query.

## 6. Impact & adoption (Redone, 40 s)
Who uses it? Schools issuing verifiable diplomas; recruiters who need one trustworthy check with a public receipt;
and any app that reads Hedera through mirrors: wallets, explorers, dApps. Measured: zero lies accepted, in every
testnet attack and in 200 simulated scenarios; 77 percent lower query cost with adaptive mirror selection, in
simulation; three out of three attacks caught on real testnet data. We complement block nodes and state proofs: they
make the source provable, we verify what applications actually read today.

## 7. Conclusion & vision (Redone, 40 s)
What is different: a cryptographic anchor instead of a vote, it works with today's mirror APIs, and the AI explains
but never decides. Honest limits: two real mirrors and a simulated attacker; the anchor comes from one consensus node;
normal mirror lag can look like a replay. Next: verify record-file signatures locally, take the anchor from several
consensus nodes, support W3C Verifiable Credentials. Don't trust the mirror: verify it. Thank you.

## Likely questions (short answers)
- **Isn't a majority of mirrors enough?** No: colluding mirrors could win a vote. The consensus-node anchor is what
  makes the result provable; we tested that a colluding majority wins without it.
- **What if the AI is wrong?** Nothing changes: the verdict is computed before the AI runs. On 40 simulated scenarios
  the AI matched our rules exactly (83 %), so it adds explanations, not accuracy.
- **Which parts are real?** Hedera testnet, HCS topics, the consensus-node query, the Hedera public mirror, Hgraph and
  the LLM calls. The attacker mirror and the 5-mirror cost simulation are simulated.
- **Cost?** About 0.0053 HBAR per attestation on testnet; the LLM cost us $0.0057 in total during development.
