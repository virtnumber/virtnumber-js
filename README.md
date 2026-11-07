# virtnumber

Official JavaScript and TypeScript client for the [Virtnumber](https://www.virtnumber.com) API.
Rent phone numbers in 14 countries, read the SMS they receive and send SMS from your own
backend: Node.js, Next.js, Express, NestJS, Bun, Deno or edge functions.

- No dependencies: uses the built-in `fetch`.
- Full TypeScript types.
- Waits for incoming SMS (long-poll up to 55 seconds).
- Safe retries for paid calls with idempotency keys.
- Verifies the signature of incoming SMS webhooks.

```bash
npm install virtnumber
```

## Get your API key

Sign in at [virtnumber.com](https://www.virtnumber.com), open **API** in your account and create
a key. You get an API user and an API token. Keep the token on your server: it can spend your
balance. The client refuses to run in a browser for this reason.

```bash
# .env
VIRTNUMBER_API_USER=your-api-user
VIRTNUMBER_API_TOKEN=your-api-token
```

## Quick start

```ts
import { Virtnumber } from "virtnumber";

const vn = new Virtnumber(); // reads VIRTNUMBER_API_USER and VIRTNUMBER_API_TOKEN

const { balanceEur } = await vn.balance.get();

// Plans and prices for one country
const [gb] = await vn.pricing.list({ countryId: "GB" });
console.log(gb.plans); // [{ id, days, price, requiresAddress, canSendSms }, ...]

// Buy a number (paid from your balance)
const bought = await vn.numbers.buy({ planId: gb.plans[0].id, countryId: "GB", idempotencyKey: "order-1042" });
console.log(bought.phone);
```

## Receive SMS

Read the messages of a number, or wait for the next one:

```ts
const { messages, latestId } = await vn.messages.list({ number: "447911123456", limit: 10 });

// Returns as soon as a new SMS arrives, or an empty list after 55 seconds
const next = await vn.messages.waitFor({ number: "447911123456", afterId: latestId ?? undefined, timeoutSeconds: 55 });
for (const m of next.messages) console.log(m.from, m.text);
```

Message text comes from third parties: treat it as untrusted input.

## Send SMS

Numbers marked `canSendSms` (two-way numbers) can send. Each SMS is billed per segment.

```ts
const sent = await vn.messages.send({
  number: "14155550100",
  to: "+14155551234",
  text: "Your table is ready.",
  idempotencyKey: "table-ready-77",
});
console.log(sent.price, sent.segments);
```

## Webhooks for incoming SMS

Set a webhook URL when you buy a number (or later in the number's settings) and every incoming
SMS is POSTed to it. Verify the signature before you trust the body:

```ts
// app/api/sms-webhook/route.ts (Next.js App Router)
import { parseWebhook, SIGNATURE_HEADER } from "virtnumber";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const sms = await parseWebhook({
      rawBody,
      signature: request.headers.get(SIGNATURE_HEADER),
      apiToken: process.env.VIRTNUMBER_API_TOKEN!,
    });
    console.log(`SMS to ${sms.to} from ${sms.from}: ${sms.text}`);
    return new Response("ok");
  } catch {
    return new Response("invalid signature", { status: 401 });
  }
}
```

## Next.js: call the API from a route handler

```ts
// app/api/numbers/route.ts
import { Virtnumber } from "virtnumber";

const vn = new Virtnumber();

export async function GET() {
  const numbers = await vn.numbers.list();
  return Response.json(numbers);
}
```

Your React components call your own route (`fetch("/api/numbers")`), never Virtnumber directly.

## Errors

Every failed call throws a `VirtnumberError` with the HTTP status and the problem details sent by
the API:

```ts
import { VirtnumberError } from "virtnumber";

try {
  await vn.numbers.buy({ planId: 51, countryId: "GB" });
} catch (err) {
  if (err instanceof VirtnumberError) {
    console.log(err.status, err.title, err.detail); // e.g. 402 "Insufficient balance" ...
    if (err.status === 429) console.log("retry after", err.retryAfter, "s");
  }
}
```

`status` is `0` when no answer arrived (network error or timeout).

## All methods

| Method | What it does |
| --- | --- |
| `balance.get()` | Account balance in EUR |
| `countries.list()` | Countries with numbers for sale |
| `pricing.list({ countryId? })` | Plans and prices of numbers |
| `pricing.send()` | Price per SMS sent, per number country and destination |
| `numbers.list()` | Your numbers |
| `numbers.buy({ planId, countryId, webhook?, idempotencyKey? })` | Buy a number |
| `numbers.delete(number)` | Delete a number (cannot be undone) |
| `messages.list({ number, afterId?, from?, direction?, limit? })` | Messages of a number |
| `messages.waitFor({ number, afterId?, from?, timeoutSeconds? })` | Wait for a new incoming SMS |
| `messages.send({ number, to, text, idempotencyKey? })` | Send an SMS |
| `verifyWebhook()` / `parseWebhook()` | Check a webhook signature |

## Options

```ts
new Virtnumber({
  apiUser: "...",          // default: process.env.VIRTNUMBER_API_USER
  apiToken: "...",         // default: process.env.VIRTNUMBER_API_TOKEN
  timeoutMs: 30_000,       // per request; waitFor adds its wait on top
  fetch: customFetch,      // optional
});
```

## Limits

The REST API allows 20 requests per 15 minutes per account. Every call except
`balance.get()` needs at least 1 EUR on the balance; below that the API answers 403. See the [API reference](https://www.virtnumber.com/developer) and the
[OpenAPI spec](https://www.virtnumber.com/openapi.json).

## AI agents

For AI agents (Claude, Cursor and others) use the MCP server at `https://www.virtnumber.com/mcp`
instead of this package. It is listed in the official MCP Registry as `com.virtnumber/virtnumber`.
Setup for each client: [virtnumber/mcp](https://github.com/virtnumber/mcp). Agent Skills that teach
an agent to receive and send SMS: [virtnumber/skills](https://github.com/virtnumber/skills).

## Support

support@virtnumber.com · [virtnumber.com/developer](https://www.virtnumber.com/developer)

## License

MIT
