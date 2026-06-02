import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import crossFetch from 'cross-fetch';
import {
  NETWORKS,
  USDC_MAINNET,
  decodePaymentRequired,
  encodePaymentRequired,
  encodePaymentResponse,
} from './headers.js';
import type {
  PaymentAccount,
  PaymentPayload,
  PaymentRequirementItem,
  PaymentRequirements,
  SettlementResponse,
} from './types.js';

/** `_meta` keys used to carry x402 state across an MCP tool call boundary. */
export const PAYMENT_REQUIRED_META = 'x402/payment-required';
export const PAYMENT_RESPONSE_META = 'x402/payment-response';

export interface VerifyResult {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
}

export interface FacilitatorLike {
  verify(payload: PaymentPayload, requirement: PaymentRequirementItem): Promise<VerifyResult>;
  settle(payload: PaymentPayload, requirement: PaymentRequirementItem): Promise<SettlementResponse>;
}

/** A facilitator client that speaks to a remote /verify and /settle over HTTP. */
export function httpFacilitator(
  url: string,
  fetchImpl: typeof fetch = crossFetch as typeof fetch,
): FacilitatorLike {
  const post = async (path: string, body: unknown): Promise<unknown> => {
    const res = await fetchImpl(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  };
  return {
    async verify(paymentPayload, paymentRequirements) {
      return (await post('/verify', { paymentPayload, paymentRequirements })) as VerifyResult;
    },
    async settle(paymentPayload, paymentRequirements) {
      return (await post('/settle', { paymentPayload, paymentRequirements })) as SettlementResponse;
    },
  };
}

/** Parse a price like '$0.002', '0.002', or 0.002 into a smallest-unit string. */
export function parsePrice(price: string | number, decimals = 6): string {
  const numeric = typeof price === 'number' ? price : Number(price.replace(/^\$/, '').trim());
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`invalid price: ${String(price)}`);
  return BigInt(Math.round(numeric * 10 ** decimals)).toString();
}

export type PaidToolServer = Pick<McpServer, 'registerTool'>;

export interface PaidToolConfig {
  name: string;
  price: string | number;
  payTo: string;
  network?: string;
  asset?: string;
  description?: string;
  schema: z.ZodObject<z.ZodRawShape>;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult> | CallToolResult;
  facilitator?: FacilitatorLike;
  facilitatorUrl?: string;
}

/**
 * Register a paid MCP tool. A call without an `x402Payment` argument returns a
 * PAYMENT-REQUIRED result (carried in `_meta`); a call with a valid payment is
 * verified, the handler runs, and the settlement is returned in `_meta`.
 */
export function paidTool(server: PaidToolServer, config: PaidToolConfig): void {
  const requirement: PaymentRequirementItem = {
    scheme: 'exact',
    network: config.network ?? NETWORKS.SOLANA_MAINNET,
    amount: parsePrice(config.price),
    asset: config.asset ?? USDC_MAINNET,
    payTo: config.payTo,
    maxTimeoutSeconds: 60,
    extra: {},
  };
  const requirements: PaymentRequirements = {
    x402Version: 2,
    error: 'payment required',
    resource: { url: config.name, description: config.description, mimeType: 'application/json' },
    accepts: [requirement],
    extensions: {},
  };
  const facilitator =
    config.facilitator ?? (config.facilitatorUrl ? httpFacilitator(config.facilitatorUrl) : undefined);

  const inputSchema: z.ZodRawShape = { ...config.schema.shape, x402Payment: z.string().optional() };

  server.registerTool(
    config.name,
    { description: config.description, inputSchema },
    async (args: Record<string, unknown>): Promise<CallToolResult> => {
      const payment = args.x402Payment;
      if (typeof payment !== 'string' || payment.length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'PAYMENT-REQUIRED' }],
          _meta: { [PAYMENT_REQUIRED_META]: encodePaymentRequired(requirements) },
        };
      }
      if (!facilitator) {
        throw new Error('paidTool needs a facilitator or facilitatorUrl to verify payment');
      }
      const payload = JSON.parse(
        Buffer.from(payment, 'base64').toString('utf8'),
      ) as PaymentPayload;
      const verification = await facilitator.verify(payload, requirement);
      if (!verification.isValid) {
        return {
          isError: true,
          content: [{ type: 'text', text: `payment rejected: ${verification.invalidReason ?? 'invalid'}` }],
        };
      }
      const { x402Payment: _consumed, ...toolArgs } = args;
      const result = await config.handler(toolArgs);
      const settlement = await facilitator.settle(payload, requirement);
      return {
        ...result,
        _meta: { ...(result._meta ?? {}), [PAYMENT_RESPONSE_META]: encodePaymentResponse(settlement) },
      };
    },
  );
}

export interface CallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export type CallToolResultLike = { _meta?: Record<string, unknown> } & Record<string, unknown>;

export interface McpCallToolClient {
  callTool(params: CallToolParams, ...rest: unknown[]): Promise<CallToolResultLike>;
}

export interface WithPaymentConfig {
  account: PaymentAccount;
  requirementSelector?: (accepts: PaymentRequirementItem[]) => PaymentRequirementItem | undefined;
}

/**
 * Wrap an MCP client so tool calls automatically pay. When a call returns a
 * PAYMENT-REQUIRED result, the wrapper builds an exact payload from `account`
 * and replays the call with the payment attached.
 */
export function withPayment<C extends McpCallToolClient>(client: C, config: WithPaymentConfig): C {
  const callTool = client.callTool.bind(client);

  const wrapped = async (
    params: CallToolParams,
    ...rest: unknown[]
  ): Promise<CallToolResultLike> => {
    const first = await callTool(params, ...rest);
    const requiredMeta = first._meta?.[PAYMENT_REQUIRED_META];
    if (typeof requiredMeta !== 'string') return first;

    const requirements = decodePaymentRequired(requiredMeta);
    const selected = config.requirementSelector
      ? config.requirementSelector(requirements.accepts)
      : requirements.accepts.find((item) => item.scheme === 'exact') ?? requirements.accepts[0];
    if (!selected) return first;

    const payload = await config.account.buildExactPayload(selected);
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    return callTool(
      { ...params, arguments: { ...(params.arguments ?? {}), x402Payment: encoded } },
      ...rest,
    );
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'callTool') return wrapped;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
