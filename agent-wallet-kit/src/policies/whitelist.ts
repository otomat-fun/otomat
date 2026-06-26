import type { SpendPolicy } from '../spend-policy.js';

export interface WhitelistPolicyOptions {
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowedAssets?: string[];
}

/** Restrict payments to allowed domains/assets and block specific domains. */
export function WhitelistPolicy(options: WhitelistPolicyOptions): SpendPolicy {
  const policy: SpendPolicy = {};
  if (options.allowedDomains) policy.allowedDomains = options.allowedDomains;
  if (options.blockedDomains) policy.blockedDomains = options.blockedDomains;
  if (options.allowedAssets) policy.allowedAssets = options.allowedAssets;
  return policy;
}
