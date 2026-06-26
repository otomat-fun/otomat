import type { SpendPolicy, TimeWindowLimit } from '../spend-policy.js';

export type TimeWindowPolicyOptions = TimeWindowLimit;

/** Cap spend within a rolling minute, hour, or day window. */
export function TimeWindowPolicy(options: TimeWindowPolicyOptions): SpendPolicy {
  return { timeWindow: { window: options.window, maxAmount: options.maxAmount } };
}
