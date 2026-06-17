import type BN from 'bn.js';

/** Domain prefix for every canonical check message. */
export const CHECK_MESSAGE_PREFIX = 'otomat/v2/check';

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
 * Build the canonical check string:
 *   otomat/v2/check|{channelPda}|{cumulative_le_hex}|{nonce_le_hex}|{expiry_le_hex}
 */
export function buildCanonicalCheckString(input: CanonicalCheckInput): string {
  return [
    CHECK_MESSAGE_PREFIX,
    input.channelPda,
    u64ToLeHex(input.cumulativeAmount),
    u64ToLeHex(input.nonce),
    i64ToLeHex(input.expiry),
  ].join('|');
}

/** UTF-8 bytes of the canonical check string; this is what gets Ed25519-signed. */
export function buildCanonicalCheckMessage(input: CanonicalCheckInput): Uint8Array {
  return new TextEncoder().encode(buildCanonicalCheckString(input));
}
