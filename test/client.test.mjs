import { test } from "node:test";
import assert from "node:assert/strict";
import { Virtnumber, VirtnumberError } from "../dist/esm/index.js";

function mockFetch(status, body, headers = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
  };
  return { fn, calls };
}

test("sends auth headers and builds the URL", async () => {
  const { fn, calls } = mockFetch(200, { balanceEur: 12.5 });
  const vn = new Virtnumber({ apiUser: "u1", apiToken: "t1", fetch: fn });
  assert.deepEqual(await vn.balance.get(), { balanceEur: 12.5 });
  assert.equal(calls[0].url, "https://www.virtnumber.com/api/v2/developer/balance");
  assert.equal(calls[0].init.headers["x-api-user"], "u1");
  assert.equal(calls[0].init.headers["x-api-token"], "t1");
});

test("maps parameters to the API names and skips empty ones", async () => {
  const { fn, calls } = mockFetch(200, { number: "1", messages: [], latestId: null });
  const vn = new Virtnumber({ apiUser: "u", apiToken: "t", fetch: fn });
  await vn.messages.list({ number: "447911123456", afterId: 5, limit: 10 });
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("number"), "447911123456");
  assert.equal(url.searchParams.get("after_id"), "5");
  assert.equal(url.searchParams.get("limit"), "10");
  assert.equal(url.searchParams.has("from"), false);
});

test("buy sends the plan as id + countryid and the idempotency key", async () => {
  const { fn, calls } = mockFetch(200, { phone: "447911123456", plan: "30d", price: 9.9, days: 30, numberstatus: "active" });
  const vn = new Virtnumber({ apiUser: "u", apiToken: "t", fetch: fn });
  await vn.numbers.buy({ planId: 51, countryId: "GB", idempotencyKey: "order-1" });
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { id: 51, countryid: "GB" });
  assert.equal(calls[0].init.headers["Idempotency-Key"], "order-1");
});

test("waitFor caps the wait at 55 s and asks for incoming only", async () => {
  const { fn, calls } = mockFetch(200, { number: "1", messages: [], latestId: null });
  const vn = new Virtnumber({ apiUser: "u", apiToken: "t", fetch: fn });
  await vn.messages.waitFor({ number: "1", timeoutSeconds: 300 });
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("wait"), "55");
  assert.equal(url.searchParams.get("direction"), "in");
});

test("errors become VirtnumberError with the problem fields", async () => {
  const { fn } = mockFetch(
    402,
    { type: "https://www.virtnumber.com/problems/insufficient-balance", title: "Insufficient balance", status: 402, detail: "Top up first." },
    { "Content-Type": "application/problem+json", "Retry-After": "7" }
  );
  const vn = new Virtnumber({ apiUser: "u", apiToken: "t", fetch: fn });
  await assert.rejects(vn.numbers.buy({ planId: 1, countryId: "GB" }), (err) => {
    assert.ok(err instanceof VirtnumberError);
    assert.equal(err.status, 402);
    assert.equal(err.title, "Insufficient balance");
    assert.equal(err.detail, "Top up first.");
    assert.equal(err.retryAfter, 7);
    return true;
  });
});

test("network failures become status 0", async () => {
  const vn = new Virtnumber({ apiUser: "u", apiToken: "t", fetch: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(vn.balance.get(), (err) => err instanceof VirtnumberError && err.status === 0);
});

test("refuses to run in a browser unless allowed", () => {
  globalThis.window = {};
  globalThis.document = {};
  try {
    assert.throws(() => new Virtnumber({ apiUser: "u", apiToken: "t", fetch: async () => new Response("{}") }), /server-side/);
    assert.ok(new Virtnumber({ apiUser: "u", apiToken: "t", fetch: async () => new Response("{}"), dangerouslyAllowBrowser: true }));
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test("needs credentials", () => {
  const saved = { u: process.env.VIRTNUMBER_API_USER, t: process.env.VIRTNUMBER_API_TOKEN };
  delete process.env.VIRTNUMBER_API_USER;
  delete process.env.VIRTNUMBER_API_TOKEN;
  try {
    assert.throws(() => new Virtnumber({ fetch: async () => new Response("{}") }), /required/);
  } finally {
    if (saved.u) process.env.VIRTNUMBER_API_USER = saved.u;
    if (saved.t) process.env.VIRTNUMBER_API_TOKEN = saved.t;
  }
});
