import { describe, expect, it } from 'vitest';
import { parsePrice } from '../src/price.js';

describe('parsePrice', () => {
  it('parses dollar strings into 6-decimal atomic USDC', () => {
    expect(parsePrice('$0.002')).toEqual({ amount: '2000', decimals: 6 });
  });

  it('parses "0.002 USDC"', () => {
    expect(parsePrice('0.002 USDC')).toEqual({ amount: '2000', decimals: 6 });
  });

  it('parses whole-unit prices', () => {
    expect(parsePrice('1')).toEqual({ amount: '1000000', decimals: 6 });
    expect(parsePrice('$1.5')).toEqual({ amount: '1500000', decimals: 6 });
  });

  it('passes through atomic strings', () => {
    expect(parsePrice('2000usdc-atomic')).toEqual({ amount: '2000', decimals: 6 });
    expect(parsePrice('2000 atomic')).toEqual({ amount: '2000', decimals: 6 });
  });

  it('passes through explicit { amount, decimals }', () => {
    expect(parsePrice({ amount: '2000', decimals: 6 })).toEqual({ amount: '2000', decimals: 6 });
  });

  it('throws on sub-atomic precision', () => {
    expect(() => parsePrice('0.0000001')).toThrow();
  });

  it('throws on unparseable input', () => {
    expect(() => parsePrice('abc')).toThrow();
  });
});
