import { describe, expect, it } from 'vitest';
import { Connection, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { ChannelClient } from '../src/channel-client.js';
import { buildCanonicalCheckMessage } from '../src/canonical-message.js';
import { deriveChannelPda } from '../src/anchor-io.js';
import { OTOMAT_RAIL_PROGRAM_ID } from '../src/types/otomat-rail-idl.js';
import type { Channel, WalletAdapterLike } from '../src/types.js';

function mockConnection(): Connection {
  const blockhash = bs58.encode(new Uint8Array(32).fill(7));
  return {
    getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 1 }),
    sendRawTransaction: async () => 'mock-signature',
    confirmTransaction: async () => ({ value: { err: null } }),
  } as unknown as Connection;
}

const facilitator = Keypair.generate().publicKey;

describe('ChannelClient', () => {
  it('opens a channel and derives the expected PDA', async () => {
    const payer = Keypair.generate();
    const payee = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const client = new ChannelClient({
      connection: mockConnection(),
      payer,
      facilitator,
      programId: OTOMAT_RAIL_PROGRAM_ID,
    });
    const channel = await client.open(payee, mint, new BN(1_000_000), 1780000000);
    const [pda] = deriveChannelPda(OTOMAT_RAIL_PROGRAM_ID, payer.publicKey, payee);
    expect(channel.status).toBe('open');
    expect(channel.pda).toBe(pda.toBase58());
    expect(channel.deposit).toBe('1000000');
    expect(channel.nonce).toBe('0');
    expect(channel.cumulativeAmount).toBe('0');
  });

  it('signs a check whose Ed25519 signature verifies against the payer key', async () => {
    const payer = Keypair.generate();
    const payee = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const client = new ChannelClient({
      connection: mockConnection(),
      payer,
      facilitator,
      programId: OTOMAT_RAIL_PROGRAM_ID,
    });
    const channel = await client.open(payee, mint, new BN(1_000_000), 1780000000);
    const check = await client.signCheck(channel, new BN(50000), new BN(42));
    const message = buildCanonicalCheckMessage({
      channelPda: channel.pda,
      cumulativeAmount: new BN(50000),
      nonce: new BN(42),
      expiry: channel.expiry,
    });
    expect(nacl.sign.detached.verify(message, bs58.decode(check.signature), payer.publicKey.toBytes())).toBe(true);
    expect(Buffer.from(check.message, 'base64').equals(Buffer.from(message))).toBe(true);
    expect(check.cumulativeAmount).toBe('50000');
    expect(check.nonce).toBe('42');
    expect(check.expiry).toBe(1780000000);
  });

  it('signs a check through a wallet adapter signMessage', async () => {
    const kp = Keypair.generate();
    const payee = Keypair.generate().publicKey;
    const adapter: WalletAdapterLike = {
      publicKey: kp.publicKey,
      signMessage: async (m) => nacl.sign.detached(m, kp.secretKey),
    };
    const client = new ChannelClient({
      connection: mockConnection(),
      payer: adapter,
      facilitator,
      programId: OTOMAT_RAIL_PROGRAM_ID,
    });
    const [pda] = deriveChannelPda(OTOMAT_RAIL_PROGRAM_ID, kp.publicKey, payee);
    const channel: Channel = {
      pda: pda.toBase58(),
      payer: kp.publicKey.toBase58(),
      payee: payee.toBase58(),
      mint: Keypair.generate().publicKey.toBase58(),
      deposit: '1000000',
      cumulativeAmount: '0',
      nonce: '0',
      expiry: 1780000000,
      status: 'open',
      facilitator: facilitator.toBase58(),
    };
    const check = await client.signCheck(channel, new BN(70000), new BN(43));
    const message = buildCanonicalCheckMessage({
      channelPda: channel.pda,
      cumulativeAmount: new BN(70000),
      nonce: new BN(43),
      expiry: channel.expiry,
    });
    expect(nacl.sign.detached.verify(message, bs58.decode(check.signature), kp.publicKey.toBytes())).toBe(true);
  });

  it('submits close and timeoutReclaim through the connection', async () => {
    const payer = Keypair.generate();
    const payee = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const client = new ChannelClient({
      connection: mockConnection(),
      payer,
      facilitator,
      programId: OTOMAT_RAIL_PROGRAM_ID,
    });
    const channel = await client.open(payee, mint, new BN(1_000_000), 1780000000);
    const check = await client.signCheck(channel, new BN(50000), new BN(42));
    expect(await client.close(channel, check)).toBe('mock-signature');
    expect(await client.dispute(channel, check)).toBe('mock-signature');
    expect(await client.timeoutReclaim(channel)).toBe('mock-signature');
  });
});
