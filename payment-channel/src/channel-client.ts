import {
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import type { Channel, ChannelConfig, ChannelSigner, Check } from './types.js';
import { buildCanonicalCheckMessage } from './canonical-message.js';
import {
  buildCloseChannelIx,
  buildDisputeChannelIx,
  buildEd25519VerifyIx,
  buildOpenChannelIx,
  buildTimeoutReclaimIx,
  deriveChannelPda,
} from './anchor-io.js';
import { OTOMAT_RAIL_PROGRAM_ID } from './types/otomat-rail-idl.js';

function isKeypair(signer: ChannelSigner): signer is Keypair {
  return (signer as { secretKey?: unknown }).secretKey instanceof Uint8Array;
}

/**
 * ChannelClient opens payment channels, signs cumulative off-chain checks, and
 * submits the on-chain close/dispute/timeout instructions.
 */
export class ChannelClient {
  constructor(private readonly config: ChannelConfig) {}

  private get programId(): PublicKey {
    return this.config.program?.programId ?? this.config.programId ?? OTOMAT_RAIL_PROGRAM_ID;
  }

  private get payerPublicKey(): PublicKey {
    return this.config.payer.publicKey;
  }

  /** Open a channel: derive the PDA and submit the open_channel instruction. */
  async open(payee: PublicKey, mint: PublicKey, deposit: BN, expiry: number): Promise<Channel> {
    const { programId } = this;
    const payer = this.payerPublicKey;
    const [pda] = deriveChannelPda(programId, payer, payee);
    const payerTokenAccount = getAssociatedTokenAddressSync(mint, payer, false);
    const escrowTokenAccount = getAssociatedTokenAddressSync(mint, pda, true);
    const ix = buildOpenChannelIx({
      programId,
      channel: pda,
      payer,
      payerTokenAccount,
      escrowTokenAccount,
      mint,
      payee,
      facilitator: this.config.facilitator,
      deposit,
      expiry,
    });
    await this.sendInstructions([ix]);
    return {
      pda: pda.toBase58(),
      payer: payer.toBase58(),
      payee: payee.toBase58(),
      mint: mint.toBase58(),
      deposit: deposit.toString(),
      cumulativeAmount: '0',
      nonce: '0',
      expiry,
      status: 'open',
      facilitator: this.config.facilitator.toBase58(),
    };
  }

  /** Sign a cumulative check off-chain. Pure: does not touch the connection. */
  async signCheck(channel: Channel, cumulativeAmount: BN, nonce: BN): Promise<Check> {
    const message = buildCanonicalCheckMessage({
      channelPda: channel.pda,
      cumulativeAmount,
      nonce,
      expiry: channel.expiry,
    });
    const signer = this.config.payer;
    let signature: Uint8Array;
    if (isKeypair(signer)) {
      signature = nacl.sign.detached(message, signer.secretKey);
    } else if (signer.signMessage) {
      signature = await signer.signMessage(message);
    } else {
      throw new Error('signer cannot sign messages: no secret key or signMessage');
    }
    return {
      channelPda: channel.pda,
      cumulativeAmount: cumulativeAmount.toString(),
      nonce: nonce.toString(),
      expiry: channel.expiry,
      signature: bs58.encode(signature),
      message: Buffer.from(message).toString('base64'),
    };
  }

  /** Cooperatively close a channel using the latest signed check. */
  async close(channel: Channel, latestCheck: Check): Promise<string> {
    const { programId } = this;
    const channelPda = new PublicKey(channel.pda);
    const payer = new PublicKey(channel.payer);
    const payee = new PublicKey(channel.payee);
    const mint = new PublicKey(channel.mint);
    const message = Buffer.from(latestCheck.message, 'base64');
    const signature = bs58.decode(latestCheck.signature);
    const verifyIx = buildEd25519VerifyIx({ publicKey: payer, message, signature });
    const closeIx = buildCloseChannelIx({
      programId,
      channel: channelPda,
      payer: this.payerPublicKey,
      payee,
      payeeTokenAccount: getAssociatedTokenAddressSync(mint, payee, false),
      payerTokenAccount: getAssociatedTokenAddressSync(mint, payer, false),
      escrowTokenAccount: getAssociatedTokenAddressSync(mint, channelPda, true),
      mint,
      facilitator: this.config.facilitator,
      cumulativeAmount: new BN(latestCheck.cumulativeAmount),
      nonce: new BN(latestCheck.nonce),
      signature,
    });
    return this.sendInstructions([verifyIx, closeIx]);
  }

  /** Submit a newer counter-check to override an in-flight close. */
  async dispute(channel: Channel, counterCheck: Check): Promise<string> {
    const { programId } = this;
    const channelPda = new PublicKey(channel.pda);
    const payer = new PublicKey(channel.payer);
    const payee = new PublicKey(channel.payee);
    const mint = new PublicKey(channel.mint);
    const message = Buffer.from(counterCheck.message, 'base64');
    const signature = bs58.decode(counterCheck.signature);
    const verifyIx = buildEd25519VerifyIx({ publicKey: payer, message, signature });
    const disputeIx = buildDisputeChannelIx({
      programId,
      channel: channelPda,
      payer: this.payerPublicKey,
      payee,
      payeeTokenAccount: getAssociatedTokenAddressSync(mint, payee, false),
      payerTokenAccount: getAssociatedTokenAddressSync(mint, payer, false),
      escrowTokenAccount: getAssociatedTokenAddressSync(mint, channelPda, true),
      mint,
      facilitator: this.config.facilitator,
      cumulativeAmount: new BN(counterCheck.cumulativeAmount),
      nonce: new BN(counterCheck.nonce),
      signature,
    });
    return this.sendInstructions([verifyIx, disputeIx]);
  }

  /** Reclaim the deposit after the channel has expired. */
  async timeoutReclaim(channel: Channel): Promise<string> {
    const { programId } = this;
    const channelPda = new PublicKey(channel.pda);
    const payer = new PublicKey(channel.payer);
    const mint = new PublicKey(channel.mint);
    const ix = buildTimeoutReclaimIx({
      programId,
      channel: channelPda,
      payer,
      payerTokenAccount: getAssociatedTokenAddressSync(mint, payer, false),
      escrowTokenAccount: getAssociatedTokenAddressSync(mint, channelPda, true),
      mint,
    });
    return this.sendInstructions([ix]);
  }

  private async sendInstructions(instructions: TransactionInstruction[]): Promise<string> {
    const payer = this.payerPublicKey;
    const { blockhash } = await this.config.connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.feePayer = payer;
    tx.recentBlockhash = blockhash;
    tx.add(...instructions);
    const signer = this.config.payer;
    let signed: Transaction;
    if (isKeypair(signer)) {
      tx.sign(signer);
      signed = tx;
    } else if (signer.signTransaction) {
      signed = await signer.signTransaction(tx);
    } else {
      throw new Error('signer cannot sign transactions: no secret key or signTransaction');
    }
    return this.config.connection.sendRawTransaction(signed.serialize());
  }
}
