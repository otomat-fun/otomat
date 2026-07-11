<div align="center">

<img src="./assets/github-banner.png" alt="Otomat — Insert coin. Receive response." width="900" />

<h1>Otomat</h1>

<p><em>솔라나의 x402 마이크로페이먼트 레일. Insert coin. Receive response.</em></p>

<p>
  <a href="https://otomat.fun"><img src="https://img.shields.io/badge/website-otomat.fun-C79A4B?style=flat-square" alt="Website" /></a>
  <a href="https://x.com/otomat_rail"><img src="https://img.shields.io/badge/X-@otomat__rail-1C1A17?style=flat-square&logo=x" alt="X" /></a>
  <a href="https://github.com/otomat-fun/otomat/actions"><img src="https://img.shields.io/github/actions/workflow/status/otomat-fun/otomat/ci.yml?branch=main&style=flat-square" alt="Build" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/otomat-fun/otomat?style=flat-square" alt="License" /></a>
  <a href="https://www.anchor-lang.com/"><img src="https://img.shields.io/badge/anchor-0.31.1-E8B04B?style=flat-square" alt="Anchor" /></a>
  <a href="https://solana.com/"><img src="https://img.shields.io/badge/solana-devnet-C9CDD2?style=flat-square&logo=solana" alt="Solana" /></a>
</p>

<p><b>English</b>: <a href="./README.md">README.md</a></p>

</div>

## Otomat이란

Otomat은 솔라나 위의 [x402](https://github.com/coinbase/x402) 결제 레일입니다.
x402는 HTTP `402 Payment Required` 상태 코드를 머신 대 머신 결제 프로토콜로
되살립니다. 서버가 요청에 가격으로 답하면, 호출자가 결제에 서명하고 다시
요청해 응답을 받습니다. Otomat은 이 교환을 솔라나에서 처음부터 끝까지
구현합니다 — Anchor 정산 프로그램, Coinbase SVM 스펙을 그대로 따르는 `exact`
스킴 디코더, 반복 호출을 위한 페이먼트 채널 스킴, 한 줄 수익화 미들웨어,
그리고 자율 에이전트를 위한 지갑 킷입니다.

1950년대 오토맷(Automat) 식당이 그 은유입니다. 점원은 없습니다. 동전을 넣고
손잡이를 돌리면 유리문이 철컥 열리고 접시가 나옵니다. 돈이 들어가야 문이
열린다 — `402`가 정확히 이것입니다. 기계가 동전을 넣고 기계가 응답을 냅니다.

> **상태.** 프리릴리스. `otomat-rail` 프로그램은 솔라나 **devnet**에 배포되어
> 있으며, 메인넷은 이후 마일스톤 대상입니다. 웹 앱과 호스티드 페실리테이터는
> 진행 중입니다. 아직 메인넷 자금을 맡기지 마세요.

## 왜 솔라나 위의 x402인가

- **월 단위가 아닌 호출 단위.** 구독이나 반복 청구가 아니라 요청당 push 결제
  (`402`)입니다. 에이전트는 자신이 한 호출에 대해서만 정확히 지불합니다.
- **payer는 가스리스.** `exact` 스킴에서 페실리테이터가 fee payer이므로 SOL
  잔고가 0인 호출자도 USDC로 결제할 수 있습니다.
- **초 이하, 센트 이하.** 솔라나의 파이널리티와 수수료 덕분에 다른 곳에서는
  비현실적인 마이크로페이먼트가 실제로 동작합니다.
- **표준 준수.** x402 **v2** 헤더를 사용하고 Coinbase SVM `exact` 스킴을 바이트
  단위로 따르며, 배치 세션을 위한 `otomat-channel` 스킴으로 확장합니다.

## 모노레포 구성

```
otomat/
├── programs/otomat-rail/   Anchor 0.31 정산 프로그램 (Rust)
├── sdk/                    @otomat/sdk — 페이로드 빌더, 402 클라이언트, MCP 어댑터
├── middleware/             @otomat/middleware — Express / Next / Hono 어댑터
├── payment-channel/        @otomat/payment-channel — 오프체인 check + anchor I/O
├── agent-wallet-kit/       @otomat/agent-wallet-kit — 예산 / 화이트리스트 / 시간 정책
├── docs/                   아키텍처 · x402 준수 · 정산 · 보안
└── tests/                  Anchor 통합 테스트 (mocha)
```

## 빠른 시작

패키지는 워크스페이스로 링크되어 있으며 레일이 안정화되는 대로 배포됩니다.
지금은 클론 후 빌드하세요:

```bash
git clone https://github.com/otomat-fun/otomat.git
cd otomat
pnpm install
pnpm build          # sdk, middleware, payment-channel, agent-wallet-kit
pnpm test           # 4개 패키지에 걸친 65개 유닛 테스트
```

미들웨어 한 줄로 아무 엔드포인트나 유료 x402 API로 전환합니다:

```ts
import express from 'express';
import { otomat } from '@otomat/middleware';

const app = express();

app.get(
  '/api/premium',
  otomat.express({ price: '$0.002', payTo: 'YourSolanaPubkey' }),
  (req, res) => res.json({ data: 'premium content' }),
);
```

## 문서

- [Architecture](./docs/architecture.md) — 구성 요소가 어떻게 맞물리는지
- [x402 compliance](./docs/x402-spec.md) — 스킴, 헤더, 편차
- [Settlement spec](./docs/settlement-spec.md) — 온체인 프로그램 상세
- [Security model](./docs/security.md) — 신뢰 가정과 위협 모델

## 라이선스

[MIT](./LICENSE) © 2026 Otomat
