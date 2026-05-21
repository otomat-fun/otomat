import type { PaymentPayload, PaymentRequirements, SettlementResponse } from './types.js';

/** x402 header names. v1 clients send `X-PAYMENT`; v2 uses the PAYMENT-* set. */
export const X402_HEADERS = {
  PAYMENT_REQUIRED: 'PAYMENT-REQUIRED',
  PAYMENT_SIGNATURE: 'PAYMENT-SIGNATURE',
  PAYMENT_RESPONSE: 'PAYMENT-RESPONSE',
  LEGACY_PAYMENT: 'X-PAYMENT',
} as const;

/** CAIP-2 network identifiers (genesis-hash prefixed). */
export const NETWORKS = {
  SOLANA_MAINNET: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  SOLANA_DEVNET: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
} as const;

export const USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

/** Solana `exact` scheme compute-budget ceilings enforced by the facilitator. */
export const MAX_COMPUTE_UNIT_LIMIT = 40000;
export const MAX_COMPUTE_UNIT_PRICE = 5;

function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function decodeBase64Json<T>(encoded: string): T {
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as T;
}

export function encodePaymentRequired(requirements: PaymentRequirements): string {
  return encodeBase64Json(requirements);
}

export function decodePaymentRequired(encoded: string): PaymentRequirements {
  return decodeBase64Json<PaymentRequirements>(encoded);
}

export function encodePaymentSignature(payload: PaymentPayload): string {
  return encodeBase64Json(payload);
}

export function decodePaymentSignature(encoded: string): PaymentPayload {
  return decodeBase64Json<PaymentPayload>(encoded);
}

export function encodePaymentResponse(response: SettlementResponse): string {
  return encodeBase64Json(response);
}

export function decodePaymentResponse(encoded: string): SettlementResponse {
  return decodeBase64Json<SettlementResponse>(encoded);
}
