import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  PAYMENT_REQUIRED_META,
  PAYMENT_RESPONSE_META,
  type FacilitatorLike,
  type McpCallToolClient,
  type PaidToolServer,
  paidTool,
  withPayment,
} from '../src/mcp.js';
import { encodePaymentRequired } from '../src/headers.js';
import type { PaymentAccount, PaymentRequirements } from '../src/types.js';

type CapturedTool = {
  name: string;
  config: unknown;
  cb: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

describe('paidTool', () => {
  it('returns PAYMENT-REQUIRED without payment and settles with a valid payment', async () => {
    let captured: CapturedTool | undefined;
    const server = {
      registerTool: (name: string, config: unknown, cb: CapturedTool['cb']) => {
        captured = { name, config, cb };
        return {};
      },
    } as unknown as PaidToolServer;

    const facilitator: FacilitatorLike = {
      verify: async () => ({ isValid: true, payer: 'PAYER' }),
      settle: async () => ({ success: true, payer: 'PAYER', transaction: 'SIG', network: 'solana:mainnet' }),
    };

    let handled = false;
    paidTool(server, {
      name: 'premium_query',
      price: '$0.002',
      payTo: 'PAYTO',
      schema: z.object({ query: z.string() }),
      facilitator,
      handler: async (args) => {
        handled = true;
        return { content: [{ type: 'text', text: `q=${String(args.query)}` }] };
      },
    });

    const cb = captured!.cb;

    const noPayment = await cb({ query: 'hi' });
    expect(noPayment.isError).toBe(true);
    expect(typeof (noPayment._meta as Record<string, unknown>)[PAYMENT_REQUIRED_META]).toBe('string');
    expect(handled).toBe(false);

    const payment = Buffer.from(
      JSON.stringify({ x402Version: 2, scheme: 'exact', network: 'n', accepted: {}, payload: {} }),
      'utf8',
    ).toString('base64');
    const withPay = await cb({ query: 'hi', x402Payment: payment });
    expect(handled).toBe(true);
    expect((withPay.content as Array<{ text: string }>)[0]!.text).toBe('q=hi');
    expect(typeof (withPay._meta as Record<string, unknown>)[PAYMENT_RESPONSE_META]).toBe('string');
  });

  it('rejects a payment the facilitator marks invalid', async () => {
    let captured: CapturedTool | undefined;
    const server = {
      registerTool: (name: string, config: unknown, cb: CapturedTool['cb']) => {
        captured = { name, config, cb };
        return {};
      },
    } as unknown as PaidToolServer;
    const facilitator: FacilitatorLike = {
      verify: async () => ({ isValid: false, invalidReason: 'insufficient_funds' }),
      settle: async () => ({ success: false, errorReason: 'insufficient_funds' }),
    };
    let handled = false;
    paidTool(server, {
      name: 'premium_query',
      price: 0.01,
      payTo: 'PAYTO',
      schema: z.object({ query: z.string() }),
      facilitator,
      handler: async () => {
        handled = true;
        return { content: [] };
      },
    });
    const payment = Buffer.from(JSON.stringify({ scheme: 'exact' }), 'utf8').toString('base64');
    const result = await captured!.cb({ query: 'hi', x402Payment: payment });
    expect(result.isError).toBe(true);
    expect(handled).toBe(false);
  });
});

describe('withPayment', () => {
  it('replays a tool call with a payment when it returns PAYMENT-REQUIRED', async () => {
    const requirements: PaymentRequirements = {
      x402Version: 2,
      resource: { url: 'premium_query' },
      accepts: [
        {
          scheme: 'exact',
          network: 'solana:mainnet',
          amount: '2000',
          asset: 'USDC',
          payTo: 'PAYTO',
          extra: { feePayer: 'FEE' },
        },
      ],
    };

    let calls = 0;
    let replayedArgs: Record<string, unknown> | undefined;
    const client: McpCallToolClient = {
      callTool: async (params) => {
        calls += 1;
        if (calls === 1) {
          return { isError: true, content: [], _meta: { [PAYMENT_REQUIRED_META]: encodePaymentRequired(requirements) } };
        }
        replayedArgs = params.arguments;
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    };

    const account: PaymentAccount = {
      buildExactPayload: async (requirement) => ({
        x402Version: 2,
        scheme: 'exact',
        network: requirement.network,
        accepted: requirement,
        payload: { transaction: 'TX' },
      }),
    };

    const paid = withPayment(client, { account });
    const result = await paid.callTool({ name: 'premium_query', arguments: { query: 'hi' } });

    expect(calls).toBe(2);
    expect((result.content as Array<{ text: string }>)[0]!.text).toBe('ok');
    expect(typeof replayedArgs?.x402Payment).toBe('string');
    expect(replayedArgs?.query).toBe('hi');
  });
});
