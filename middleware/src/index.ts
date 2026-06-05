import {
  assetDecimals,
  DEFAULT_FACILITATOR_URL,
  DEFAULT_MAX_TIMEOUT_SECONDS,
  DEFAULT_X402_VERSION,
  normalizeNetwork,
  resolveMint,
} from './constants.js';
import { FacilitatorClient } from './facilitator-client.js';
import {
  decodeBase64Json,
  detectPaymentHeader,
  encodeBase64Json,
  paymentResponseHeaderName,
  X402_HEADERS,
} from './headers.js';
import { parsePrice } from './price.js';
import { paymentPayloadSchema } from './types.js';
import type {
  OtomatConfig,
  PaymentPayload,
  PaymentRequirementItem,
  PaymentRequirements,
  SettleResult,
} from './types.js';
import { otomatExpress } from './express.js';
import { otomatHono } from './hono.js';
import { otomatNext } from './next.js';

export interface ResolvedOtomatConfig {
  amount: string;
  asset: string;
  mint: string;
  network: string;
  payTo: string;
  facilitatorUrl: string;
  scheme: string;
  maxTimeoutSeconds: number;
  description?: string;
  mimeType: string;
  feePayer?: string;
  extra: Record<string, unknown>;
  x402Version: 1 | 2;
  onSettled?: (result: SettleResult) => void | Promise<void>;
  onError?: (err: Error, req: unknown) => void;
  client: FacilitatorClient;
}

/** Apply defaults, validate required fields, and build the facilitator client (once per adapter). */
export function resolveConfig(config: OtomatConfig): ResolvedOtomatConfig {
  const network = normalizeNetwork(config.network);
  const asset = config.asset ?? 'USDC';
  const mint = resolveMint(asset, network);
  const { amount } = parsePrice(config.price, assetDecimals(asset));

  const payTo = config.payTo ?? process.env.OTOMAT_PAY_TO ?? process.env.OTOMAT_PAYTO ?? undefined;
  if (!payTo) {
    throw new Error('otomat: `payTo` is required (pass config.payTo or set the OTOMAT_PAY_TO env var).');
  }

  const facilitatorUrl =
    config.facilitatorUrl ?? process.env.OTOMAT_FACILITATOR_URL ?? DEFAULT_FACILITATOR_URL;

  return {
    amount,
    asset,
    mint,
    network,
    payTo,
    facilitatorUrl,
    scheme: config.scheme ?? 'exact',
    maxTimeoutSeconds: config.maxTimeoutSeconds ?? DEFAULT_MAX_TIMEOUT_SECONDS,
    description: config.description,
    mimeType: config.mimeType ?? 'application/json',
    feePayer: config.feePayer,
    extra: config.extra ?? {},
    x402Version: config.x402Version ?? DEFAULT_X402_VERSION,
    onSettled: config.onSettled,
    onError: config.onError,
    client: new FacilitatorClient({ baseUrl: facilitatorUrl, fetch: config.fetch }),
  };
}

/** Build the x402 PaymentRequirements advertised in a 402 response. */
export async function buildRequirements(
  resolved: ResolvedOtomatConfig,
  url: string,
): Promise<PaymentRequirements> {
  const feePayer =
    resolved.feePayer ??
    (resolved.extra.feePayer as string | undefined) ??
    (await resolved.client.getFeePayer(resolved.network));

  const extra: Record<string, unknown> = {
    ...(feePayer ? { feePayer } : {}),
    ...resolved.extra,
  };

  return {
    x402Version: resolved.x402Version,
    error: 'PAYMENT-SIGNATURE header is required',
    resource: {
      url,
      description: resolved.description,
      mimeType: resolved.mimeType,
    },
    accepts: [
      {
        scheme: resolved.scheme,
        network: resolved.network,
        amount: resolved.amount,
        asset: resolved.mint,
        payTo: resolved.payTo,
        maxTimeoutSeconds: resolved.maxTimeoutSeconds,
        extra,
      },
    ],
    extensions: {},
  };
}

export interface OtomatRequestLike {
  method: string;
  url: string;
  header(name: string): string | undefined;
}

export type OtomatDecision =
  | { outcome: 'require'; requirements: PaymentRequirements }
  | { outcome: 'invalid'; errorReason: string; requirements: PaymentRequirements }
  | { outcome: 'proceed'; settlement: SettleResult; header: { name: string; value: string } }
  | { outcome: 'error'; status: number; message: string };

function invalid(base: PaymentRequirements, errorReason: string): OtomatDecision {
  return { outcome: 'invalid', errorReason, requirements: { ...base, error: errorReason } };
}

