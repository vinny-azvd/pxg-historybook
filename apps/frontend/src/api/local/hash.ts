// Client-side replacement for the backend's node:crypto-based hashPayload
// (huntIngestion.ts/terrorIngestion.ts/mdIngestion.ts) - same algorithm
// (SHA-256) and same hex-encoded output format, just async because Web
// Crypto's SubtleCrypto API is promise-based.
export async function hashPayload(rawJson: string): Promise<string> {
  const data = new TextEncoder().encode(rawJson);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
