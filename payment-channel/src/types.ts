import type { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import type { OtomatRail } from './types/otomat-rail-idl.js';

export type ChannelStatus = 'open' | 'closed' | 'disputed';

/** A payer to payee channel and its last observed on-chain state. */
export interface Channel {
  pda: string;
  payer: string;
  payee: string;
  mint: string;
  deposit: string;
  cumulativeAmount: string;
  nonce: string;
  expiry: number;
  status: ChannelStatus;
  facilitator: string;
}

/**
 * An off-chain, Ed25519-signed cumulative authorization. The `message` is the
 * base64 of the canonical check bytes that were signed; `signature` is the
 * base58 Ed25519 signature over those bytes. This shape is byte-identical to
 * the `Check` exported by @otomat/sdk.
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
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
  signTransaction?<T>(tx: T): Promise<T>;
}

export type ChannelSigner = Keypair | WalletAdapterLike;

export interface ChannelConfig {
  connection: Connection;
  program?: Program<OtomatRail>;
  programId?: PublicKey;
  payer: ChannelSigner;
  facilitator: PublicKey;
}