/** Normalise a v1 `X-PAYMENT` payload into the v2 shape before verify/settle. */
function normalizeV1Payload(raw: unknown, resolved: ResolvedOtomatConfig): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const r = raw as Record<string, unknown>;
  const inner: Record<string, unknown> =
    typeof r.payload === 'object' && r.payload !== null
      ? { ...(r.payload as Record<string, unknown>) }
      : {};
  if (inner.transaction == null) {
    const legacy = inner.serializedTransaction ?? r.serializedTransaction ?? r.transaction;
    if (legacy != null) inner.transaction = legacy;
  }
  const network = typeof r.network === 'string' ? normalizeNetwork(r.network) : resolved.network;
  return {
    x402Version: 2,
    scheme: typeof r.scheme === 'string' ? r.scheme : resolved.scheme,
    network,
    accepted: r.accepted,
    payload: inner,
    extensions: r.extensions,
  };
}

/**
 * Framework-agnostic x402 engine. Runs the settle-first flow
 * (verify -> settle -> proceed) and returns a decision for the adapter to render.
 */
export async function evaluatePayment(
  resolved: ResolvedOtomatConfig,
  req: OtomatRequestLike,
): Promise<OtomatDecision> {
  const requirements = await buildRequirements(resolved, req.url);
  const requirementItem: PaymentRequirementItem = requirements.accepts[0]!;

  const detected = detectPaymentHeader((name) => req.header(name));
  if (!detected) {
    return { outcome: 'require', requirements };
  }

  let decoded: unknown;
  try {
    decoded = decodeBase64Json(detected.raw);
  } catch {
    return invalid(requirements, 'invalid_payment_payload');
  }

  const normalized = detected.version === 1 ? normalizeV1Payload(decoded, resolved) : decoded;
  const parsed = paymentPayloadSchema.safeParse(normalized);
  if (!parsed.success) {
    return invalid(requirements, 'invalid_payment_payload');
  }

  const payload: PaymentPayload = {
    ...parsed.data,
    x402Version: 2,
    accepted: parsed.data.accepted ?? (requirementItem as unknown as Record<string, unknown>),
  };

  if (payload.scheme === 'exact') {
    const tx = (payload.payload as { transaction?: unknown }).transaction;
    if (typeof tx !== 'string' || tx.length === 0) {
      return invalid(requirements, 'invalid_payment_payload');
    }
  }

  try {
    const verifyRes = await resolved.client.verify(payload, requirementItem);
    if (!verifyRes.isValid) {
      return invalid(requirements, verifyRes.invalidReason ?? 'payment_verification_failed');
    }

    // settle-first: settle before the resource handler runs, so a failed
    // settlement never has to roll back an already-produced response body.
    const settleRes = await resolved.client.settle(payload, requirementItem);
    if (!settleRes.success) {
      return invalid(requirements, settleRes.errorReason ?? 'settlement_failed');
    }

    if (resolved.onSettled) await resolved.onSettled(settleRes);

    return {
      outcome: 'proceed',
      settlement: settleRes,
      header: {
        name: paymentResponseHeaderName(detected.version),
        value: encodeBase64Json(settleRes),
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    try {
      resolved.onError?.(error, req);
    } catch {
      /* onError callbacks must never break the response path */
    }
    return { outcome: 'error', status: 502, message: 'payment facilitator unavailable' };
  }
}

/** Render a `require` / `invalid` decision into an HTTP 402 response. */
export function to402(decision: { requirements: PaymentRequirements }): {
  status: 402;
  headers: Record<string, string>;
  body: PaymentRequirements;
} {
  return {
    status: 402,
    headers: { [X402_HEADERS.PAYMENT_REQUIRED]: encodeBase64Json(decision.requirements) },
    body: decision.requirements,
  };
}

/**
 * Config-factory form: fills defaults and returns a config you can pass to any adapter.
 * Generic so the caller's field types (asset, price, payTo) are preserved on the result.
 */
function otomatFactory<C extends OtomatConfig>(config: C): C {
  const merged: OtomatConfig = { asset: 'USDC', network: 'solana:mainnet', scheme: 'exact', ...config };
  return merged as C;
}

/**
 * One-line monetization for any endpoint.
 *
 * ```ts
 * app.get('/api/premium', otomat.express({ price: '$0.002', payTo }), handler);
 * ```
 */
export const otomat = Object.assign(otomatFactory, {
  express: otomatExpress,
  next: otomatNext,
  hono: otomatHono,
});

export { otomatExpress } from './express.js';
export { otomatNext } from './next.js';
export { otomatHono } from './hono.js';
export { FacilitatorClient, FacilitatorError, defaultFetch } from './facilitator-client.js';
export type { FacilitatorClientOptions } from './facilitator-client.js';
export { parsePrice } from './price.js';
export type { ParsedPrice } from './price.js';
export * from './headers.js';
export * from './constants.js';
export * from './types.js';
