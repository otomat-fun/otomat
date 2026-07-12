# x402 Compliance

How Otomat implements the x402 v2 protocol, which Solana scheme rules it
enforces, and where it deviates from or extends the standard.

## 1. Overview

x402 reuses HTTP `402 Payment Required` as a machine-to-machine payment protocol.
Otomat's facilitator is an unauthenticated verify/settle service that a resource
server calls to (1) simulate and verify a signed payment (`/verify`) and (2) add
a fee-payer signature and broadcast it on-chain (`/settle`).

Two schemes are supported:

| Scheme | Standing | On-chain txns | Use |
| ------ | -------- | ------------- | --- |
| `exact` | Coinbase official (SVM) | 1 per request | single exact-amount payment |
| `otomat-channel` | Otomat-defined | 2 (open + close) | batched session payments |

## 2. Endpoints

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/verify` | none | `{ paymentPayload, paymentRequirements }` → `{ isValid, payer?, invalidReason? }` |
| POST | `/settle` | none | same body → `{ success, payer, transaction, network, errorReason? }` |
| GET | `/supported` | none | `{ kinds, extensions, signers }` |
| GET | `/discovery/resources` | none | Bazaar catalog (`?type=&limit=&offset=&query=`) |
| POST | `/discovery/resources` | Ed25519 | resource registration (facilitator signature) |
| GET | `/health` | none | `{ status, version, network, programId }` |

`/verify` and `/settle` are unauthenticated by design so that many resource
servers can share one facilitator. Abuse is bounded by an IP token-bucket rate
limit rather than auth.

## 3. Headers and networks

The three v2 headers, all `base64(JSON)`, are held behind constants so a future
spec revision is a one-line change:

- `PAYMENT-REQUIRED` (server → 402)
- `PAYMENT-SIGNATURE` (client → retry; the v1 `X-PAYMENT` renamed)
- `PAYMENT-RESPONSE` (server → after settlement)
- `WWW-Authenticate`

CORS exposes `X-PAYMENT`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`,
`PAYMENT-REQUIRED`, and `WWW-Authenticate`; no wildcard origin, credentials
allowed, explicit origin allowlist.

CAIP-2 network ids:

- Solana mainnet: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
- Solana devnet: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`

## 4. `exact` scheme (Coinbase SVM)

Payload: `payload.transaction = base64(partially-signed VersionedTransaction)`.

### Instruction order (strict, 3–6)

```
[0] ComputeBudget SetComputeUnitLimit   (units <= 40,000)
[1] ComputeBudget SetComputeUnitPrice   (<= 5 micro-lamports / CU)
[2] TransferChecked                      (SPL Token or Token-2022)
[3..] (optional) Memo / Lighthouse       (whitelisted program ids only)
```

### `TransferChecked` checks

- data decoded as `[12, amount(u64 LE), decimals(u8)]`
- `mint == paymentRequirements.asset`
- `amount == paymentRequirements.amount` (exact, not upper-bound)
- `authority(owner) == payer` (not the fee payer)
- `sourceATA == getAssociatedTokenAddress(mint, payer)`
- `destinationATA == getAssociatedTokenAddress(mint, payTo)`
- program id ∈ { SPL Token, Token-2022 }

### Fee-payer constraints (gasless)

- `feePayer == extra.feePayer`, the transaction's first account and signer
- the fee payer appears in no instruction's accounts
- the fee payer is neither the transfer authority nor the source ATA

These let a payer settle with a zero-SOL balance.

### Signing, replay, expiry

- Client submits partially signed (payer only; the fee-payer slot is unsigned).
- The verifier checks the payer signature against the message and confirms the
  fee-payer slot is empty.
- The settler adds the facilitator (fee-payer) signature and broadcasts.
- Recent-blockhash validity is checked against the RPC; a 120-second cache keyed
  by signature prevents double settlement.

## 5. `otomat-channel` scheme (Otomat extension)

Accumulates off-chain payer-signed checks and settles the last one on-chain.

```json
{
  "check": { "channelPda": "<base58>", "cumulativeAmount": "50000", "nonce": 42, "expiry": 1780000000 },
  "signature": "<base58 Ed25519 sig>"
}
```

### Canonical check message

The signed bytes are a fixed 72-byte concatenation, matching the on-chain program
byte for byte:

```
"otomat/v2/check|" (16B) || channel_pda (32B) || cumulative_le (8B) || nonce_le (8B) || expiry_le (8B)
```

The 16-byte domain prefix includes its trailing `|`; the channel PDA is its raw
32-byte public key, not a base58 string; the three numbers are 8-byte
little-endian (`expiry` signed). No separators sit between the binary fields.
Verification uses `nacl.sign.detached.verify(message, signature, channel.payer)`.

### Off-chain state checks

Fetch the `Channel` account and require: `status == Open`, `payTo == payee`,
`asset == mint`, a valid payer signature, `nonce` strictly increasing,
`cumulativeAmount` non-decreasing and `<= deposit`, and `expiry > now`.

### On-chain settlement

An `Ed25519Program` pre-instruction plus the Anchor `close_channel` CPI are built
into one v0 transaction, signed by the facilitator, and broadcast. The escrow PDA
pays `cumulativeAmount` to the payee ATA and refunds the remainder to the payer.

## 6. Token-2022

The initial release targets USDC (SPL Token, no extensions). The `exact` scheme
detects the mint's owner program to choose SPL vs Token-2022 and derive ATAs.
Confidential-transfer mints are rejected (the amount is not inspectable);
transfer-hook mints are conditionally allowed by whitelist. The streaming scheme
(`otomat-stream`) is a v2 item.

## 7. Deviations from the standard

1. **v2 by default.** v1 (`X-PAYMENT`, `serializedTransaction`) compatibility is
   normalized to v2 in the resource-server / middleware layer, not the facilitator.
2. **`otomat-channel` is non-standard** — an Otomat definition that follows the
   x402 `accepted` / `payload` payload conventions.
3. **Bazaar discovery is a local catalog.** Instead of a central index, a Redis
   (or in-memory) catalog is served, and registration is authenticated with the
   facilitator's Ed25519 signature over canonical JSON.
4. **Blockhash expiry is checked against the RPC** rather than a fixed clock.
5. **Replay reservation happens at settle time**, keeping `/verify` idempotent and
   side-effect-free.

## 8. References

- Coinbase x402: <https://github.com/coinbase/x402>
- x402 v2 specification and the SVM `exact` scheme under `specs/`
- Solana x402 guide: <https://solana.com/developers/guides/getstarted/intro-to-x402>
- CAIP-2 network identifiers and the Bazaar extension (docs.x402.org)
