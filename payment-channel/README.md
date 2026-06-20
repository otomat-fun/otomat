# @otomat/payment-channel

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

The bytes that get signed are the UTF-8 encoding of:

```
otomat/v2/check|{channelPda_base58}|{cumulativeAmount_le_hex}|{nonce_le_hex}|{expiry_le_hex}
```

where each numeric field is its 64-bit little-endian byte serialization rendered
as lowercase hex. This is the exact format the on-chain program verifies and the
same format used by `@otomat/sdk`.

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
- `buildCanonicalCheckMessage`, `buildCanonicalCheckString`, `u64ToLeHex`, `i64ToLeHex`.
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
