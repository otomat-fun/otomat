import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { decodeBase64Json } from '../src/headers.js';
import { otomat } from '../src/index.js';
import { BASE_CONFIG, FAILED_SETTLE, mockFacilitator, v1XPayment, v2PaymentSignature } from './helpers.js';
import type { FetchLike } from '../src/types.js';

function makeApp(fetch: FetchLike) {
  const app = express();
  app.get('/api/premium', otomat.express({ ...BASE_CONFIG, fetch }), (_req, res) => {
    res.json({ data: 'premium-content' });
  });
  return app;
}

describe('otomat.express', () => {
  it('returns 402 + PaymentRequirements when no payment header is present', async () => {
    const mock = mockFacilitator();
    const res = await request(makeApp(mock.fetch)).get('/api/premium');
    expect(res.status).toBe(402);
    expect(res.headers['payment-required']).toBeTruthy();
    expect(res.body.accepts[0].amount).toBe('2000');
    expect(res.body.accepts[0].payTo).toBe(BASE_CONFIG.payTo);
    expect(res.body.accepts[0].extra.feePayer).toBe(BASE_CONFIG.feePayer);
  });

  it('returns 402 invalid on a malformed base64 payload', async () => {
    const mock = mockFacilitator();
    const res = await request(makeApp(mock.fetch)).get('/api/premium').set('PAYMENT-SIGNATURE', '%%%not-base64%%%');
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('invalid_payment_payload');
    expect(mock.calls.verify).toBe(0);
  });

  it('returns 402 with errorReason when verify fails', async () => {
    const mock = mockFacilitator({ verify: { isValid: false, invalidReason: 'insufficient_funds' } });
    const res = await request(makeApp(mock.fetch)).get('/api/premium').set('PAYMENT-SIGNATURE', v2PaymentSignature());
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('insufficient_funds');
    expect(mock.calls.settle).toBe(0);
  });

  it('settles then returns 200 + PAYMENT-RESPONSE on success', async () => {
    const mock = mockFacilitator();
    const res = await request(makeApp(mock.fetch)).get('/api/premium').set('PAYMENT-SIGNATURE', v2PaymentSignature());
    expect(res.status).toBe(200);
    expect(res.body.data).toBe('premium-content');
    const settlement = decodeBase64Json<{ success: boolean; transaction: string }>(res.headers['payment-response']);
    expect(settlement.success).toBe(true);
    expect(settlement.transaction).toBe('SETTLED_SIGNATURE');
    expect(mock.calls.verify).toBe(1);
    expect(mock.calls.settle).toBe(1);
  });

  it('returns 402 when settle fails', async () => {
    const mock = mockFacilitator({ settle: FAILED_SETTLE });
    const res = await request(makeApp(mock.fetch)).get('/api/premium').set('PAYMENT-SIGNATURE', v2PaymentSignature());
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('settlement_failed');
  });

  it('accepts a v1 X-PAYMENT header and replies with X-PAYMENT-RESPONSE', async () => {
    const mock = mockFacilitator();
    const res = await request(makeApp(mock.fetch)).get('/api/premium').set('X-PAYMENT', v1XPayment());
    expect(res.status).toBe(200);
    expect(res.headers['x-payment-response']).toBeTruthy();
    expect(res.headers['payment-response']).toBeUndefined();
    expect(res.body.data).toBe('premium-content');
  });
});
