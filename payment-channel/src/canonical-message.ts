import type BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Domain prefix for every canonical check message. Identical to the on-chain
 * constant `CHECK_MESSAGE_PREFIX = b"otomat/v2/check|"` (16 bytes, trailing '|'
 * included).
 */
export const CHECK_MESSAGE_PREFIX = 'otomat/v2/check|';

export type Numeric = BN | bigint | number;

function toBigInt(value: Numeric): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError('expected an integer value');
    return BigInt(value);
  }
  return BigInt(value.toString());
}

function toLeBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let n = value;
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

/** Serialize an unsigned 64-bit integer to 8 little-endian bytes. */
export function u64ToLeBytes(value: Numeric): Uint8Array {
  const n = toBigInt(value);
  if (n < 0n || n > 0xffffffffffffffffn) throw new RangeError('value out of u64 range');
  return toLeBytes(n);
}

/** Serialize a signed 64-bit integer to 8 little-endian bytes (two's complement). */
export function i64ToLeBytes(value: Numeric): Uint8Array {
  let n = toBigInt(value);
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (n < min || n > max) throw new RangeError('value out of i64 range');
  if (n < 0n) n += 1n << 64n;
  return toLeBytes(n);
}

export function u64ToLeHex(value: Numeric): string {
  return Buffer.from(u64ToLeBytes(value)).toString('hex');
}

export function i64ToLeHex(value: Numeric): string {
  return Buffer.from(i64ToLeBytes(value)).toString('hex');
}

export interface CanonicalCheckInput {
  channelPda: string;
  cumulativeAmount: Numeric;
  nonce: Numeric;
  expiry: Numeric;
}

/**
 * Canonical check message the payer Ed25519-signs and the on-chain program
 * reconstructs byte-for-byte in build_check_message:
 *   "otomat/v2/check|" (16B) || channelPda raw (32B)
 *     || cumulative u64 LE (8B) || nonce u64 LE (8B) || expiry i64 LE (8B)  = 72B
 * No separators between binary fields; the channel is the raw 32-byte public
 * key, NOT its base58 string.
 */
export function buildCanonicalCheckMessage(input: CanonicalCheckInput): Uint8Array {
  const prefix = new TextEncoder().encode(CHECK_MESSAGE_PREFIX);
  const channel = new PublicKey(input.channelPda).toBytes();
  const cumulative = u64ToLeBytes(input.cumulativeAmount);
  const nonce = u64ToLeBytes(input.nonce);
  const expiry = i64ToLeBytes(input.expiry);
  const out = new Uint8Array(prefix.length + channel.length + 24);
  let offset = 0;
  out.set(prefix, offset); offset += prefix.length;
  out.set(channel, offset); offset += channel.length;
  out.set(cumulative, offset); offset += 8;
  out.set(nonce, offset); offset += 8;
  out.set(expiry, offset);
  return out;
}
