import crossFetch from 'cross-fetch';
import type {
  FetchLike,
  PaymentPayload,
  PaymentRequirementItem,
  SettleResult,
  VerifyResponse,
} from './types.js';

/** Use the platform fetch when present, otherwise the cross-fetch ponyfill (older runtimes). */
export const defaultFetch: FetchLike = (url, init) => {
  const platform = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof platform === 'function') return platform(url, init);
  return (crossFetch as unknown as FetchLike)(url, init);
};

export class FacilitatorError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'FacilitatorError';
    this.status = status;
    this.body = body;
  }
}

export interface FacilitatorClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
}

/** Thin HTTP client for an x402 facilitator (`/verify`, `/settle`, `/supported`). */
export class FacilitatorClient {
  readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly feePayerCache = new Map<string, string | undefined>();

  constructor(options: FacilitatorClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? defaultFetch;
  }

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirementItem,
  ): Promise<VerifyResponse> {
    return (await this.post('/verify', { paymentPayload, paymentRequirements })) as VerifyResponse;
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirementItem,
  ): Promise<SettleResult> {
    return (await this.post('/settle', { paymentPayload, paymentRequirements })) as SettleResult;
  }

  /** Fetch and cache the facilitator's fee payer for a network (best effort; undefined on failure). */
  async getFeePayer(network: string): Promise<string | undefined> {
    if (this.feePayerCache.has(network)) return this.feePayerCache.get(network);
    let feePayer: string | undefined;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/supported`, { method: 'GET' });
      if (res.ok) {
        const body = (await res.json()) as { signers?: Record<string, string> };
        feePayer = body.signers?.[network];
      }
    } catch {
      feePayer = undefined;
    }
    this.feePayerCache.set(network, feePayer);
    return feePayer;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      throw new FacilitatorError(`facilitator ${path} returned ${res.status}`, res.status, json);
    }
    return json;
  }
}
