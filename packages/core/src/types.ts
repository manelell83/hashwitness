/** One HCS message as served by a mirror node, after validation (see mirror.ts). */
export interface TopicMessage {
  topicId: string;
  sequenceNumber: number;
  consensusTimestamp: string; // "secs.nanos", kept as the exact string the mirror returned
  payerAccountId: string;
  runningHash: string; // base64, 48 bytes
  runningHashVersion: number;
  message: string; // base64
}

/** A mirror node REST endpoint. `headers` carries API keys; never log them. */
export interface MirrorConfig {
  name: string;
  baseUrl: string; // e.g. https://testnet.mirrornode.hedera.com (no trailing /api/v1)
  headers?: Record<string, string>;
}
