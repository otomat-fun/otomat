import { describe, expect, it } from 'vitest';
import BN from 'bn.js';
import {
  buildCanonicalCheckMessage,
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

  it('matches the on-chain build_check_message byte layout (known answer)', () => {
    const msg = buildCanonicalCheckMessage({
      channelPda: 'FwFC1nDo5r224uXDeTMc2X8FhXuiz9CqBF7tg3trEVhN',
      cumulativeAmount: 50000,
      nonce: 42,
      expiry: 1780000000,
    });
    expect(Buffer.from(msg).toString('hex')).toBe(
      '6f746f6d61742f76322f636865636b7cdde9067482854fdce74d63f7593eb97ee751c4334fe11d99599ea33a371d190d50c30000000000002a0000000000000000a5186a00000000',
    );
    expect(msg.length).toBe(72);
  });
});
