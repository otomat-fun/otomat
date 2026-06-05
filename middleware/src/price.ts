import type { PriceInput } from './types.js';

export interface ParsedPrice {
  amount: string;
  decimals: number;
}

function stripLeadingZeros(value: string): string {
  const trimmed = value.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

function decimalToAtomic(value: string, decimals: number): string {
  const [intPart = '0', fracPart = ''] = value.split('.');
  if (fracPart.length > decimals) {
    throw new Error(`otomat: price "${value}" carries more precision than ${decimals} decimals allow`);
  }
  const frac = fracPart.padEnd(decimals, '0');
  return stripLeadingZeros(`${intPart}${frac}`);
}

/**
 * Parse a human price into atomic token units.
 *
 *  - `{ amount: '2000', decimals: 6 }` -> passthrough
 *  - `'$0.002'` / `'0.002'` / `'0.002 USDC'` -> decimal amount (default 6 decimals)
 *  - `'2000usdc-atomic'` / `'2000 atomic'` -> already in atomic units
 */
export function parsePrice(price: PriceInput, defaultDecimals = 6): ParsedPrice {
  if (typeof price === 'object' && price !== null) {
    if (!/^\d+$/.test(price.amount)) {
      throw new Error(`otomat: atomic amount "${price.amount}" must be a non-negative integer`);
    }
    return { amount: stripLeadingZeros(price.amount), decimals: price.decimals };
  }

  const raw = String(price).trim();
  if (!raw) throw new Error('otomat: price string is empty');

  const lower = raw.toLowerCase();

  if (lower.includes('atomic')) {
    const digits = lower
      .replace(/atomic/g, '')
      .replace(/usdc|usd|sol/g, '')
      .replace(/[$\s-]/g, '');
    if (!/^\d+$/.test(digits)) {
      throw new Error(`otomat: cannot parse atomic price "${raw}"`);
    }
    return { amount: stripLeadingZeros(digits), decimals: defaultDecimals };
  }

  const numeric = raw
    .replace(/\$/g, '')
    .replace(/usdc|usd|sol/gi, '')
    .trim();
  if (!/^\d+(\.\d+)?$/.test(numeric)) {
    throw new Error(`otomat: cannot parse price "${raw}"`);
  }
  return { amount: decimalToAtomic(numeric, defaultDecimals), decimals: defaultDecimals };
}
