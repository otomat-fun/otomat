import { describe, expect, it } from 'vitest';
import { USDC_MAINNET } from '@otomat/sdk';
import {
  createSpendState,
  evaluatePolicy,
  parseSpendPolicy,
  recordSpend,
  spendPolicySchema,
  type PaymentAttempt,
  type SpendPolicy,
} from '../src/spend-policy.js';
import { BudgetPolicy, TimeWindowPolicy, WhitelistPolicy, composePolicies } from '../src/policies/index.js';

const attempt = (amount: bigint, domain = 'api.example', asset = USDC_MAINNET): PaymentAttempt => ({
  url: `https://${domain}/x`,
  domain,
  amount,
  asset,
});

function evaluate(policy: SpendPolicy, a: PaymentAttempt, state = createSpendState(), now = 0) {
  return evaluatePolicy(policy, a, state, now);
}

describe('evaluatePolicy', () => {
  it('rejects an asset outside the allowlist', async () => {
    await expect(evaluate({}, attempt(1n, 'api.example', 'OtherMint'))).rejects.toMatchObject({
      reason: 'asset_not_allowed',
    });
  });

  it('rejects a blocked domain', async () => {
    await expect(evaluate({ blockedDomains: ['evil.example'] }, attempt(1n, 'evil.example'))).rejects.toMatchObject({
      reason: 'domain_blocked',
    });
  });

  it('rejects a domain outside the allowlist', async () => {
    await expect(evaluate({ allowedDomains: ['good.example'] }, attempt(1n, 'api.example'))).rejects.toMatchObject({
      reason: 'domain_not_allowed',
    });
  });

  it('rejects a per-call amount over the limit', async () => {
    await expect(
      evaluate({ maxPerCall: { amount: 5000n, asset: USDC_MAINNET } }, attempt(6000n)),
    ).rejects.toMatchObject({ reason: 'per_call_exceeded' });
  });

  it('rejects when cumulative total would exceed maxTotal', async () => {
    const state = createSpendState();
    recordSpend(state, attempt(9000n), 0);
    await expect(
      evaluate({ maxTotal: { amount: 10000n, asset: USDC_MAINNET } }, attempt(2000n), state),
    ).rejects.toMatchObject({ reason: 'total_exceeded' });
  });

  it('rejects when a per-domain limit is exceeded', async () => {
    const state = createSpendState();
    recordSpend(state, attempt(800n, 'api.example'), 0);
    await expect(
      evaluate({ perDomainLimit: { 'api.example': 1000n } }, attempt(500n, 'api.example'), state),
    ).rejects.toMatchObject({ reason: 'per_domain_exceeded' });
  });

  it('rejects when a rolling time window is exceeded', async () => {
    const state = createSpendState();
    recordSpend(state, attempt(900n), 1000);
    await expect(
      evaluate({ timeWindow: { window: 'minute', maxAmount: 1000n } }, attempt(200n), state, 1500),
    ).rejects.toMatchObject({ reason: 'time_window_exceeded' });
  });

  it('honors the human-approval hook', async () => {
    await expect(
      evaluate({ requireHumanApprovalOver: 1000n, onOverBudget: async () => true }, attempt(2000n)),
    ).resolves.toBeUndefined();
    await expect(
      evaluate({ requireHumanApprovalOver: 1000n, onOverBudget: async () => false }, attempt(2000n)),
    ).rejects.toMatchObject({ reason: 'human_approval_denied' });
    await expect(evaluate({ requireHumanApprovalOver: 1000n }, attempt(2000n))).rejects.toMatchObject({
      reason: 'human_approval_required',
    });
  });

  it('allows a payment within every limit', async () => {
    await expect(
      evaluate(
        {
          maxTotal: { amount: 10000n, asset: USDC_MAINNET },
          maxPerCall: { amount: 5000n, asset: USDC_MAINNET },
        },
        attempt(1000n),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('policy factories', () => {
  it('BudgetPolicy sets total and per-call limits', () => {
    const policy = BudgetPolicy({ maxTotal: 10000n, maxPerCall: 5000n });
    expect(policy.maxTotal?.amount).toBe(10000n);
    expect(policy.maxPerCall?.amount).toBe(5000n);
    expect(policy.allowedAssets).toEqual([USDC_MAINNET]);
  });

  it('composePolicies unions lists and keeps scalar limits', () => {
    const policy = composePolicies(
      BudgetPolicy({ maxTotal: 1n }),
      WhitelistPolicy({ allowedDomains: ['a.example'] }),
      WhitelistPolicy({ allowedDomains: ['b.example'] }),
      TimeWindowPolicy({ window: 'hour', maxAmount: 5n }),
    );
    expect(policy.allowedDomains).toEqual(['a.example', 'b.example']);
    expect(policy.maxTotal?.amount).toBe(1n);
    expect(policy.timeWindow?.window).toBe('hour');
  });

  it('parseSpendPolicy validates config and rejects malformed input', () => {
    const parsed = parseSpendPolicy({ allowedAssets: [USDC_MAINNET], requireHumanApprovalOver: 100n });
    expect(parsed.allowedAssets).toEqual([USDC_MAINNET]);
    expect(spendPolicySchema.safeParse({ maxTotal: { amount: 'nope', asset: 'x' } }).success).toBe(false);
  });
});
