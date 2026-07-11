# @otomat/middleware

One line turns any endpoint into a paid x402 API. Drop `otomat.express`, `otomat.next`,
or `otomat.hono` in front of a handler and every call negotiates a Solana micropayment
over HTTP 402 before your resource runs.

- Speaks x402 **v2** (`PAYMENT-SIGNATURE` / `PAYMENT-REQUIRED` / `PAYMENT-RESPONSE`) and
  accepts **v1** (`X-PAYMENT`) clients for backward compatibility.
- Settle-first flow: `verify` → `settle` → your handler, so a failed settlement never has
  to roll back an already-produced response body.
- Solana `exact` scheme, USDC by default, gasless for the payer (the facilitator is the fee payer).

## Install

```bash
pnpm add @otomat/middleware
# plus whichever framework you use:
pnpm add express        # or: next, hono
```

`express`, `next`, and `hono` are optional peer dependencies — install only the one you need.

## Express

```ts
import express from 'express';
import { otomat } from '@otomat/middleware';

const app = express();

app.get(
  '/api/premium',
  otomat.express({ price: '$0.002', payTo: 'YourSolanaPubkey', network: 'solana:mainnet' }),
  (req, res) => {
    res.json({ data: 'premium content' });
  },
);
```

## Next.js (App Router)

```ts
// app/api/premium/route.ts
import { otomat } from '@otomat/middleware';

export const GET = otomat.next({ price: '$0.002', payTo: 'YourSolanaPubkey' }, async (req) => {
  return Response.json({ data: 'premium content' });
});
```

## Hono

```ts
import { Hono } from 'hono';
import { otomat } from '@otomat/middleware';

const app = new Hono();

app.get('/api/premium', otomat.hono({ price: '$0.002', payTo: 'YourSolanaPubkey' }), (c) =>
  c.json({ data: 'premium content' }),
);
```

## Pricing

`price` accepts several forms, all resolved to atomic token units:

```ts
otomat.express({ price: '$0.002', payTo });                 // 2000 atomic USDC (6 decimals)
otomat.express({ price: '0.002 USDC', payTo });             // same
otomat.express({ price: '2000usdc-atomic', payTo });        // already atomic
otomat.express({ price: { amount: '2000', decimals: 6 }, payTo });
```

## Config reference

| Field               | Type                                             | Default                          |
| ------------------- | ------------------------------------------------ | -------------------------------- |
| `price`             | `string \| { amount, decimals }`                 | required                         |
| `payTo`             | `string` (Solana pubkey)                         | required (or `OTOMAT_PAY_TO` env) |
| `asset`             | `'USDC' \| 'SOL' \| mint`                        | `'USDC'`                         |
| `network`           | `'solana:mainnet' \| 'solana:devnet' \| CAIP-2`  | `'solana:mainnet'`               |
| `facilitatorUrl`    | `string`                                         | `https://facilitator.otomat.fun`  |
| `scheme`            | `'exact' \| 'otomat-channel' \| string`          | `'exact'`                        |
| `maxTimeoutSeconds` | `number`                                         | `60`                             |
| `feePayer`          | `string`                                         | fetched from `/supported`        |
| `description`       | `string`                                         | —                                |
| `mimeType`          | `string`                                         | `'application/json'`             |
| `extra`             | `Record<string, unknown>`                        | `{}`                             |
| `x402Version`       | `1 \| 2`                                         | `2`                              |
| `onSettled`         | `(result) => void \| Promise<void>`              | —                                |
| `onError`           | `(err, req) => void`                             | —                                |

`payTo`, `facilitatorUrl`, and `feePayer` can also come from the `OTOMAT_PAY_TO`,
`OTOMAT_FACILITATOR_URL` environment variables and the facilitator's `/supported` endpoint.

## How a request flows

1. No payment header → `402` with `PAYMENT-REQUIRED` (base64 JSON `PaymentRequirements`).
2. Client re-requests with `PAYMENT-SIGNATURE` (v2) or `X-PAYMENT` (v1).
3. Middleware decodes and validates the payload, then calls `POST {facilitatorUrl}/verify`.
4. On `isValid`, it calls `POST {facilitatorUrl}/settle` (settle-first).
5. On success, your handler runs and the response carries `PAYMENT-RESPONSE`
   (or `X-PAYMENT-RESPONSE` for v1) with the settlement receipt.
6. Any verification or settlement failure returns `402` with an `errorReason`.

## Framework-agnostic core

The adapters are thin wrappers over an exported engine, so you can wire OTOMAT into any
framework:

```ts
import { resolveConfig, evaluatePayment, to402 } from '@otomat/middleware';

const resolved = resolveConfig({ price: '$0.002', payTo });
const decision = await evaluatePayment(resolved, {
  method: request.method,
  url: request.url,
  header: (name) => request.headers.get(name) ?? undefined,
});
// decision.outcome: 'require' | 'invalid' | 'proceed' | 'error'
```

## License

MIT
