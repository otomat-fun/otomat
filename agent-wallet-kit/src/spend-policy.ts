import { z } from 'zod';
import { USDC_MAINNET } from '@otomat/sdk';

/** A payment the wallet is about to make, evaluated against the spend policy. */
export interface PaymentAttempt {
  url: string;
  domain: string;
  amount: bigint;
  asset: string;
}

export interface AssetAmount {
  amount: bigint;
  asset: string;
}

export interface TimeWindowLimit {
  window: 'minute' | 'hour' | 'day';
  maxAmount: bigint;
}

/** Declarative spend policy enforced before every payment. */
export interface SpendPolicy {
  maxTotal?: AssetAmount;
  maxPerCall?: AssetAmount;
  perDomainLimit?: Record<string, bigint>;
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowedAssets?: string[];
  timeWindow?: TimeWindowLimit;
  requireHumanApprovalOver?: bigint;
  onOverBudget?: (attempt: PaymentAttempt) => Promise<boolean>;
}

export type PolicyViolationReason =
  | 'asset_not_allowed'
  | 'domain_blocked'
  | 'domain_not_allowed'
  | 'per_call_exceeded'
  | 'per_domain_exceeded'
  | 'time_window_exceeded'
  | 'total_exceeded'
  | 'human_approval_required'
  | 'human_approval_denied';

export class PolicyViolationError extends Error {
  readonly reason: PolicyViolationReason;
  readonly attempt: PaymentAttempt;

  constructor(reason: PolicyViolationReason, attempt: PaymentAttempt, message: string) {
    super(message);
    this.name = 'PolicyViolationError';
    this.reason = reason;
    this.attempt = attempt;
  }
}

export interface SpendEvent {
  at: number;
  amount: bigint;
  asset: string;
}

/** Running totals the evaluator reads and the wallet updates after each payment. */
export interface SpendState {
  total: bigint;
  byAsset: Record<string, bigint>;
  byDomain: Record<string, bigint>;
  events: SpendEvent[];
}

export function createSpendState(): SpendState {
  return { total: 0n, byAsset: {}, byDomain: {}, events: [] };
}

const WINDOW_MS: Record<TimeWindowLimit['window'], number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

/**
 * Evaluate a payment attempt against the policy. Throws PolicyViolationError on
 * any violation. If the amount exceeds `requireHumanApprovalOver`, the async
 * `onOverBudget` hook decides approval (missing hook means deny).
 */
export async function evaluatePolicy(
  policy: SpendPolicy,
  attempt: PaymentAttempt,
  state: SpendState,
  now: number,
): Promise<void> {
  const allowedAssets = policy.allowedAssets ?? [USDC_MAINNET];
  if (!allowedAssets.includes(attempt.asset)) {
    throw new PolicyViolationError('asset_not_allowed', attempt, `asset ${attempt.asset} is not allowed`);
  }

  if (policy.blockedDomains?.includes(attempt.domain)) {
    throw new PolicyViolationError('domain_blocked', attempt, `domain ${attempt.domain} is blocked`);
  }

  if (policy.allowedDomains && !policy.allowedDomains.includes(attempt.domain)) {
    throw new PolicyViolationError('domain_not_allowed', attempt, `domain ${attempt.domain} is not in the allowlist`);
  }

  if (policy.maxPerCall && attempt.asset === policy.maxPerCall.asset && attempt.amount > policy.maxPerCall.amount) {
    throw new PolicyViolationError('per_call_exceeded', attempt, 'per-call limit exceeded');
  }

  const domainLimit = policy.perDomainLimit?.[attempt.domain];
  if (domainLimit !== undefined) {
    const spentOnDomain = state.byDomain[attempt.domain] ?? 0n;
    if (spentOnDomain + attempt.amount > domainLimit) {
      throw new PolicyViolationError('per_domain_exceeded', attempt, `per-domain limit for ${attempt.domain} exceeded`);
    }
  }

  if (policy.timeWindow) {
    const cutoff = now - WINDOW_MS[policy.timeWindow.window];
    const windowed = state.events
      .filter((event) => event.at >= cutoff && event.asset === attempt.asset)
      .reduce((sum, event) => sum + event.amount, 0n);
    if (windowed + attempt.amount > policy.timeWindow.maxAmount) {
      throw new PolicyViolationError('time_window_exceeded', attempt, 'time-window limit exceeded');
    }
  }

  if (policy.maxTotal && attempt.asset === policy.maxTotal.asset) {
    const spentOnAsset = state.byAsset[attempt.asset] ?? 0n;
    if (spentOnAsset + attempt.amount > policy.maxTotal.amount) {
      throw new PolicyViolationError('total_exceeded', attempt, 'total spend limit exceeded');
    }
  }

  if (policy.requireHumanApprovalOver !== undefined && attempt.amount > policy.requireHumanApprovalOver) {
    if (!policy.onOverBudget) {
      throw new PolicyViolationError('human_approval_required', attempt, 'human approval required for this amount');
    }
    const approved = await policy.onOverBudget(attempt);
    if (!approved) {
      throw new PolicyViolationError('human_approval_denied', attempt, 'human approval was denied');
    }
  }
}

/** Fold a completed payment into the running spend state. */
export function recordSpend(state: SpendState, attempt: PaymentAttempt, now: number): void {
  state.total += attempt.amount;
  state.byAsset[attempt.asset] = (state.byAsset[attempt.asset] ?? 0n) + attempt.amount;
  state.byDomain[attempt.domain] = (state.byDomain[attempt.domain] ?? 0n) + attempt.amount;
  state.events.push({ at: now, amount: attempt.amount, asset: attempt.asset });
}

const assetAmountSchema = z.object({ amount: z.bigint(), asset: z.string() });

/** Zod schema for the declarative portion of a spend policy (no onOverBudget hook). */
export const spendPolicySchema = z.object({
  maxTotal: assetAmountSchema.optional(),
  maxPerCall: assetAmountSchema.optional(),
  perDomainLimit: z.record(z.string(), z.bigint()).optional(),
  allowedDomains: z.array(z.string()).optional(),
  blockedDomains: z.array(z.string()).optional(),
  allowedAssets: z.array(z.string()).optional(),
  timeWindow: z
    .object({ window: z.enum(['minute', 'hour', 'day']), maxAmount: z.bigint() })
    .optional(),
  requireHumanApprovalOver: z.bigint().optional(),
});

export type SpendPolicyInput = z.infer<typeof spendPolicySchema>;

/** Validate the declarative portion of a spend policy loaded from config. */
export function parseSpendPolicy(input: unknown): SpendPolicyInput {
  return spendPolicySchema.parse(input);
}
