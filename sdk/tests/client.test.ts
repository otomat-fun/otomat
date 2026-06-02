import { describe, expect, it, vi } from 'vitest';

vi.mock('@solana/spl-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/spl-token')>();
  return { ...actual, getMint: async () => ({ decimals: 6 }) };
});

import { type Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { OtomatClient } from '../src/client.js';
import { NETWORKS, USDC_MAINNET, X402_HEADERS, encodePaymentRequired } from '../src/headers.js';
import type { PaymentRequirements } from '../src/types.js';

describe('OtomatClient.fetch', () => {
  it('pays a 402 challenge and replays with a PAYMENT-SIGNATURE header', async () => {
    const payer = Keypair.generate();
    const feePayer = Keypair.generate().publicKey;
    const payTo = Keypair.generate().publicKey;
    const requirements: PaymentRequirements = {
      x402Version: 2,
      resource: { url: 'https://api.example/x' },
      accepts: [
        {
          scheme: 'exact',
          network: NETWORKS.SOLANA_MAINNET,
          amount: '10000',
          asset: USDC_MAINNET,
          payTo: payTo.toBase58(),
          extra: { feePayer: feePayer.toBase58() },
        },
      ],
    };

    let calls = 0;
    let signatureHeader: string | null = null;
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        const headers = new Headers();
        headers.set(X402_HEADERS.PAYMENT_REQUIRED, encodePaymentRequired(requirements));
        return new Response('payment required', { status: 402, headers });
      }
      signatureHeader = new Headers(init?.headers).get(X402_HEADERS.PAYMENT_SIGNATURE);
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const blockhash = bs58.encode(new Uint8Array(32).fill(5));
    const connection = {
      getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 1 }),
    } as unknown as Connection;

    const client = new OtomatClient({ payer, connection, fetchImpl });
    const response = await client.fetch('https://api.example/x');

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(typeof signatureHeader).toBe('string');
  });

  it('returns a non-402 response untouched', async () => {
    const payer = Keypair.generate();
    const fetchImpl = (async () => new Response('hello', { status: 200 })) as unknown as typeof fetch;
    const connection = {
      getLatestBlockhash: async () => ({ blockhash: bs58.encode(new Uint8Array(32)), lastValidBlockHeight: 1 }),
    } as unknown as Connection;
    const client = new OtomatClient({ payer, connection, fetchImpl });
    const response = await client.fetch('https://api.example/free');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello');
  });
});
