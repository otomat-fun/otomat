/**
 * Network identifiers (CAIP-2), token mints, and shared defaults for the
 * OTOMAT x402 middleware. Network ids follow CAIP-2: `solana:{genesisHash32}`.
 */

export const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

export const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

export const DEFAULT_FACILITATOR_URL = 'https://facilitator.otomat.fi';
export const DEFAULT_MAX_TIMEOUT_SECONDS = 60;
export const DEFAULT_X402_VERSION = 2 as const;

const MAINNET_ALIASES = new Set(['solana:mainnet', 'solana-mainnet', 'mainnet', 'mainnet-beta', 'solana']);
const DEVNET_ALIASES = new Set(['solana:devnet', 'solana-devnet', 'devnet']);

/**
 * Accept a CAIP-2 id or a friendly alias and return the canonical CAIP-2 id.
 * Unknown values pass through unchanged so custom networks keep working.
 */
export function normalizeNetwork(network?: string): string {
  if (!network) return SOLANA_MAINNET;
  const lower = network.trim().toLowerCase();
  if (MAINNET_ALIASES.has(lower)) return SOLANA_MAINNET;
  if (DEVNET_ALIASES.has(lower)) return SOLANA_DEVNET;
  return network.trim();
}

export function isDevnet(network: string): boolean {
  return network === SOLANA_DEVNET || /devnet/i.test(network);
}

/** Resolve a friendly asset name ('USDC' | 'SOL') or an explicit mint to an SPL mint address. */
export function resolveMint(asset: string | undefined, network: string): string {
  const value = (asset ?? 'USDC').trim();
  const upper = value.toUpperCase();
  if (upper === 'USDC') return isDevnet(network) ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
  if (upper === 'SOL') return WRAPPED_SOL_MINT;
  return value;
}

/** Atomic-unit decimals for a friendly asset. USDC = 6, SOL = 9, default = 6. */
export function assetDecimals(asset?: string): number {
  const upper = (asset ?? 'USDC').toUpperCase();
  if (upper === 'SOL') return 9;
  return 6;
}
