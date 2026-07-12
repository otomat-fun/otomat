# @otomat/sdk

[![npm](https://img.shields.io/npm/v/@otomat/sdk)](https://www.npmjs.com/package/@otomat/sdk)
[![license](https://img.shields.io/npm/l/@otomat/sdk)](https://github.com/otomat-fun/otomat/blob/main/LICENSE)
[![site](https://img.shields.io/badge/site-otomat.fun-6c5ce7)](https://otomat.fun)
[![github](https://img.shields.io/badge/github-otomat--fun%2Fotomat-181717?logo=github)](https://github.com/otomat-fun/otomat)

TypeScript SDK for the Otomat x402 payment rail on Solana. It builds x402 v2
payment payloads, drives the 402 challenge/response flow over `fetch`, and adapts
MCP tools for per-call payment.

## Install

```bash
npm i @otomat/sdk
```

## Low-level client

```ts
import { OtomatClient } from '@otomat/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const client = new OtomatClient({
  facilitatorUrl: 'https://facilitator.otomat.fun',
  payer: Keypair.generate(),
  connection: new Connection('https://api.mainnet-beta.solana.com'),
});

// Transparently pays a 402 and returns the eventual 200.
const response = await client.fetch('https://api.example/paid');
```

## Payload builders

- `buildExactPayload({ requirement, payer, connection })` -> a partially-signed
  Solana `exact` VersionedTransaction, instruction order
  `SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked`. The facilitator is
  the fee payer and adds the final signature.
- `client.buildChannelPayload(check)` -> an `otomat-channel` payload from a check
  signed with `@otomat/payment-channel`.
- `verifyCheckSignature(check, payerPublicKey)` -> validate a check's Ed25519
  signature off chain.

## Headers and schemas

`X402_HEADERS`, `encode/decodePaymentRequired`, `encode/decodePaymentSignature`,
`encode/decodePaymentResponse`, plus Zod schemas (`paymentRequirementsSchema`,
`paymentPayloadSchema`, `settlementResponseSchema`, and the verify request /
response schemas) for validating protocol messages.

## MCP adapter (`@otomat/sdk/mcp`)

Server side:

```ts
import { paidTool } from '@otomat/sdk/mcp';
import { z } from 'zod';

paidTool(server, {
  name: 'premium_query',
  price: '$0.002',
  payTo: OTOMAT_TREASURY,
  facilitatorUrl: 'https://facilitator.otomat.fun',
  schema: z.object({ query: z.string() }),
  handler: async ({ query }) => ({ content: [{ type: 'text', text: run(query) }] }),
});
```

Client side:

```ts
import { withPayment } from '@otomat/sdk/mcp';

const paidClient = withPayment(mcpClient, { account: agentWallet });
```

A tool call with no payment returns a PAYMENT-REQUIRED result carried in `_meta`;
`withPayment` detects it, builds a payment from the account, and replays the call.

## Dependencies

- `@solana/web3.js`
- `@solana/spl-token`
- `@coral-xyz/anchor`
- `@modelcontextprotocol/sdk`
- `cross-fetch`
- `zod`
- `tweetnacl`
- `bs58`

## Related packages

- [`@otomat/payment-channel`](https://www.npmjs.com/package/@otomat/payment-channel) - sign the checks that `buildChannelPayload` turns into `otomat-channel` payloads.
- [`@otomat/middleware`](https://www.npmjs.com/package/@otomat/middleware) - the server side; sell any endpoint behind an x402 paywall.
- [`@otomat/agent-wallet-kit`](https://www.npmjs.com/package/@otomat/agent-wallet-kit) - wraps this SDK with a declarative spend policy for agent wallets.
- [`otomat-cli`](https://www.npmjs.com/package/otomat-cli) - pay, serve, and manage channels from the terminal.

## Status

The settlement program is deployed to Solana mainnet-beta; the public interactive demos run on devnet.

## License

MIT

## Scripts

- `pnpm build` - compile with `tsc`.
- `pnpm test` - run the vitest suite.
