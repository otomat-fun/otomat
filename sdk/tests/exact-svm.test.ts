import { describe, expect, it } from 'vitest';
import {
  ComputeBudgetProgram,
  type Connection,
  Keypair,
  type MessageV0,
  VersionedTransaction,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { buildExactPayload } from '../src/exact-svm.js';
import { buildChannelPayload, verifyCheckSignature } from '../src/otomat-channel-scheme.js';
import { NETWORKS, USDC_MAINNET } from '../src/headers.js';
import type { Check, PaymentRequirementItem } from '../src/types.js';

function mockConnection(): Connection {
  const blockhash = bs58.encode(new Uint8Array(32).fill(9));
  return {
    getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 1 }),
  } as unknown as Connection;
}

describe('exact-svm buildExactPayload', () => {
  it('builds a v0 transaction with the strict instruction order and facilitator fee payer', async () => {
    const payer = Keypair.generate();
    const feePayer = Keypair.generate().publicKey;
    const payTo = Keypair.generate().publicKey;
    const requirement: PaymentRequirementItem = {
      scheme: 'exact',
      network: NETWORKS.SOLANA_MAINNET,
      amount: '10000',
      asset: USDC_MAINNET,
      payTo: payTo.toBase58(),
      maxTimeoutSeconds: 60,
      extra: { feePayer: feePayer.toBase58() },
    };
    const result = await buildExactPayload({
      requirement,
      payer,
      connection: mockConnection(),
      decimals: 6,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    expect(result.scheme).toBe('exact');
    const encoded = result.payload.transaction as string;
    const tx = VersionedTransaction.deserialize(Buffer.from(encoded, 'base64'));
    const message = tx.message as MessageV0;
    expect(message.staticAccountKeys[0]!.equals(feePayer)).toBe(true);
    const ixs = message.compiledInstructions;
    expect(ixs.length).toBe(3);
    expect(message.staticAccountKeys[ixs[0]!.programIdIndex]!.equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(message.staticAccountKeys[ixs[1]!.programIdIndex]!.equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(message.staticAccountKeys[ixs[2]!.programIdIndex]!.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  it('throws when the requirement omits the fee payer', async () => {
    const payer = Keypair.generate();
    const requirement: PaymentRequirementItem = {
      scheme: 'exact',
      network: NETWORKS.SOLANA_MAINNET,
      amount: '1',
      asset: USDC_MAINNET,
      payTo: Keypair.generate().publicKey.toBase58(),
    };
    await expect(
      buildExactPayload({ requirement, payer, connection: mockConnection(), decimals: 6 }),
    ).rejects.toThrow();
  });
});

describe('otomat-channel payload', () => {
  const check: Check = {
    channelPda: 'GLassSLot1111111111111111111111111111111111',
    cumulativeAmount: '50000',
    nonce: '42',
    expiry: 1780000000,
    signature: 'sig',
    message: 'bXNn',
  };

  it('maps a check into an otomat-channel payload', () => {
    const payload = buildChannelPayload(check);
    expect(payload.scheme).toBe('otomat-channel');
    expect(payload.payload.check).toEqual({
      channelPda: check.channelPda,
      cumulativeAmount: '50000',
      nonce: '42',
      expiry: 1780000000,
    });
    expect(payload.payload.signature).toBe('sig');
  });

  it('verifies a check signature produced by a keypair', () => {
    const payer = Keypair.generate();
    const message = Buffer.from('otomat/v2/check|demo|payload');
    const signature = bs58.encode(nacl.sign.detached(message, payer.secretKey));
    const signed: Check = {
      channelPda: 'demo',
      cumulativeAmount: '1',
      nonce: '1',
      expiry: 1,
      signature,
      message: message.toString('base64'),
    };
    expect(verifyCheckSignature(signed, payer.publicKey)).toBe(true);
    expect(verifyCheckSignature(signed, Keypair.generate().publicKey)).toBe(false);
  });
});
