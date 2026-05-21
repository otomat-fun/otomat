import type { Keypair, PublicKey } from '@solana/web3.js';

/** Resource descriptor carried in a v2 PaymentRequirements object. */
export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

/** A single payment option offered by a resource server (one `accepts` entry). */
export interface PaymentRequirementItem {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: {
    feePayer?: string;
    channelPda?: string;
    channelNonce?: number;
    channelExpiry?: number;
    otomatProgramId?: string;
    [key: string]: unknown;
  };
}

/** The x402 v2 body of a 402 response. */
export interface PaymentRequirements {
  x402Version: number;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirementItem[];
  extensions?: Record<string, unknown>;
}

/** The x402 v2 body of a PAYMENT-SIGNATURE header. */
export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  accepted: PaymentRequirementItem;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

/** The x402 v2 body of a PAYMENT-RESPONSE header. */
export interface SettlementResponse {
  success: boolean;
  payer?: string;
  transaction?: string;
  network?: string;
  errorReason?: string;
}

/**
 * An off-chain, Ed25519-signed cumulative authorization for the otomat-channel
 * scheme. Byte-identical to the `Check` exported by @otomat/payment-channel.
 */
export interface Check {
  channelPda: string;
  cumulativeAmount: string;
  nonce: string;
  expiry: number;
  signature: string;
  message: string;
}

/** Minimal wallet-adapter surface accepted anywhere a Keypair is accepted. */
export interface WalletAdapterLike {
  publicKey: PublicKey;
  signTransaction?<T>(tx: T): Promise<T>;
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

export type SolanaSigner = Keypair | WalletAdapterLike;

/** Anything able to produce an exact payload for a requirement (e.g. an AgentWallet). */
export interface PaymentAccount {
  buildExactPayload(requirement: PaymentRequirementItem): Promise<PaymentPayload>;
}
