import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { NETWORKS, USDC_MAINNET, X402_HEADERS, encodePaymentRequired } from '@otomat/sdk';
import type { PaymentAccount, PaymentRequirementItem, PaymentRequirements } from '@otomat/sdk';
import { AgentWallet } from '../src/agent-wallet.js';
import { PolicyViolationError } from '../src/spend-policy.js';

function fakeClient(): PaymentAccount {
  return {
    buildExactPayload: async (requirement: PaymentRequirementItem) => ({
      x402Version: 2,
      scheme: 'exact',
      network: requirement.network,
      accepted: requirement,
      payload: { transaction: 'TX' },
    }),
  };
}

function requirements(amount = '10000', asset = USDC_MAINNET): PaymentRequirements {
  return {
    x402Version: 2,
    resource: { url: 'https://api.example/paid' },
    accepts: [
      {
        scheme: 'exact',
        network: NETWORKS.SOLANA_MAINNET,
        amount,
        asset,
        payTo: 'PAYTO',
        extra: { feePayer: 'FEE' },
      },
    ],
  };
}

function fetch402Then200(reqs: PaymentRequirements) {
  const captured: { signature?: string | null } = {};
  let calls = 0;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (calls === 1) {
      const headers = new Headers();
      headers.set(X402_HEADERS.PAYMENT_REQUIRED, encodePaymentRequired(reqs));
      return new Response('pay', { status: 402, headers });
    }
    captured.signature = new Headers(init?.headers).get(X402_HEADERS.PAYMENT_SIGNATURE);
    return new Response('ok', { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, captured, calls: () => calls };
}

describe('AgentWallet', () => {
  it('pays a 402 within policy and tracks spend', async () => {
    const { fetchImpl, captured } = fetch402Then200(requirements('10000'));
    const wallet = new AgentWallet({
      keypair: Keypair.generate(),
      policy: { maxTotal: { amount: 1_000_000n, asset: USDC_MAINNET } },
      client: fakeClient(),
      fetchImpl,
      now: () => 0,
    });
    const response = await wallet.fetch('https://api.example/paid');
    expect(response.status).toBe(200);
    expect(typeof captured.signature).toBe('string');
    expect(wallet.getSpent().total).toBe(10000n);
    expect(wallet.getSpent().byAsset[USDC_MAINNET]).toBe(10000n);
  });

  it('throws and does not replay when the payment is over budget', async () => {
    const { fetchImpl, calls } = fetch402Then200(requirements('10000'));
    const wallet = new AgentWallet({
      keypair: Keypair.generate(),
      policy: { maxPerCall: { amount: 5000n, asset: USDC_MAINNET } },
      client: fakeClient(),
      fetchImpl,
      now: () => 0,
    });
    await expect(wallet.fetch('https://api.example/paid')).rejects.toBeInstanceOf(PolicyViolationError);
    expect(calls()).toBe(1);
    expect(wallet.getSpent().total).toBe(0n);
  });

  it('returns a non-402 response without paying', async () => {
    const fetchImpl = (async () => new Response('free', { status: 200 })) as unknown as typeof fetch;
    const wallet = new AgentWallet({ keypair: Keypair.generate(), policy: {}, client: fakeClient(), fetchImpl });
    const result = await wallet.pay('https://api.example/free');
    expect(result.paid).toBe(false);
    expect(result.response.status).toBe(200);
    expect(wallet.getSpent().total).toBe(0n);
  });

  it('enforces policy through buildExactPayload (MCP account path)', async () => {
    const wallet = new AgentWallet({
      keypair: Keypair.generate(),
      policy: { maxPerCall: { amount: 1000n, asset: USDC_MAINNET } },
      client: fakeClient(),
      now: () => 0,
    });
    const overBudget = requirements('5000').accepts[0]!;
    await expect(wallet.buildExactPayload(overBudget)).rejects.toBeInstanceOf(PolicyViolationError);

    const withinBudget = requirements('500').accepts[0]!;
    const payload = await wallet.buildExactPayload(withinBudget);
    expect(payload.scheme).toBe('exact');
    expect(wallet.getSpent().total).toBe(500n);
  });

  it('reset clears tracked spend', async () => {
    const { fetchImpl } = fetch402Then200(requirements('10000'));
    const wallet = new AgentWallet({
      keypair: Keypair.generate(),
      policy: {},
      client: fakeClient(),
      fetchImpl,
      now: () => 0,
    });
    await wallet.fetch('https://api.example/paid');
    expect(wallet.getSpent().total).toBe(10000n);
    wallet.reset();
    expect(wallet.getSpent().total).toBe(0n);
  });
});
