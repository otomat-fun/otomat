import { describe, expect, it } from 'vitest';
import { decodeBase64Json } from '../src/headers.js';
import { otomat } from '../src/index.js';
import { BASE_CONFIG, FAILED_SETTLE, mockFacilitator, v2PaymentSignature } from './helpers.js';
import type { FetchLike } from '../src/types.js';

type Handler = (req: Request) => Promise<Response>;

function makeHandler(fetch: FetchLike): Handler {
  return otomat.next({ ...BASE_CONFIG, fetch }, async () =>
    Response.json({ data: 'premium-content' }),
  ) as unknown as Handler;
}

function req(headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/premium', { headers });
}

describe('otomat.next', () => {
  it('returns 402 when no payment header is present', async () => {
    const res = await makeHandler(mockFacilitator().fetch)(req());
    expect(res.status).toBe(402);
    expect(res.headers.get('PAYMENT-REQUIRED')).toBeTruthy();
    const body = await res.json();
    expect(body.accepts[0].amount).toBe('2000');
  });

  it('settles then returns 200 + PAYMENT-RESPONSE', async () => {
    const res = await makeHandler(mockFacilitator().fetch)(req({ 'PAYMENT-SIGNATURE': v2PaymentSignature() }));
    expect(res.status).toBe(200);
    const settlement = decodeBase64Json<{ success: boolean }>(res.headers.get('PAYMENT-RESPONSE')!);
    expect(settlement.success).toBe(true);
    const body = await res.json();
    expect(body.data).toBe('premium-content');
  });

  it('returns 402 when settle fails', async () => {
    const res = await makeHandler(mockFacilitator({ settle: FAILED_SETTLE }).fetch)(
      req({ 'PAYMENT-SIGNATURE': v2PaymentSignature() }),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('settlement_failed');
  });
});
