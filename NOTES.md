# HashWitness: M0 discovery notes

Date: 2026-11-13. Every item is tagged **[TESTED]** (real request made by us), **[DOCS]** (read in official docs/source, URL given), or **[UNVERIFIED]**.

## 1. SDK (writes)

- **[TESTED]** npm: `@hiero-ledger/sdk` latest = **2.91.0** (published 2026-11-09). `@hashgraph/sdk` latest = 2.81.0, last published 2026-03-13.
- **[DOCS]** Install `@hiero-ledger/sdk` (https://github.com/hiero-ledger/hiero-sdk-js README; tutorial https://docs.hedera.com/hedera/tutorials/consensus/submit-your-first-message imports from it). → **We use `@hiero-ledger/sdk`.**
- **[DOCS]** Client: `Client.forTestnet().setOperator(operatorId, operatorKey)` (tutorial passes the env strings directly).
- **[DOCS]** Create topic: `await new TopicCreateTransaction().execute(client)` → `(await tx.getReceipt(client)).topicId`.
- **[DOCS]** Submit: `await new TopicMessageSubmitTransaction({ topicId, message }).execute(client)` → `getReceipt(client)`. Max chunk 1024 bytes, max 20 chunks (our JSON messages are well under 1024 bytes, so there are no chunks).
- **[DOCS]** Fees: topic create ≈ $0.01, message ≈ $0.0001.
- **[DOCS]** Testnet account: https://portal.hedera.com/ (1000 HBAR, DER key starting `3030…`), or faucet https://portal.hedera.com/faucet (100 HBAR/24 h).
- **[UNVERIFIED]** Receipt field names `topicSequenceNumber` / `topicRunningHash` in the JS SDK; `PrivateKey.fromStringECDSA` / `fromStringDer`. Check against the installed package's `.d.ts` in M1.
- **[UNVERIFIED]** `TopicInfoQuery` (consensus-node query) returning `runningHash` + `sequenceNumber`. See §5 for why this matters. Verify in M1.

## 2. Mirror REST (reads)

- **[DOCS + TESTED]** `GET {base}/api/v1/topics/{topicId}/messages`. Params: `limit` (1–100, default 25), `order` (asc|desc), `sequencenumber` (supports operators such as `gt:`), `timestamp` (`gte:secs.nanos` etc.), `encoding`. Paging: `links.next` (relative path or null).
- **[DOCS]** `GET {base}/api/v1/topics/{topicId}/messages/{sequenceNumber}` returns one message.
- **[TESTED]** Real response fields per message: `chunk_info` (nullable), `consensus_timestamp` (`"secs.nanos"` string), `message` (base64), `payer_account_id`, `running_hash` (base64, 48 bytes), `running_hash_version` (3), `sequence_number`, `topic_id`.
- **[TESTED]** Public testnet mirror sends `cache-control: public, max-age=1`, `Via: 1.1 google`, `x-cluster-id`.
- **[DOCS]** Rate limit 50 rps/IP is documented for **mainnet** only. Testnet limit: **[UNVERIFIED]**.

## 3. Which mirrors work (testnet)

| Provider | Testnet base URL | Key? | Result |
|---|---|---|---|
| Hedera public | `https://testnet.mirrornode.hedera.com` | No | **[TESTED] 200**, topic messages OK |
| Hgraph | `https://hedera-testnet.hgraph.com` | Yes: header `X-API-KEY` or `Authorization: Bearer` | **[TESTED] 401** "missing API key". Free tier: 1 rps, 45k req/month (**[DOCS]** https://docs.hgraph.com/overview/rate-limits) |
| Validation Cloud | `https://testnet.hedera.validationcloud.io/v1/api/v1/...` (key goes in the path after `/v1/`, **[UNVERIFIED]**) | Yes | **[TESTED] 401** "invalid api key". Free tier details **[UNVERIFIED]** |
| Arkhia | `https://pool.arkhia.io/hedera/testnet/api/v1/...` | Yes | **[TESTED] 401** "Please send a valid API key". Free shared pool 100 rps (**[DOCS]**), key header **[UNVERIFIED]** |
| testnet-public.mirrornode / api.hgraph.io / nownodes | (guesses) | – | **[TESTED]** no connection. These URLs don't exist; ignore them |

**Conclusion: exactly 1 keyless real testnet mirror.** Three more real, independently operated providers exist but need a free API key each. The official docs contain no testnet provider list (mainnet only).

## 4. HCS running hash (v3): CONFIRMED by recomputation

Sources: proto comment https://github.com/hashgraph/hedera-protobufs/blob/main/services/transaction_receipt.proto and implementation `ConsensusSubmitMessageHandler.updateRunningHashAndSequenceNumber` in https://github.com/hiero-ledger/hiero-consensus-node.

The proto comment describes a raw concatenation, but the node actually writes a **Java `ObjectOutputStream`**, so the bytes include serialization framing:

```
runningHash_n = SHA-384(
  AC ED 00 05                                    # stream header
  75 72 00 02 5B 42 AC F3 17 F8 06 08 54 E0 02 00 00 78 70 00 00 00 30   # new byte[48] + class desc
  prevRunningHash (48 B; 48 zero bytes for seq 1)
  77 4C                                          # block-data, 76 bytes
  u64 3 | u64 payerShard | u64 payerRealm | u64 payerNum
  u64 topicShard | u64 topicRealm | u64 topicNum
  u64 consensusSecs | u32 consensusNanos | u64 sequenceNumber   (all big-endian)
  75 71 00 7E 00 00 00 00 00 30                  # byte[48] referencing the class desc
  SHA-384(message bytes)
)
```

**[TESTED]** `scripts/m0/verify-running-hash.mjs` recomputed **100/100** real testnet messages across 4 topics (0.0.5150822, 0.0.10123912, 0.0.10248442, 0.0.10895560); all matched the mirror's `running_hash`. Payer is `payer_account_id`, and the timestamp comes from `consensus_timestamp` as returned by the mirror.

## 5. Design implication (needs your call)

The running-hash chain is **not signed**. A malicious mirror can drop or alter a message and then recompute a fully consistent fake chain. Chain checking alone therefore catches only *careless* tampering, plus any mirror whose chain diverges from the quorum's.

A real trust anchor would be the latest `(sequenceNumber, runningHash)` read **directly from a consensus node** (`TopicInfoQuery`, a paid gRPC query, fractions of a cent, not via any mirror). Every mirror's chain must then end exactly at that hash. This defeats tamper, stale replay and equivocation even with one mirror, and it is a strong "meaningful Hedera integration" point. Status: **[UNVERIFIED]** that the JS SDK `TopicInfo` exposes `runningHash`/`sequenceNumber`; check in M1.

## 6. LLM (M5): OpenRouter, OpenAI-compatible

- **[DOCS]** Base `https://openrouter.ai/api/v1`, `POST /chat/completions`, `Authorization: Bearer <key>`. Attribution headers (`HTTP-Referer`, `X-OpenRouter-Title`; `X-Title` is legacy) are optional.
- **[DOCS]** Body: `model`, `messages`, `temperature`, `max_tokens` (deprecated in favor of `max_completion_tokens`; we send `max_tokens` because it's the portable OpenAI-compatible field), `response_format: {type:"json_schema", json_schema:{name, strict:true, schema}}`. Structured outputs only on *some* models; `provider: {require_parameters: true}` restricts routing to endpoints that support them (OpenRouter-specific; sending it to other providers is **[UNVERIFIED]** → send only when the base URL is OpenRouter).
- **[DOCS]** Response `choices[0].message.content`. Errors `{error:{code, message, metadata?}}`. `:free` models: 20 req/min, 50/day (<10 credits bought).
- Env: `LLM_BASE_URL` (default `https://openrouter.ai/api/v1`), `LLM_API_KEY`, `LLM_MODEL`. Settings: temperature 0, max_tokens 300, 5 s timeout, on-disk cache keyed by SHA-256 of the canonical diff, schema validation → 1 retry → deterministic fallback, `DEMO_REPLAY=1`.

## 7. Unverified assumptions (full list)

1. ~~JS SDK receipt field names and key-parsing helpers~~ **Resolved in M1** from `@hiero-ledger/sdk@2.91.0` typings: `receipt.topicSequenceNumber`, `receipt.topicRunningHash`, `PrivateKey.fromStringDer/fromStringECDSA`.
2. ~~`TopicInfoQuery` exposes running hash + sequence number~~ **Resolved in M1**: `TopicInfo.runningHash` (Uint8Array) and `sequenceNumber` (Long). **[TESTED]** on our registry topic: the mirror chain head equals the consensus-node anchor (see §8).
3. Testnet public mirror rate limit.
4. Exact auth header/path for Validation Cloud and Arkhia testnet; free-tier terms for Validation Cloud.
5. Whether the three keyed providers run fully independent importers (vs. proxying Hedera's mirror). We cannot prove independence from outside.
6. Mirror lag between providers (affects `INCONSISTENT` false positives). Measure in M2. Plan: compare only up to the minimum common sequence number, and treat a mirror that is merely *behind* as lagging rather than lying, unless it is behind the consensus-node anchor.
7. OpenRouter `provider.require_parameters` behavior when unsupported by the chosen model (docs say request fails → falls to our fallback).

## 8. M1 testnet run (2026-11-13)

- Operator account `0.0.11414541`. Topics (both with submit key = operator key):
  registry `0.0.11443553` (https://hashscan.io/testnet/topic/0.0.11443553),
  attestation `0.0.11443554` (https://hashscan.io/testnet/topic/0.0.11443554).
- seq 1 issue DIP-001, seq 2 issue DIP-002, seq 3 revoke DIP-001.
- **[TESTED]** Via `testnet.mirrornode.hedera.com`: DIP-001 ISSUED → REVOKED, DIP-002 ISSUED; chain verified locally;
  chain head (seq 3) == `TopicInfoQuery` anchor from a consensus node.
- Consequence for M2: the consensus node can be a few seconds ahead of mirrors right after a submit. A mirror behind
  the anchor whose chain is a valid prefix should be reported as *lagging*, not lying; the verifier should retry briefly.
