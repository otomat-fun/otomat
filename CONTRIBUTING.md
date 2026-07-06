# Contributing to Otomat

Thanks for taking the time to look at Otomat. This repository holds the public
core of the payment rail: the Anchor settlement program, the TypeScript SDK, the
monetization middleware, the payment-channel primitives, and the agent wallet
kit. Contributions to any of these are welcome.

## Development setup

Requirements:

- Node.js 22+ and pnpm 9 (`corepack enable`)
- Rust stable and the Anchor CLI 0.31.1 (for the on-chain program)
- The Solana CLI (for local validator tests)

Install and verify the workspace:

```bash
pnpm install
pnpm build
pnpm test
```

The Anchor program is a separate Cargo workspace at the repository root:

```bash
cargo fmt --all -- --check
cargo check --workspace
anchor test        # spins up a local validator and runs tests/otomat-rail.ts
```

## Ground rules

- Keep the canonical check message in `programs/otomat-rail/src/constants.rs`,
  `programs/otomat-rail/src/ed25519.rs`, and the SDK/payment-channel builders in
  exact byte agreement. A mismatch silently breaks channel settlement.
- Preserve x402 v2 wire compatibility. Header names live behind constants; do not
  inline raw strings.
- Add or update tests for any behavior change. The `exact` scheme decoder and the
  channel message layout are covered by fixtures — extend them rather than
  loosening assertions.
- Run `pnpm lint`, `pnpm test`, and `cargo fmt` before opening a pull request.

## Commit style

Write clear, descriptive commit subjects in plain language. Keep each commit
focused on a single change so history stays readable.

## Reporting issues

Open a GitHub issue with a minimal reproduction. For anything security-sensitive,
follow [SECURITY.md](./SECURITY.md) instead of filing a public issue.
