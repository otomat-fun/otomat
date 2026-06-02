import type { Connection } from '@solana/web3.js';
import crossFetch from 'cross-fetch';
import { NETWORKS, X402_HEADERS, decodePaymentRequired, encodePaymentSignature } from './headers.js';
import { buildExactPayload } from './exact-svm.js';
import { buildChannelPayload } from './otomat-channel-scheme.js';
import type {
  Check,
  PaymentAccount,
  PaymentPayload,
  PaymentRequirementItem,
  PaymentRequirements,
  SolanaSigner,
} from './types.js';

export interface OtomatClientOptions {
  facilitatorUrl?: string;
  payer: SolanaSigner;
  connection: Connection;
  network?: string;
  fetchImpl?: typeof fetch;
}

function isRequirements(
  value: PaymentRequirements | PaymentRequirementItem,
): value is PaymentRequirements {
  return Array.isArray((value as PaymentRequirements).accepts);
}

/**
 * Low-level x402 client. `fetch` transparently pays a 402 challenge: it parses
 * the requirements, builds an `exact` payload signed by `payer`, and replays the
 * request with a PAYMENT-SIGNATURE header.
 */
export class OtomatClient implements PaymentAccount {
  readonly facilitatorUrl?: string;
  readonly connection: Connection;
  readonly network: string;
  private readonly payer: SolanaSigner;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OtomatClientOptions) {
    this.facilitatorUrl = options.facilitatorUrl;
    this.connection = options.connection;
    this.network = options.network ?? NETWORKS.SOLANA_MAINNET;
    this.payer = options.payer;
    this.fetchImpl = options.fetchImpl ?? (crossFetch as typeof fetch);
  }

  async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
    const response = await this.fetchImpl(url, init);
    if (response.status !== 402) return response;

    const requirements = await this.readRequirements(response);
    const item = this.selectExact(requirements);
    const payload = await buildExactPayload({
      requirement: item,
      payer: this.payer,
      connection: this.connection,
    });

    const headers = new Headers(init?.headers);
    headers.set(X402_HEADERS.PAYMENT_SIGNATURE, encodePaymentSignature(payload));
    return this.fetchImpl(url, { ...init, headers });
  }

  async buildExactPayload(
    requirements: PaymentRequirements | PaymentRequirementItem,
  ): Promise<PaymentPayload> {
    const item = isRequirements(requirements) ? this.selectExact(requirements) : requirements;
    return buildExactPayload({ requirement: item, payer: this.payer, connection: this.connection });
  }

  buildChannelPayload(check: Check, requirement?: PaymentRequirementItem): PaymentPayload {
    return buildChannelPayload(check, requirement);
  }

  private selectExact(requirements: PaymentRequirements): PaymentRequirementItem {
    const exact = requirements.accepts.find((item) => item.scheme === 'exact');
    const chosen = exact ?? requirements.accepts[0];
    if (!chosen) throw new Error('server offered no payment requirements');
    return chosen;
  }

  private async readRequirements(response: Response): Promise<PaymentRequirements> {
    const header =
      response.headers.get(X402_HEADERS.PAYMENT_REQUIRED) ??
      response.headers.get(X402_HEADERS.LEGACY_PAYMENT);
    if (header) return decodePaymentRequired(header);
    return (await response.clone().json()) as PaymentRequirements;
  }
}
