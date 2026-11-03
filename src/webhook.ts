import type { IncomingSmsWebhook } from "./types.js";

// Virtnumber signs every webhook POST with
//   X-Virtnumber-Signature: sha256=<hex HMAC-SHA256 of the raw body>
// The HMAC key is the SHA-256 digest of your API token (x-api-token), so you
// can verify with the token you already have. Web Crypto only: works in
// Node.js 20+, Bun, Deno and edge runtimes (Next.js middleware/edge routes).

export const SIGNATURE_HEADER = "x-virtnumber-signature";

const encoder = new TextEncoder();

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? encoder.encode(data) : data;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Checks that a webhook POST really comes from Virtnumber.
 *
 * Pass the body exactly as received (before JSON.parse) and the
 * X-Virtnumber-Signature header.
 */
export async function verifyWebhook(options: { rawBody: string | Uint8Array; signature: string | null | undefined; apiToken: string }): Promise<boolean> {
  const { rawBody, signature, apiToken } = options;
  if (!signature || !apiToken) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signature.trim());
  if (!match) return false;
  const given = hexToBytes(match[1]!);
  if (!given) return false;

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("virtnumber: Web Crypto (globalThis.crypto.subtle) is not available in this runtime");
  const keyBytes = new Uint8Array(await subtle.digest("SHA-256", bufferOf(encoder.encode(apiToken))));
  const key = await subtle.importKey("raw", bufferOf(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await subtle.sign("HMAC", key, bufferOf(toBytes(rawBody))));
  return timingSafeEqual(expected, given);
}

/**
 * Verifies the signature and returns the parsed incoming SMS.
 * Throws if the signature is missing or wrong.
 */
export async function parseWebhook(options: { rawBody: string; signature: string | null | undefined; apiToken: string }): Promise<IncomingSmsWebhook> {
  if (!(await verifyWebhook(options))) throw new Error("virtnumber: invalid webhook signature");
  return JSON.parse(options.rawBody) as IncomingSmsWebhook;
}
