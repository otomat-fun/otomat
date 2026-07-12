# @otomat/agent-wallet-kit

[![npm](https://img.shields.io/npm/v/@otomat/agent-wallet-kit)](https://www.npmjs.com/package/@otomat/agent-wallet-kit)
[![license](https://img.shields.io/npm/l/@otomat/agent-wallet-kit)](https://github.com/otomat-fun/otomat/blob/main/LICENSE)
[![site](https://img.shields.io/badge/site-otomat.fun-6c5ce7)](https://otomat.fun)
[![github](https://img.shields.io/badge/github-otomat--fun%2Fotomat-181717?logo=github)](https://github.com/otomat-fun/otomat)

A budget-and-whitelist spend policy layer over an agent's Solana key. It wraps
`fetch`, transparently pays 402 challenges through `@otomat/sdk`, and
enforces a declarative spend policy before every payment. Violations throw
before any money moves.

## Install

```bash
npm i @otomat/agent-wallet-kit
```

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

## Related packages

- [`@otomat/sdk`](https://www.npmjs.com/package/@otomat/sdk) - the x402 client this kit wraps with a spend policy.
- [`@otomat/payment-channel`](https://www.npmjs.com/package/@otomat/payment-channel) - off-chain signed channels for high-frequency streams.
- [`@otomat/middleware`](https://www.npmjs.com/package/@otomat/middleware) - the server side; sell any endpoint behind an x402 paywall.
- [`otomat-cli`](https://www.npmjs.com/package/otomat-cli) - the same budgeted paying from the terminal via `otomat pay`.

## Status

The settlement program is deployed to Solana mainnet-beta; the public interactive demos run on devnet.

## License

MIT

## Scripts

- `pnpm build` - compile with `tsc`.
- `pnpm test` - run the vitest suite.
