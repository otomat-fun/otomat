import { describe, expect, it } from 'vitest';
import { Ed25519Program, Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import {
  CHANNEL_DISCRIMINATORS,
  buildCloseChannelIx,
  buildEd25519VerifyIx,
  buildOpenChannelIx,
  deriveChannelPda,
} from '../src/anchor-io.js';

const programId = new PublicKey('FwFC1nDo5r224uXDeTMc2X8FhXuiz9CqBF7tg3trEVhN');
const payer = Keypair.generate().publicKey;
const payee = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const facilitator = Keypair.generate().publicKey;
const someAta = Keypair.generate().publicKey;

describe('anchor-io instruction builders', () => {
  it('derives a deterministic channel PDA', () => {
    const [a] = deriveChannelPda(programId, payer, payee);
    const [b] = deriveChannelPda(programId, payer, payee);
    expect(a.equals(b)).toBe(true);
  });

  it('encodes open_channel discriminator and little-endian args', () => {
    const [channel] = deriveChannelPda(programId, payer, payee);
    const ix = buildOpenChannelIx({
      programId,
      channel,
      payer,
      payerTokenAccount: someAta,
      escrowTokenAccount: someAta,
      mint,
      payee,
      facilitator,
      deposit: new BN(123456),
      expiry: 1780000000,
    });
    expect(ix.programId.equals(programId)).toBe(true);
    expect([...ix.data.subarray(0, 8)]).toEqual([...CHANNEL_DISCRIMINATORS.openChannel]);
    expect(ix.data.readBigUInt64LE(8)).toBe(123456n);
    expect(ix.data.readBigInt64LE(16)).toBe(1780000000n);
    expect(ix.keys.length).toBe(10);
    expect(ix.keys[1]?.isSigner).toBe(true);
  });

  it('encodes close_channel data as discriminator + amount + nonce + signature', () => {
    const [channel] = deriveChannelPda(programId, payer, payee);
    const signature = new Uint8Array(64).fill(3);
    const ix = buildCloseChannelIx({
      programId,
      channel,
      payer,
      payee,
      payeeTokenAccount: someAta,
      payerTokenAccount: someAta,
      escrowTokenAccount: someAta,
      mint,
      facilitator,
      cumulativeAmount: new BN(50000),
      nonce: new BN(42),
      signature,
    });
    expect(ix.data.length).toBe(8 + 8 + 8 + 64);
    expect([...ix.data.subarray(0, 8)]).toEqual([...CHANNEL_DISCRIMINATORS.closeChannel]);
    expect(ix.data.readBigUInt64LE(8)).toBe(50000n);
    expect(ix.data.readBigUInt64LE(16)).toBe(42n);
  });

  it('builds an Ed25519 verify instruction on the Ed25519 native program', () => {
    const verify = buildEd25519VerifyIx({
      publicKey: payer,
      message: Buffer.from('hello'),
      signature: new Uint8Array(64).fill(1),
    });
    expect(verify.programId.equals(Ed25519Program.programId)).toBe(true);
  });

  it('rejects signatures that are not 64 bytes', () => {
    expect(() =>
      buildEd25519VerifyIx({
        publicKey: payer,
        message: Buffer.from('x'),
        signature: new Uint8Array(10),
      }),
    ).toThrow();
  });
});
