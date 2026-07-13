# Security Model

This document describes the trust assumptions, threat model, and known limits of
the Otomat settlement rail. The program is deployed to Solana mainnet-beta (the
public interactive demo runs on devnet) and has not been audited; see
[../SECURITY.md](../SECURITY.md) for reporting.

## Trust assumptions

| Party | Trusted to | Not trusted to |
| ----- | ---------- | -------------- |
| Payer | sign checks that never exceed the deposit | withhold newer checks (payee can dispute) |
| Payee | present the latest check | forge a check (Ed25519 verified on-chain) |
| Facilitator | broadcast a verified transaction, pay the fee | custody funds, alter amounts (escrow is a program PDA) |
| Governance | slash a misbehaving facilitator bond | move channel funds |

The escrow vault is an associated token account owned by an `EscrowAuthority`
PDA. No off-chain party can move escrowed funds; only the program can, and only
along the three settlement paths.

## Check authentication

Channel settlement rests on a single invariant: a check is only valid if the
payer signed exactly this message.

```
"otomat/v2/check|" (16B) || channel_pda (32B) || cumulative_le (8B) || nonce_le (8B) || expiry_le (8B)
```

- The message is reconstructed on-chain from the channel account and the
  instruction arguments, so a facilitator cannot substitute a different
  `(cumulative, nonce, expiry)`.
- The Ed25519 native program checks the cryptographic signature; the program's
  instructions-sysvar inspection confirms the verified `(pubkey, message,
  signature)` are the ones it requires. Both checks are necessary — the sysvar
  inspection alone would accept an unrelated verified signature, and the native
  program alone would not bind the signature to the channel. The offsets header
  additionally pins the signature, public-key, and message instruction indices to
  this instruction, so the native program verifies exactly the bytes checked here.
- `expiry` is taken from the stored channel, not from the caller, which prevents
  a stale check from being replayed after the channel's window.

## Replay and regression protection

- **Monotonic nonce** — every settlement path requires `nonce > channel.nonce`,
  so an old check cannot override a newer one.
- **Cumulative floor** — `cumulative_amount` may never decrease and may never
  exceed `deposit`, so neither party can settle more than was funded or roll a
  channel backward.
- **Dispute window** — a unilateral close opens a 120-second window during which a
  higher-nonce check overrides the pending close. Instead of Lightning-style
  revocation and full forfeiture, Otomat relies on monotonic nonces plus on-chain
  signature checks to void outdated state.
- **Duplicate open** — because the channel is an `init` PDA keyed by
  `(payer, payee, mint)`, a second open for an active channel fails; the account
  is reusable only after close.

## `exact` scheme constraints

The `exact` decoder enforces the Coinbase SVM rules so a facilitator cannot be
tricked into settling a malformed transfer:

- exact instruction order and count, with compute-unit limit and price ceilings;
- `TransferChecked` mint, amount, authority, and source/destination ATAs matched
  against the payment requirements;
- fee-payer constraints (the fee payer may not appear in any instruction, be the
  transfer authority, or be the source ATA), which is what makes gasless payment
  safe;
- recent-blockhash validity and a 120-second replay cache keyed by signature.

## Known limitations

- **Not audited.** The mainnet-beta program has not had a formal audit. Do not custody mainnet funds until an audited release is tagged.
- **Token-2022 extensions.** The program processes standard `TransferChecked`.
  Fee-on-transfer, transfer-hook whitelisting, and confidential-transfer rejection
  are enforced off-chain by the facilitator today; on-chain extension policy is a
  v2 item.
- **Governance is a single key** in v1 (`GOVERNANCE_PUBKEY`), used only to slash
  facilitator bonds. It cannot touch channel funds. Migration to an on-chain
  governance program is planned.
- **Rent** — each session creates and closes a channel account. A reusable
  per-pair channel is under consideration.
- **Facilitator availability** — a disappeared facilitator cannot steal funds, but
  a payer may need `timeout_reclaim` (after expiry) or a payee may need
  `dispute_channel` to settle without cooperation.
