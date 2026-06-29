import { Connection, type Keypair } from '@solana/web3.js';
import {
  OtomatClient,
  X402_HEADERS,
  decodePaymentRequired,
  encodePaymentSignature,
  type PaymentAccount,
  type PaymentPayload,
  type PaymentRequirementItem,
  type PaymentRequirements,
  type WalletAdapterLike,
} from '@otomat/sdk';
import {
  createSpendState,
  evaluatePolicy,
  recordSpend,
  type PaymentAttempt,
  type SpendPolicy,
  type SpendState,
} from './spend-policy.js';

export interface AgentWalletConfig {
  keypair: Keypair | WalletAdapterLike;
  policy: SpendPolicy;
  facilitatorUrl?: string;
  connection?: Connection;
  /** Inject a pre-built payment account (used in tests). */
  client?: PaymentAccount;
  fetchImpl?: typeof fetch;
  /** Injectable clock; defaults to Date.now. */
  now?: () => number;
}

export type PayOptions = RequestInit;

export interface PayResult {
  response: Response;
  paid: boolean;
  amount: bigint;
  asset: string;
  requirement?: PaymentRequirementItem;
  payload?: PaymentPayload;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * A payment-enforcing wrapper for an agent's key. It performs the x402 402 flow
 * on `fetch`/`pay`, evaluating the spend policy before every payment and
 * tracking cumulative spend. It also satisfies PaymentAccount so it can back an
 * MCP `withPayment` client.
 */
export class AgentWallet implements PaymentAccount {
  private readonly policy: SpendPolicy;
  private readonly client: PaymentAccount;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private state: SpendState;

  constructor(config: AgentWalletConfig) {
    this.policy = config.policy;
    this.fetchImpl = config.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.now = config.now ?? (() => Date.now());
    this.state = createSpendState();
    this.client =
      config.client ??
      new OtomatClient({
        facilitatorUrl: config.facilitatorUrl,
        payer: config.keypair,
        connection: config.connection ?? new Connection('https://api.mainnet-beta.solana.com'),
        fetchImpl: this.fetchImpl,
      });
  }

  /** fetch wrapper: transparently pays a 402 subject to the spend policy. */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const result = await this.payInternal(input, init);
    return result.response;
  }

  /** Like fetch, but returns the payment details alongside the response. */
  async pay(url: string, options?: PayOptions): Promise<PayResult> {
    return this.payInternal(url, options);
  }

  getSpent(): { total: bigint; byAsset: Record<string, bigint> } {
    return { total: this.state.total, byAsset: { ...this.state.byAsset } };
  }

  reset(): void {
    this.state = createSpendState();
  }

  /** PaymentAccount implementation used by MCP `withPayment`. */
  async buildExactPayload(requirement: PaymentRequirementItem): Promise<PaymentPayload> {
    const attempt: PaymentAttempt = {
      url: '',
      domain: '',
      amount: BigInt(requirement.amount),
      asset: requirement.asset,
    };
    await evaluatePolicy(this.policy, attempt, this.state, this.now());
    const payload = await this.client.buildExactPayload(requirement);
    recordSpend(this.state, attempt, this.now());
    return payload;
  }

  private async payInternal(input: RequestInfo | URL, init?: RequestInit): Promise<PayResult> {
    const url = this.urlOf(input);
    const first = await this.fetchImpl(input, init);
    if (first.status !== 402) {
      return { response: first, paid: false, amount: 0n, asset: '' };
    }

    const requirements = await this.readRequirements(first);
    const requirement = this.selectExact(requirements);
    const attempt: PaymentAttempt = {
      url,
      domain: domainOf(url),
      amount: BigInt(requirement.amount),
      asset: requirement.asset,
    };

    await evaluatePolicy(this.policy, attempt, this.state, this.now());

    const payload = await this.client.buildExactPayload(requirement);
    const headers = new Headers(init?.headers);
    headers.set(X402_HEADERS.PAYMENT_SIGNATURE, encodePaymentSignature(payload));
    const response = await this.fetchImpl(input, { ...init, headers });

    recordSpend(this.state, attempt, this.now());
    return { response, paid: true, amount: attempt.amount, asset: attempt.asset, requirement, payload };
  }

  private urlOf(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input.url;
  }

  private async readRequirements(response: Response): Promise<PaymentRequirements> {
    const header =
      response.headers.get(X402_HEADERS.PAYMENT_REQUIRED) ??
      response.headers.get(X402_HEADERS.LEGACY_PAYMENT);
    if (header) return decodePaymentRequired(header);
    return (await response.clone().json()) as PaymentRequirements;
  }

  private selectExact(requirements: PaymentRequirements): PaymentRequirementItem {
    const exact = requirements.accepts.find((item) => item.scheme === 'exact') ?? requirements.accepts[0];
    if (!exact) throw new Error('server offered no payment requirements');
    return exact;
  }
}
