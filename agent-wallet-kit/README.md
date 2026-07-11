# @otomat/agent-wallet-kit

A budget-and-whitelist spend policy layer over an agent's Solana key. It wraps
`fetch`, transparently pays x402 402 challenges through `@otomat/sdk`, and
enforces a declarative spend policy before every payment. Violations throw
before any money moves.

## Usage

```ts
import { AgentWallet, BudgetPolicy, WhitelistPolicy, composePolicies } from '@otomat/agent-wallet-kit';
import { Keypair } from '@solana/web3.js';

const wallet = new AgentWallet({
  keypair: Keypair.generate(),
  facilitatorUrl: 'https://facilitator.otomat.fun',
  policy: composePolicies(
    BudgetPolicy({ maxTotal: 5_000_000n, maxPerCall: 50_000n }),
    WhitelistPolicy({ allowedDomains: ['api.otomat.fun'] }),
  ),
});

const response = await wallet.fetch('https://api.otomat.fun/premium');
console.log(wallet.getSpent()); // { total, byAsset }
```

## Spend policy

```ts
interface SpendPolicy {
  maxTotal?: { amount: bigint; asset: string };
  maxPerCall?: { amount: bigint; asset: string };
  perDomainLimit?: Record<string, bigint>;
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowedAssets?: string[];          // defaults to USDC only
  timeWindow?: { window: 'minute' | 'hour' | 'day'; maxAmount: bigint };
  requireHumanApprovalOver?: bigint; // amounts above this need approval
  onOverBudget?: (attempt: PaymentAttempt) => Promise<boolean>;
}
```

Built-in factories: `BudgetPolicy`, `WhitelistPolicy`, `TimeWindowPolicy`, and
`composePolicies` to merge them. `spendPolicySchema` / `parseSpendPolicy` validate
a declarative policy loaded from config.

## MCP integration

`AgentWallet` implements `PaymentAccount`, so it can back an MCP client:

```ts
import { withPayment } from '@otomat/sdk/mcp';

const paidClient = withPayment(mcpClient, { account: wallet });
```

Payments made this way are still subject to the spend policy.

## Dependencies

- `@otomat/sdk`
- `@solana/web3.js`
- `zod`

## Scripts

- `pnpm build` - compile with `tsc`.
- `pnpm test` - run the vitest suite.
