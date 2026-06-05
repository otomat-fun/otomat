import type { X402Version } from './types.js';

/** Canonical x402 v2 header names. Centralised so a future v3 rename is one edit. */
export const X402_HEADERS = {
  PAYMENT_REQUIRED: 'PAYMENT-REQUIRED',
  PAYMENT_SIGNATURE: 'PAYMENT-SIGNATURE',
  PAYMENT_RESPONSE: 'PAYMENT-RESPONSE',
} as const;

/** Legacy x402 v1 header names, kept for backward compatibility. */
export const X402_HEADERS_V1 = {
  X_PAYMENT: 'X-PAYMENT',
  X_PAYMENT_RESPONSE: 'X-PAYMENT-RESPONSE',
} as const;

function toBase64(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf-8').toString('base64');
  }
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf-8');
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeBase64Json(value: unknown): string {
  return toBase64(JSON.stringify(value));
}

export function decodeBase64Json<T = unknown>(b64: string): T {
  return JSON.parse(fromBase64(b64.trim())) as T;
}

export type HeaderReader = (name: string) => string | undefined;

export interface DetectedPayment {
  version: X402Version;
  raw: string;
}

/** Detect an inbound payment header, preferring v2 (`PAYMENT-SIGNATURE`) over v1 (`X-PAYMENT`). */
export function detectPaymentHeader(read: HeaderReader): DetectedPayment | undefined {
  const v2 = read(X402_HEADERS.PAYMENT_SIGNATURE);
  if (v2) return { version: 2, raw: v2 };
  const v1 = read(X402_HEADERS_V1.X_PAYMENT);
  if (v1) return { version: 1, raw: v1 };
  return undefined;
}

/** Response header carrying the settlement, matched to the request's protocol version. */
export function paymentResponseHeaderName(version: X402Version): string {
  return version === 1 ? X402_HEADERS_V1.X_PAYMENT_RESPONSE : X402_HEADERS.PAYMENT_RESPONSE;
}
