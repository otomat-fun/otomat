import { z } from 'zod';

export type X402Version = 1 | 2;

/** Friendly payment asset names with built-in mint resolution. */
export type PaymentAsset = 'USDC' | 'SOL';

export type PriceInput = string | { amount: string; decimals: number };

export interface OtomatConfig {
  /** `'$0.002'`, `'0.002 USDC'`, `'2000usdc-atomic'`, or `{ amount, decimals }`. */
  price: PriceInput;
  /** Friendly asset name or explicit mint. Defaults to USDC. */
  asset?: 'USDC' | 'SOL' | string;
  /** CAIP-2 id or alias (`'solana:mainnet'`, `'solana:devnet'`). Defaults to mainnet. */
  network?: 'solana:mainnet' | 'solana:devnet' | string;
  /** Payee Solana pubkey. Required (or set the OTOMAT_PAY_TO env var). */
  payTo?: string;
  /** Facilitator base URL. Defaults to https://facilitator.otomat.fi. */
  facilitatorUrl?: string;
  scheme?: 'exact' | 'otomat-channel' | string;
  maxTimeoutSeconds?: number;
  description?: string;
  mimeType?: string;
  /** Facilitator SOL fee payer. If omitted, it is fetched from `/supported`. */
  feePayer?: string;
  extra?: Record<string, unknown>;
  x402Version?: X402Version;
  onSettled?: (result: SettleResult) => void | Promise<void>;
  onError?: (err: Error, req: unknown) => void;
  /** Override the fetch implementation used to reach the facilitator (tests / edge). */
  fetch?: FetchLike;
}

export interface PaymentResource {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequirementItem {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface PaymentRequirements {
  x402Version: X402Version;
  error: string;
  resource: PaymentResource;
  accepts: PaymentRequirementItem[];
  extensions: Record<string, unknown>;
}

export interface PaymentPayload {
  x402Version: X402Version;
  scheme: string;
  network: string;
  accepted?: Record<string, unknown>;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface VerifyResponse {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
}

export interface SettleResult {
  success: boolean;
  payer?: string;
  transaction: string;
  network: string;
  errorReason?: string;
}

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

/** Loose runtime validation for a decoded PaymentPayload (the facilitator does the on-chain checks). */
export const paymentPayloadSchema = z.object({
  x402Version: z.union([z.literal(1), z.literal(2)]).optional(),
  scheme: z.string().min(1),
  network: z.string().min(1),
  accepted: z.record(z.unknown()).optional(),
  payload: z.record(z.unknown()),
  extensions: z.record(z.unknown()).optional(),
});
