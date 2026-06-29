export { AgentWallet } from './agent-wallet.js';
export type { AgentWalletConfig, PayOptions, PayResult } from './agent-wallet.js';

export {
  PolicyViolationError,
  createSpendState,
  evaluatePolicy,
  parseSpendPolicy,
  recordSpend,
  spendPolicySchema,
} from './spend-policy.js';
export type {
  AssetAmount,
  PaymentAttempt,
  PolicyViolationReason,
  SpendEvent,
  SpendPolicy,
  SpendPolicyInput,
  SpendState,
  TimeWindowLimit,
} from './spend-policy.js';

export {
  BudgetPolicy,
  TimeWindowPolicy,
  WhitelistPolicy,
  composePolicies,
} from './policies/index.js';
export type {
  BudgetPolicyOptions,
  TimeWindowPolicyOptions,
  WhitelistPolicyOptions,
} from './policies/index.js';
