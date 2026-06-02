import { describe, expect, it } from 'vitest';
import {
  decodePaymentRequired,
  decodePaymentResponse,
  decodePaymentSignature,
  encodePaymentRequired,
  encodePaymentResponse,
  encodePaymentSignature,
} from '../src/headers.js';
import { paymentRequirementsSchema } from '../src/schemas.js';
import { parsePrice } from '../src/mcp.js';
import type { PaymentPayload, PaymentRequirements, SettlementResponse } from '../src/types.js';

const requirements: PaymentRequirements = {
  x402Version: 2,
  resource: { url: 'https://api.example/x' },
  accepts: [
    { scheme: 'exact', network: 'solana:mainnet', amount: '10000', asset: 'USDC', payTo: 'PAYTO' },
  ],
};

describe('header codecs', () => {
  it('round-trips a PAYMENT-REQUIRED value', () => {
    expect(decodePaymentRequired(encodePaymentRequired(requirements))).toEqual(requirements);
  });

  it('round-trips PAYMENT-SIGNATURE and PAYMENT-RESPONSE values', () => {
    const payload: PaymentPayload = {
      x402Version: 2,
      scheme: 'exact',
      network: 'solana:mainnet',
      accepted: requirements.accepts[0]!,
      payload: { transaction: 'base64tx' },
    };
    const settlement: SettlementResponse = {
      success: true,
      payer: 'P',
      transaction: 'SIG',
      network: 'solana:mainnet',
    };
    expect(decodePaymentSignature(encodePaymentSignature(payload))).toEqual(payload);
    expect(decodePaymentResponse(encodePaymentResponse(settlement))).toEqual(settlement);
  });
});

describe('schemas', () => {
  it('accepts valid requirements and rejects malformed ones', () => {
    expect(paymentRequirementsSchema.safeParse(requirements).success).toBe(true);
    expect(paymentRequirementsSchema.safeParse({ x402Version: 'two' }).success).toBe(false);
  });
});

describe('parsePrice', () => {
  it('converts dollar and numeric prices to USDC smallest units', () => {
    expect(parsePrice('$0.002')).toBe('2000');
    expect(parsePrice('0.002')).toBe('2000');
    expect(parsePrice(0.01)).toBe('10000');
    expect(parsePrice(1)).toBe('1000000');
  });

  it('rejects invalid prices', () => {
    expect(() => parsePrice('free')).toThrow();
    expect(() => parsePrice(-1)).toThrow();
  });
});
