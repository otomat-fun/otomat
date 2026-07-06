# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Mainnet deployment of the `otomat-rail` settlement program.
- `otomat-stream` scheme (Token-2022 transfer-hook streaming settlement).
- Public facilitator endpoint and hosted Bazaar discovery index.

## [0.1.0] - 2026-07-11

First public cut of the Otomat monorepo. The settlement program is deployed to
devnet; mainnet is targeted for a later release.

### Added

- `otomat-rail` Anchor 0.31 program: escrow channels, cooperative and unilateral
  close with a dispute window, timeout reclaim, on-chain receipts, and
  facilitator bond/slash.
- Ed25519 check verification through the instructions sysvar, with a canonical
  check message shared byte-for-byte between the program and the SDK.
- `@otomat/sdk`: x402 v2 payload builders for the `exact` and `otomat-channel`
  schemes, a 402 challenge/response client, and an MCP paid-tool adapter.
- `@otomat/middleware`: one-line monetization adapters for Express, Next.js, and
  Hono over a shared payment core.
- `@otomat/payment-channel`: off-chain check signing, the canonical message
  builder, and Anchor I/O helpers for channel open/close.
- `@otomat/agent-wallet-kit`: budget, whitelist, and time-window spend policies
  for autonomous agent payments.
- Architecture, x402 compliance, settlement, and security documentation.

[Unreleased]: https://github.com/otomat-fun/otomat/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/otomat-fun/otomat/releases/tag/v0.1.0
