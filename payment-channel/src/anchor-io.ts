import {
  Ed25519Program,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type BN from 'bn.js';
import { i64ToLeBytes, u64ToLeBytes, type Numeric } from './canonical-message.js';

/**
 * Anchor instruction discriminators (first 8 bytes of sha256("global:<name>")).
 * These are the client-side contract reconciled with the on-chain program.
 */
export const CHANNEL_DISCRIMINATORS = {
  openChannel: Uint8Array.from([91, 45, 253, 71, 140, 166, 107, 109]),
  closeChannel: Uint8Array.from([0, 104, 36, 1, 66, 0, 103, 157]),
  disputeChannel: Uint8Array.from([62, 30, 173, 35, 100, 219, 251, 118]),
  timeoutReclaim: Uint8Array.from([57, 19, 28, 96, 44, 229, 135, 216]),
} as const;

const CHANNEL_SEED = Buffer.from('channel');

function concatBytes(...parts: Uint8Array[]): Buffer {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = Buffer.alloc(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Derive the channel PDA from seeds ["channel", payer, payee]. */
export function deriveChannelPda(
  programId: PublicKey,
  payer: PublicKey,
  payee: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CHANNEL_SEED, payer.toBuffer(), payee.toBuffer()],
    programId,
  );
}

export interface Ed25519VerifyParams {
  publicKey: PublicKey;
  message: Uint8Array;
  signature: Uint8Array;
}

/**
 * Build the Ed25519Program verification instruction that must be placed
 * immediately before a close/dispute instruction so the on-chain program can
 * inspect it through the instructions sysvar.
 */
export function buildEd25519VerifyIx(params: Ed25519VerifyParams): TransactionInstruction {
  if (params.signature.length !== 64) throw new RangeError('signature must be 64 bytes');
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: params.publicKey.toBytes(),
    message: params.message,
    signature: params.signature,
  });
}

export interface OpenChannelIxParams {
  programId: PublicKey;
  channel: PublicKey;
  payer: PublicKey;
  payerTokenAccount: PublicKey;
  escrowTokenAccount: PublicKey;
  mint: PublicKey;
  payee: PublicKey;
  facilitator: PublicKey;
  deposit: BN | Numeric;
  expiry: BN | Numeric;
  tokenProgram?: PublicKey;
}

export function buildOpenChannelIx(params: OpenChannelIxParams): TransactionInstruction {
  const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;
  const data = concatBytes(
    CHANNEL_DISCRIMINATORS.openChannel,
    u64ToLeBytes(params.deposit),
    i64ToLeBytes(params.expiry),
  );
  const keys = [
    { pubkey: params.channel, isSigner: false, isWritable: true },
    { pubkey: params.payer, isSigner: true, isWritable: true },
    { pubkey: params.payerTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.escrowTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.payee, isSigner: false, isWritable: false },
    { pubkey: params.facilitator, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId: params.programId, keys, data });
}

export interface SettleChannelIxParams {
  programId: PublicKey;
  channel: PublicKey;
  payer: PublicKey;
  payee: PublicKey;
  payeeTokenAccount: PublicKey;
  payerTokenAccount: PublicKey;
  escrowTokenAccount: PublicKey;
  mint: PublicKey;
  facilitator: PublicKey;
  cumulativeAmount: BN | Numeric;
  nonce: BN | Numeric;
  signature: Uint8Array;
  tokenProgram?: PublicKey;
}

function settleData(discriminator: Uint8Array, params: SettleChannelIxParams): Buffer {
  if (params.signature.length !== 64) throw new RangeError('signature must be 64 bytes');
  return concatBytes(
    discriminator,
    u64ToLeBytes(params.cumulativeAmount),
    u64ToLeBytes(params.nonce),
    params.signature,
  );
}

export function buildCloseChannelIx(params: SettleChannelIxParams): TransactionInstruction {
  const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;
  const keys = [
    { pubkey: params.channel, isSigner: false, isWritable: true },
    { pubkey: params.payer, isSigner: true, isWritable: true },
    { pubkey: params.payee, isSigner: false, isWritable: false },
    { pubkey: params.payeeTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.payerTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.escrowTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.facilitator, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data: settleData(CHANNEL_DISCRIMINATORS.closeChannel, params),
  });
}

export function buildDisputeChannelIx(params: SettleChannelIxParams): TransactionInstruction {
  const keys = [
    { pubkey: params.channel, isSigner: false, isWritable: true },
    { pubkey: params.payer, isSigner: true, isWritable: true },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data: settleData(CHANNEL_DISCRIMINATORS.disputeChannel, params),
  });
}

export interface TimeoutReclaimIxParams {
  programId: PublicKey;
  channel: PublicKey;
  payer: PublicKey;
  payerTokenAccount: PublicKey;
  escrowTokenAccount: PublicKey;
  mint: PublicKey;
  tokenProgram?: PublicKey;
}

export function buildTimeoutReclaimIx(params: TimeoutReclaimIxParams): TransactionInstruction {
  const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;
  const keys = [
    { pubkey: params.channel, isSigner: false, isWritable: true },
    { pubkey: params.payer, isSigner: true, isWritable: true },
    { pubkey: params.payerTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.escrowTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data: concatBytes(CHANNEL_DISCRIMINATORS.timeoutReclaim),
  });
}
