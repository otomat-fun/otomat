import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { NETWORKS } from './headers.js';
import type { Check, PaymentPayload, PaymentRequirementItem } from './types.js';

/**
 * Build an `otomat-channel` scheme payload from a signed check. The payload
 * carries the cumulative authorization and its base58 Ed25519 signature; the
 * facilitator settles it on chain at channel close.
 */
export function buildChannelPayload(
  check: Check,
  requirement?: PaymentRequirementItem,
): PaymentPayload {
  const accepted: PaymentRequirementItem = requirement ?? {
    scheme: 'otomat-channel',
    network: NETWORKS.SOLANA_MAINNET,
    amount: check.cumulativeAmount,
    asset: '',
    payTo: '',
    extra: { channelPda: check.channelPda },
  };

  return {
    x402Version: 2,
    scheme: 'otomat-channel',
    network: requirement?.network ?? NETWORKS.SOLANA_MAINNET,
    accepted,
    payload: {
      check: {
        channelPda: check.channelPda,
        cumulativeAmount: check.cumulativeAmount,
        nonce: check.nonce,
        expiry: check.expiry,
      },
      signature: check.signature,
    },
    extensions: {},
  };
}

/**
 * Verify a check's Ed25519 signature against the payer key. A payee can call
 * this before accepting a check off chain, mirroring the on-chain verification
 * the facilitator runs at settlement.
 */
export function verifyCheckSignature(check: Check, payer: PublicKey | string): boolean {
  const key = typeof payer === 'string' ? new PublicKey(payer) : payer;
  const message = Buffer.from(check.message, 'base64');
  const signature = bs58.decode(check.signature);
  return nacl.sign.detached.verify(message, signature, key.toBytes());
}
