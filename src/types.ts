// Shapes of the Virtnumber REST API v2 (https://www.virtnumber.com/openapi.json).

export interface Country {
  /** ISO 3166-1 alpha-2 code, e.g. "GB". */
  countryid: string;
  countryfull: string;
  /** Calling code without "+", e.g. "44". */
  countrycode: string;
}

export interface Plan {
  /** Plan id to pass to `numbers.buy({ planId })`. */
  id: number;
  days: number;
  /** Price in EUR as a decimal string, e.g. "9.90". */
  price: string;
  salestatus: string;
  /** The number needs a postal address in its country on your account. */
  requiresAddress: boolean;
  /** The number can also send SMS (two-way). */
  canSendSms?: boolean;
}

export interface CountryPricing extends Country {
  plans: Plan[];
}

export interface SendDestination {
  destination: string;
  destinationName: string;
  /** Price in EUR for one SMS segment. */
  price: number;
}

export interface SendPricing {
  /** Country of the number you send from. */
  countryid: string;
  countryfull: string;
  destinations: SendDestination[];
}

export interface OwnedNumber {
  number: string;
  /** "active", or "pending" while the number is still being set up. */
  numberstatus: string;
  firstbuy: string;
  expirationday: string;
  webhook: string;
}

export interface BoughtNumber {
  /** The new number, digits only. A pending number may hold X placeholders. */
  phone: string;
  plan: string;
  price: number;
  days: number;
  numberstatus: string;
}

export interface Message {
  id: number;
  direction: "in" | "out";
  from: string;
  to: string;
  text: string;
  receivedAt: string | null;
  /** Numeric codes found in the text. */
  codes: string[];
}

export interface MessageList {
  number: string;
  messages: Message[];
  /** Highest message id in the answer: pass it as `afterId` to get only newer ones. */
  latestId: number | null;
}

export interface SentMessage {
  sid: string;
  to: string;
  /** Total price in EUR. */
  price: number;
  /** SMS segments the text was billed as. */
  segments: number;
}

export interface Balance {
  balanceEur: number;
}

/** Body of the POST Virtnumber sends to a number's webhook URL for each incoming SMS. */
export interface IncomingSmsWebhook {
  status: string;
  from: string;
  to: string;
  text: string;
  datetime: string;
}
