import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { verifyWebhook, parseWebhook } from "../dist/esm/index.js";

// Same signing as the Virtnumber server (bun routes/shared/sendWebhook.ts):
// key = sha256(apiToken) as bytes, signature = hex HMAC-SHA256 of the body.
const apiToken = "test-token-1234567890";
const body = JSON.stringify({ status: "ok", from: "Alice", to: "447911123456", text: "Hello", datetime: "2026-11-03 10:00:00" });
const key = createHash("sha256").update(apiToken).digest();
const signature = "sha256=" + createHmac("sha256", key).update(body).digest("hex");

test("accepts a correctly signed body", async () => {
  assert.equal(await verifyWebhook({ rawBody: body, signature, apiToken }), true);
});

test("rejects a changed body, a wrong token and a malformed header", async () => {
  assert.equal(await verifyWebhook({ rawBody: body + " ", signature, apiToken }), false);
  assert.equal(await verifyWebhook({ rawBody: body, signature, apiToken: "other" }), false);
  assert.equal(await verifyWebhook({ rawBody: body, signature: "sha256=abc", apiToken }), false);
  assert.equal(await verifyWebhook({ rawBody: body, signature: null, apiToken }), false);
});

test("parseWebhook returns the message or throws", async () => {
  const msg = await parseWebhook({ rawBody: body, signature, apiToken });
  assert.equal(msg.text, "Hello");
  await assert.rejects(parseWebhook({ rawBody: body, signature: "sha256=" + "0".repeat(64), apiToken }));
});
