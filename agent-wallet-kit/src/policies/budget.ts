import { USDC_MAINNET } from '@otomat/sdk';
import type { SpendPolicy } from '../spend-policy.js';

export interface BudgetPolicyOptions {
  maxTotal?: bigint;
  maxPerCall?: bigint;
  asset?: string;
}

/** Cap total and per-call spend for a single asset (USDC by default). */
export function BudgetPolicy(options: BudgetPolicyOptions): SpendPolicy {
  const asset = options.asset ?? USDC_MAINNET;
  const policy: SpendPolicy = { allowedAssets: [asset] };
  if (options.maxTotal !== undefined) policy.maxTotal = { amount: options.maxTotal, asset };
  if (options.maxPerCall !== undefined) policy.maxPerCall = { amount: options.maxPerCall, asset };
  return policy;
}
