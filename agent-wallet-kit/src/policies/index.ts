import type { SpendPolicy } from '../spend-policy.js';

export { BudgetPolicy } from './budget.js';
export type { BudgetPolicyOptions } from './budget.js';
export { WhitelistPolicy } from './whitelist.js';
export type { WhitelistPolicyOptions } from './whitelist.js';
export { TimeWindowPolicy } from './time-window.js';
export type { TimeWindowPolicyOptions } from './time-window.js';

/**
 * Merge several policy fragments into one. Scalar limits from later fragments
 * win; domain/asset lists and per-domain limits are unioned.
 */
export function composePolicies(...policies: SpendPolicy[]): SpendPolicy {
  const merged: SpendPolicy = {};
  for (const policy of policies) {
    if (policy.maxTotal) merged.maxTotal = policy.maxTotal;
    if (policy.maxPerCall) merged.maxPerCall = policy.maxPerCall;
    if (policy.timeWindow) merged.timeWindow = policy.timeWindow;
    if (policy.requireHumanApprovalOver !== undefined) {
      merged.requireHumanApprovalOver = policy.requireHumanApprovalOver;
    }
    if (policy.onOverBudget) merged.onOverBudget = policy.onOverBudget;
    if (policy.allowedDomains) {
      merged.allowedDomains = [...(merged.allowedDomains ?? []), ...policy.allowedDomains];
    }
    if (policy.blockedDomains) {
      merged.blockedDomains = [...(merged.blockedDomains ?? []), ...policy.blockedDomains];
    }
    if (policy.allowedAssets) {
      merged.allowedAssets = [...(merged.allowedAssets ?? []), ...policy.allowedAssets];
    }
    if (policy.perDomainLimit) {
      merged.perDomainLimit = { ...(merged.perDomainLimit ?? {}), ...policy.perDomainLimit };
    }
  }
  return merged;
}
