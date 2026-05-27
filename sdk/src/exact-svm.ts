import {
  ComputeBudgetProgram,
  type Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import { MAX_COMPUTE_UNIT_LIMIT, MAX_COMPUTE_UNIT_PRICE } from './headers.js';
import type { PaymentPayload, PaymentRequirementItem, SolanaSigner } from './types.js';

const COMPUTE_UNIT_LIMIT = 20000;
const COMPUTE_UNIT_PRICE = 1;

function isKeypair(signer: SolanaSigner): signer is Keypair {
  return (signer as { secretKey?: unknown }).secretKey instanceof Uint8Array;
}

export interface BuildExactPayloadParams {
  requirement: PaymentRequirementItem;
  payer: SolanaSigner;
  connection: Connection;
  decimals?: number;
  tokenProgram?: PublicKey;
}

/**
 * Build a Solana `exact` scheme payload: a partially-signed VersionedTransaction
 * whose instructions are ordered SetComputeUnitLimit, SetComputeUnitPrice,
 * TransferChecked. The facilitator (the fee payer) adds the final signature.
 */
export async function buildExactPayload(params: BuildExactPayloadParams): Promise<PaymentPayload> {
  if (COMPUTE_UNIT_LIMIT > MAX_COMPUTE_UNIT_LIMIT) {
    throw new Error('compute unit limit exceeds the x402 exact-scheme maximum');
  }
  if (COMPUTE_UNIT_PRICE > MAX_COMPUTE_UNIT_PRICE) {
    throw new Error('compute unit price exceeds the x402 exact-scheme maximum');
  }

  const { requirement, payer, connection } = params;
  const feePayerRaw = requirement.extra?.feePayer;
  if (!feePayerRaw) throw new Error('exact scheme requires requirement.extra.feePayer');

  const mint = new PublicKey(requirement.asset);
  const payTo = new PublicKey(requirement.payTo);
  const feePayer = new PublicKey(feePayerRaw);
  const amount = BigInt(requirement.amount);
  const payerPk = payer.publicKey;
  const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

  let { decimals } = params;
  if (decimals === undefined) {
    const mintInfo = await getMint(connection, mint, undefined, tokenProgram);
    decimals = mintInfo.decimals;
  }

  const sourceAta = getAssociatedTokenAddressSync(mint, payerPk, true, tokenProgram);
  const destAta = getAssociatedTokenAddressSync(mint, payTo, true, tokenProgram);

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE }),
    createTransferCheckedInstruction(sourceAta, mint, destAta, payerPk, amount, decimals, [], tokenProgram),
  ];

  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  let tx = new VersionedTransaction(message);
  if (isKeypair(payer)) {
    tx.sign([payer]);
  } else if (payer.signTransaction) {
    tx = await payer.signTransaction(tx);
  } else {
    throw new Error('payer cannot sign transactions: no secret key or signTransaction');
  }

  return {
    x402Version: 2,
    scheme: 'exact',
    network: requirement.network,
    accepted: requirement,
    payload: { transaction: Buffer.from(tx.serialize()).toString('base64') },
    extensions: {},
  };
}
