# Security Policy

## Status

Otomat is pre-production software. The `otomat-rail` settlement program is
deployed to Solana **mainnet-beta**; the public interactive demo and hosted
facilitator run on devnet. The mainnet program has **not** been audited — do not
use it to custody mainnet funds until an audited release is tagged, and treat
every interface here as experimental.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes (active development) |
| < 0.1   | No        |

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Do **not** open a public
issue for security problems.

- Use GitHub's [private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
  on this repository, or
- Email `security@otomat.fun`.

Include a description, affected component (program, SDK, middleware, channel, or
wallet kit), and a reproduction if possible. We aim to acknowledge reports within
72 hours.

## Scope

In scope:

- The `otomat-rail` Anchor program (escrow, settlement, dispute, receipts, bond).
- The x402 payload builders and verification logic in `@otomat/sdk`.
- The monetization middleware and payment-channel primitives.

Especially interesting:

- Ed25519 check forgery or replay across channels.
- Nonce or cumulative-amount regressions that let a payer or payee over- or
  under-settle.
- Fee-payer constraint bypasses in the `exact` scheme decoder.
- Dispute-window race conditions in unilateral close.

Out of scope:

- The hosted facilitator, indexer, web app, and browser extension, which live in
  separate repositories.
- Denial of service from unbounded RPC usage.

See [docs/security.md](./docs/security.md) for the threat model and trust
assumptions.
