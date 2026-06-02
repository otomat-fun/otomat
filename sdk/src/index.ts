export { OtomatClient } from './client.js';
export type { OtomatClientOptions } from './client.js';

export { buildExactPayload } from './exact-svm.js';
export type { BuildExactPayloadParams } from './exact-svm.js';

export { buildChannelPayload, verifyCheckSignature } from './otomat-channel-scheme.js';

import anchor from '@coral-xyz/anchor';

/** BN from Anchor, re-exported for constructing u64 token amounts. */
export const BN = anchor.BN;
export type BN = InstanceType<typeof anchor.BN>;

export {
  X402_HEADERS,
  NETWORKS,
  USDC_MAINNET,
  USDC_DEVNET,
  MAX_COMPUTE_UNIT_LIMIT,
  MAX_COMPUTE_UNIT_PRICE,
  encodePaymentRequired,
  decodePaymentRequired,
  encodePaymentSignature,
  decodePaymentSignature,
  encodePaymentResponse,
  decodePaymentResponse,
} from './headers.js';

export {
  resourceInfoSchema,
  paymentRequirementItemSchema,
  paymentRequirementsSchema,
  paymentPayloadSchema,
  settlementResponseSchema,
  verifyRequestSchema,
  verifyResponseSchema,
} from './schemas.js';
export type {
  PaymentRequirementItemSchema,
  PaymentRequirementsSchema,
  PaymentPayloadSchema,
  SettlementResponseSchema,
  VerifyRequestSchema,
  VerifyResponseSchema,
} from './schemas.js';

export type {
  Check,
  PaymentAccount,
  PaymentPayload,
  PaymentRequirementItem,
  PaymentRequirements,
  ResourceInfo,
  SettlementResponse,
  SolanaSigner,
  WalletAdapterLike,
} from './types.js';
