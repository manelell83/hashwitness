# 4Hacks "Submit Project" form: draft texts

Copy each block into the matching field. Each is under 150 words. Check the form for its exact field names and limits.

## Project name
HashWitness

## One-line description
Verify Hedera data without trusting a single mirror node: quorum, Hedera's running-hash chain and a consensus-node
anchor, with an AI forensic report and an audit trail on HCS.

## Problem
Hedera's consensus is trustworthy, but applications read it through a mirror node REST API that returns plain JSON
with no proof. One compromised or faulty mirror can tamper with data (for example delete a credential revocation),
replay an old snapshot, or show different clients different histories. Our use case: a school issues diplomas on the
Hedera Consensus Service and later revokes one; a recruiter whose app trusts a single mirror can be shown the revoked
diploma as valid.

## Solution
HashWitness queries several mirrors, recomputes Hedera's SHA-384 running-hash chain for every message, and checks that
each mirror's history ends exactly at the topic head read from a consensus node. A forged or stale history is caught
even if it looks self-consistent. An AI agent (LLM, with a rule-based fallback) explains which mirror lied and
recommends an action, but never changes the verdict: the AI proposes, cryptography decides. Every verification is
attested on HCS. Working PoC on testnet, with an Attack Lab showing three attacks (tamper, replay, equivocation)
caught on real data.

## Hedera integration
- **HCS registry topic** holds the diploma lifecycle (issue / revoke), with a submit key so only the issuer writes.
- **HCS running hash (v3)** is recomputed locally for every message; our implementation matched 100/100 real testnet
  messages.
- **Consensus-node query** (`TopicInfoQuery`) gives the topic's latest sequence number and running hash: an anchor no
  mirror can fake.
- **Mirror node REST API** from two real providers (Hedera public mirror, Hgraph) is the data being verified.
- **HCS attestation topic**: each verdict and its report hash, about 0.0053 HBAR per attestation, readable by anyone.

## Tech stack
TypeScript, Node.js 20+, pnpm workspace; Hiero JS SDK (`@hiero-ledger/sdk`); Express API; Vite + React web app; Vitest
(118 tests). AI agent: OpenAI-compatible API via OpenRouter (`openai/gpt-oss-20b`), strict JSON schema, 5 s timeout,
cache, rule-based fallback. Thompson-sampling mirror selection, evaluated in a seeded simulation. Hedera testnet.

## Demo link
(Works once GitHub Pages is enabled.)
https://manelell83.github.io/hashwitness/ (deck) · https://manelell83.github.io/hashwitness/HashWitness-demo.mp4 (86 s video)

## Repository
https://github.com/manelell83/hashwitness

## Honest limitations (optional field, or add to the description)
Two real mirrors plus one simulated attacker mirror; the anchor comes from a single consensus node; benign mirror lag
can look like a replay; cost figures for mirror selection come from a simulation. Next: verify record-file signatures
locally.
