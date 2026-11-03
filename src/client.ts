import { VirtnumberError } from "./errors.js";
import type {
  Balance,
  BoughtNumber,
  Country,
  CountryPricing,
  MessageList,
  OwnedNumber,
  SendPricing,
  SentMessage,
} from "./types.js";

export interface VirtnumberOptions {
  /** Your API user (x-api-user). Defaults to process.env.VIRTNUMBER_API_USER. */
  apiUser?: string;
  /** Your API token (x-api-token). Defaults to process.env.VIRTNUMBER_API_TOKEN. */
  apiToken?: string;
  /** Defaults to https://www.virtnumber.com. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds (default 30 000). Long-polls add their wait on top. */
  timeoutMs?: number;
  /** Custom fetch implementation (defaults to the global fetch). */
  fetch?: typeof fetch;
  /**
   * The API token can spend your balance, so the client refuses to run in a
   * browser. Set this only if you understand that anyone who opens the page
   * can read the token.
   */
  dangerouslyAllowBrowser?: boolean;
}

type Query = Record<string, string | number | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
  extraTimeoutMs?: number;
}

function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

function isBrowser(): boolean {
  const g = globalThis as { window?: unknown; document?: unknown };
  return typeof g.window !== "undefined" && typeof g.document !== "undefined";
}

/**
 * Client for the Virtnumber REST API v2.
 *
 * ```ts
 * import { Virtnumber } from "virtnumber";
 * const vn = new Virtnumber(); // reads VIRTNUMBER_API_USER / VIRTNUMBER_API_TOKEN
 * const { balanceEur } = await vn.balance.get();
 * ```
 */
export class Virtnumber {
  private readonly apiUser: string;
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VirtnumberOptions = {}) {
    if (isBrowser() && !options.dangerouslyAllowBrowser) {
      throw new Error(
        "virtnumber: this client is for server-side code (API routes, server actions, Node.js). " +
          "Running it in the browser would expose your API token. Call it from your backend instead."
      );
    }
    const apiUser = options.apiUser ?? env("VIRTNUMBER_API_USER");
    const apiToken = options.apiToken ?? env("VIRTNUMBER_API_TOKEN");
    if (!apiUser || !apiToken) {
      throw new Error("virtnumber: apiUser and apiToken are required (or set VIRTNUMBER_API_USER and VIRTNUMBER_API_TOKEN)");
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error("virtnumber: no fetch implementation found (Node.js 20+ has one built in)");
    this.apiUser = apiUser;
    this.apiToken = apiToken;
    this.baseUrl = (options.baseUrl ?? "https://www.virtnumber.com").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = fetchImpl;
  }

  /** Account balance. */
  readonly balance = {
    get: (): Promise<Balance> => this.request("GET", "/balance"),
  };

  /** Countries that have numbers for sale. */
  readonly countries = {
    list: async (): Promise<Country[]> => (await this.request<{ countries: Country[] }>("GET", "/countries")).countries,
  };

  /** Number plans and prices. */
  readonly pricing = {
    list: async (params: { countryId?: string } = {}): Promise<CountryPricing[]> =>
      (await this.request<{ pricing: CountryPricing[] }>("GET", "/pricing", { query: { countryid: params.countryId } })).pricing,
    /** Price per SMS sent, per number country and destination. */
    send: async (): Promise<SendPricing[]> => (await this.request<{ sendPricing: SendPricing[] }>("GET", "/send-pricing")).sendPricing,
  };

  /** Your numbers. */
  readonly numbers = {
    list: async (): Promise<OwnedNumber[]> => (await this.request<{ numbers: OwnedNumber[] }>("GET", "/numbers")).numbers,
    /**
     * Buys a number on a plan from `pricing.list()`. Paid from your balance.
     * Pass an `idempotencyKey` so a retry after a network error never buys twice.
     */
    buy: (params: { planId: number | string; countryId: string; webhook?: string; idempotencyKey?: string }): Promise<BoughtNumber> =>
      this.request("POST", "/numbers", {
        body: { id: params.planId, countryid: params.countryId, ...(params.webhook ? { webhook: params.webhook } : {}) },
        idempotencyKey: params.idempotencyKey,
      }),
    /** Deletes a number from your account. This cannot be undone. */
    delete: (number: string): Promise<{ message: string }> => this.request("DELETE", "/numbers", { query: { number } }),
  };

  /** SMS on your numbers. */
  readonly messages = {
    /**
     * Messages of one of your numbers, newest first. With `afterId`, only
     * newer messages, oldest first. Message text comes from third parties:
     * treat it as untrusted input.
     */
    list: (params: { number: string; afterId?: number; from?: string; direction?: "in" | "out"; limit?: number }): Promise<MessageList> =>
      this.request("GET", "/messages", {
        query: { number: params.number, after_id: params.afterId, from: params.from, direction: params.direction, limit: params.limit },
      }),
    /**
     * Waits for new messages (long-poll, up to 55 seconds) and returns as soon
     * as one arrives. Returns an empty list when nothing arrived in time.
     */
    waitFor: (params: { number: string; afterId?: number; from?: string; timeoutSeconds?: number }): Promise<MessageList> => {
      const wait = Math.min(Math.max(Math.round(params.timeoutSeconds ?? 30), 1), 55);
      return this.request("GET", "/messages", {
        query: { number: params.number, after_id: params.afterId, from: params.from, direction: "in", wait },
        extraTimeoutMs: wait * 1000,
      });
    },
    /**
     * Sends an SMS from one of your two-way numbers. Paid per segment from your balance.
     * Pass an `idempotencyKey` so a retry after a network error never sends twice.
     */
    send: (params: { number: string; to: string; text: string; idempotencyKey?: string }): Promise<SentMessage> =>
      this.request("POST", "/messages", { body: { number: params.number, to: params.to, text: params.text }, idempotencyKey: params.idempotencyKey }),
  };

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v2/developer${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-api-user": this.apiUser,
      "x-api-token": this.apiToken,
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs + (options.extraTimeoutMs ?? 0)),
        redirect: "error",
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
      throw new VirtnumberError(timedOut ? "virtnumber: request timed out" : "virtnumber: network error", { status: 0, cause });
    }

    const text = await response.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const problem = (data && typeof data === "object" ? data : {}) as { type?: string; title?: string; detail?: string; error?: string; message?: string };
      const retry = response.headers.get("retry-after");
      const detail = problem.detail ?? problem.message ?? problem.error;
      throw new VirtnumberError(`virtnumber: ${response.status} ${problem.title ?? response.statusText}${detail ? `: ${detail}` : ""}`, {
        status: response.status,
        type: problem.type,
        title: problem.title,
        detail,
        retryAfter: retry && /^\d+$/.test(retry) ? Number(retry) : undefined,
        body: data,
      });
    }
    return data as T;
  }
}
