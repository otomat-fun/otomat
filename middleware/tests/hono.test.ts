import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { decodeBase64Json } from '../src/headers.js';
import { otomat } from '../src/index.js';
import { BASE_CONFIG, FAILED_SETTLE, mockFacilitator, v2PaymentSignature } from './helpers.js';
import type { FetchLike } from '../src/types.js';

function makeApp(fetch: FetchLike) {
  const app = new Hono();
  app.get('/api/premium', otomat.hono({ ...BASE_CONFIG, fetch }), (c) => c.json({ data: 'premium-content' }));
  return app;
}

describe('otomat.hono', () => {
  it('returns 402 when no payment header is present', async () => {
    const res = await makeApp(mockFacilitator().fetch).request('/api/premium');
    expect(res.status).toBe(402);
    expect(res.headers.get('PAYMENT-REQUIRED')).toBeTruthy();
    const body = await res.json();
    expect(body.accepts[0].amount).toBe('2000');
  });

  it('settles then returns 200 + PAYMENT-RESPONSE', async () => {
    const res = await makeApp(mockFacilitator().fetch).request('/api/premium', {
      headers: { 'PAYMENT-SIGNATURE': v2PaymentSignature() },
    });
    expect(res.status).toBe(200);
    const settlement = decodeBase64Json<{ success: boolean }>(res.headers.get('PAYMENT-RESPONSE')!);
    expect(settlement.success).toBe(true);
    const body = await res.json();
    expect(body.data).toBe('premium-content');
  });

  it('returns 402 with errorReason when verify fails', async () => {
    const res = await makeApp(
      mockFacilitator({ verify: { isValid: false, invalidReason: 'insufficient_funds' } }).fetch,
    ).request('/api/premium', { headers: { 'PAYMENT-SIGNATURE': v2PaymentSignature() } });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('insufficient_funds');
  });

  it('returns 402 when settle fails', async () => {
    const res = await makeApp(mockFacilitator({ settle: FAILED_SETTLE }).fetch).request('/api/premium', {
      headers: { 'PAYMENT-SIGNATURE': v2PaymentSignature() },
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('settlement_failed');
  });
});
