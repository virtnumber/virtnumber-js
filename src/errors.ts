/**
 * Thrown for every answer that is not a success. The API answers errors as
 * RFC 9457 problem details; their fields are copied here.
 */
export class VirtnumberError extends Error {
  /** HTTP status, or 0 when no answer arrived (network error or timeout). */
  readonly status: number;
  /** Problem type URI, e.g. ".../problems/insufficient-balance". */
  readonly type: string | undefined;
  readonly title: string | undefined;
  readonly detail: string | undefined;
  /** Seconds to wait before retrying, from Retry-After on 429. */
  readonly retryAfter: number | undefined;
  /** The parsed error body, as sent by the API. */
  readonly body: unknown;

  constructor(message: string, init: { status: number; type?: string; title?: string; detail?: string; retryAfter?: number; body?: unknown; cause?: unknown }) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "VirtnumberError";
    this.status = init.status;
    this.type = init.type;
    this.title = init.title;
    this.detail = init.detail;
    this.retryAfter = init.retryAfter;
    this.body = init.body;
  }
}
