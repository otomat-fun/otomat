import { describe, expect, it } from 'vitest';
import BN from 'bn.js';
import {
  CHECK_MESSAGE_PREFIX,
  buildCanonicalCheckMessage,
  buildCanonicalCheckString,
  i64ToLeHex,
  u64ToLeHex,
} from '../src/canonical-message.js';

describe('canonical message encoders', () => {
  it('encodes u64 little-endian hex for known vectors', () => {
    expect(u64ToLeHex(100000)).toBe('a086010000000000');
    expect(u64ToLeHex(50000)).toBe('50c3000000000000');
    expect(u64ToLeHex(42)).toBe('2a00000000000000');
    expect(u64ToLeHex(0n)).toBe('0000000000000000');
    expect(u64ToLeHex(new BN('100000'))).toBe('a086010000000000');
  });

  it('encodes i64 identically to u64 for positive values', () => {
    expect(i64ToLeHex(1780000000)).toBe(u64ToLeHex(1780000000));
  });

  it('rejects out-of-range values', () => {
    expect(() => u64ToLeHex(-1)).toThrow();
    expect(() => u64ToLeHex(2n ** 64n)).toThrow();
  });

  it('builds the canonical check string in the exact pipe format', () => {
    const pda = 'GLassSLot1111111111111111111111111111111111';
    const built = buildCanonicalCheckString({
      channelPda: pda,
      cumulativeAmount: 50000,
      nonce: 42,
      expiry: 1780000000,
    });
    expect(built).toBe(
      `otomat/v2/check|${pda}|50c3000000000000|2a00000000000000|${i64ToLeHex(1780000000)}`,
    );
    expect(built.startsWith(`${CHECK_MESSAGE_PREFIX}|`)).toBe(true);
  });

  it('produces UTF-8 bytes matching the canonical string', () => {
    const input = { channelPda: 'abc', cumulativeAmount: 1, nonce: 2, expiry: 3 };
    const bytes = buildCanonicalCheckMessage(input);
    expect(Buffer.from(bytes).toString('utf8')).toBe(buildCanonicalCheckString(input));
  });
});
