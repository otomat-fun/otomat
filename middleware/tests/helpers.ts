import { SOLANA_MAINNET } from '../src/constants.js';
import { encodeBase64Json } from '../src/headers.js';
import type { FetchLike, FetchResponse, SettleResult, VerifyResponse } from '../src/types.js';

function jsonRes(body: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

export interface MockFacilitatorOptions {
  verify?: VerifyResponse;
  settle?: SettleResult;
  feePayer?: string;
}

export interface MockFacilitator {
  fetch: FetchLike;
  calls: { verify: number; settle: number; supported: number };
}

/** In-memory facilitator injected via `config.fetch` so adapters can be tested without a server. */
export function mockFacilitator(options: MockFacilitatorOptions = {}): MockFacilitator {
  const calls = { verify: 0, settle: 0, supported: 0 };
  const fetch: FetchLike = async (url) => {
    if (url.endsWith('/supported')) {
      calls.supported += 1;
      return jsonRes({
        kinds: [{ scheme: 'exact', network: SOLANA_MAINNET }],
        signers: options.feePayer ? { [SOLANA_MAINNET]: options.feePayer } : {},
      });
    }
    if (url.endsWith('/verify')) {
      calls.verify += 1;
      return jsonRes(options.verify ?? { isValid: true, payer: 'PAYER_PUBKEY' });
    }
    if (url.endsWith('/settle')) {
      calls.settle += 1;
      return jsonRes(
        options.settle ?? {
          success: true,
          payer: 'PAYER_PUBKEY',
          transaction: 'SETTLED_SIGNATURE',
          network: SOLANA_MAINNET,
        },
      );
    }
    return jsonRes({ error: 'not found' }, 404);
  };
  return { fetch, calls };
}

export function v2PaymentSignature(overrides: Record<string, unknown> = {}): string {
  return encodeBase64Json({
    x402Version: 2,
    scheme: 'exact',
    network: SOLANA_MAINNET,
    payload: { transaction: 'BASE64_VERSIONED_TX' },
    ...overrides,
  });
}

export function v1XPayment(): string {
  return encodeBase64Json({
    x402Version: 1,
    scheme: 'exact',
    network: 'solana-mainnet',
    payload: { serializedTransaction: 'BASE64_VERSIONED_TX' },
  });
}

export const FAILED_SETTLE: SettleResult = {
  success: false,
  errorReason: 'settlement_failed',
  transaction: '',
  network: SOLANA_MAINNET,
};

export const BASE_CONFIG = {
  price: '$0.002',
  payTo: 'PAYTO_PUBKEY_11111111111111111111111111111',
  feePayer: 'FEEPAYER_PUBKEY_1111111111111111111111111',
};
