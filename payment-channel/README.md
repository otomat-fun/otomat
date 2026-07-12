# @otomat/payment-channel

[![npm](https://img.shields.io/npm/v/@otomat/payment-channel)](https://www.npmjs.com/package/@otomat/payment-channel)
[![license](https://img.shields.io/npm/l/@otomat/payment-channel)](https://github.com/otomat-fun/otomat/blob/main/LICENSE)
[![site](https://img.shields.io/badge/site-otomat.fun-6c5ce7)](https://otomat.fun)
[![github](https://img.shields.io/badge/github-otomat--fun%2Fotomat-181717?logo=github)](https://github.com/otomat-fun/otomat)

Off-chain signed payment channels with on-chain batch settlement for the Otomat
x402 rail. A channel lets an agent authorize many micropayments to one payee by
signing cumulative off-chain "checks", then settling the final amount on chain in
a single close.

## Model

1. `open` deposits USDC into an escrow PDA and records the channel.
2. `signCheck` signs a monotonically increasing cumulative amount off chain
   (Ed25519 over a canonical message). No transaction, no fee.
3. `close` submits the latest check on chain: the escrow releases the cumulative
   amount to the payee and refunds the remainder to the payer.
4. `dispute` overrides an in-flight close with a newer check (higher nonce).
5. `timeoutReclaim` returns the deposit to the payer after expiry.

## Canonical check message

The bytes that get signed are a fixed 72-byte binary message, not a delimited
string. `buildCanonicalCheckMessage` produces exactly these bytes and the
on-chain program reconstructs them byte-for-byte:

```
"otomat/v2/check|"   16 bytes  domain prefix (the trailing '|' is part of it)
channelPda           32 bytes  the channel public key as raw bytes, not base58
cumulativeAmount      8 bytes  u64, little-endian
nonce                 8 bytes  u64, little-endian
expiry                8 bytes  i64, little-endian
                     --------
                     72 bytes  concatenated, no separators between fields
```

There is only one separator character, the `|` inside the prefix; the binary
fields are packed back to back. `@otomat/sdk` signs this same layout. The
`u64ToLeHex` / `i64ToLeHex` helpers render individual fields as hex for
inspection and are not used to assemble the message.

## Install

```bash
npm i @otomat/payment-channel
```

## Usage

```ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { ChannelClient } from '@otomat/payment-channel';

const client = new ChannelClient({
  connection: new Connection('https://api.mainnet-beta.solana.com'),
  payer: Keypair.generate(),
  facilitator: new PublicKey('...'),
});

const channel = await client.open(payee, usdcMint, new BN(1_000_000), expiry);
const check = await client.signCheck(channel, new BN(50_000), new BN(1));
await client.close(channel, check);
```

## API

- `ChannelClient` - `open`, `signCheck`, `close`, `dispute`, `timeoutReclaim`.
- `buildCanonicalCheckMessage` and `CHECK_MESSAGE_PREFIX`, plus the field
  serializers `u64ToLeBytes` / `i64ToLeBytes` and their hex variants
  `u64ToLeHex` / `i64ToLeHex`.
- `anchor-io` instruction builders: `buildOpenChannelIx`, `buildCloseChannelIx`,
  `buildDisputeChannelIx`, `buildTimeoutReclaimIx`, `buildEd25519VerifyIx`,
  `deriveChannelPda`.
- `OTOMAT_RAIL_IDL`, `OTOMAT_RAIL_PROGRAM_ID` - the temporary program interface,
  isolated in `src/types/otomat-rail-idl.ts` so it can be swapped for the
  generated IDL once the on-chain program build is available.

## Dependencies

- `@solana/web3.js`
- `@solana/spl-token`
- `@coral-xyz/anchor`
- `bn.js`
- `bs58`
- `tweetnacl`

## Scripts

- `pnpm build` - compile with `tsc`.
- `pnpm test` - run the vitest suite.

## Related packages

- [`@otomat/sdk`](https://www.npmjs.com/package/@otomat/sdk) - x402 client, payload builders, and MCP adapter. Builds `otomat-channel` payloads from checks signed here.
- [`@otomat/middleware`](https://www.npmjs.com/package/@otomat/middleware) - sell any endpoint behind an x402 paywall.
- [`@otomat/agent-wallet-kit`](https://www.npmjs.com/package/@otomat/agent-wallet-kit) - spend-policy layer for agent wallets.
- [`otomat-cli`](https://www.npmjs.com/package/otomat-cli) - open, inspect, and settle channels from the command line.

## Status

The settlement program is deployed to Solana mainnet-beta; the public interactive demos run on devnet.

## License

MIT
