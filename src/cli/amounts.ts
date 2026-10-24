import { UsageError } from './errors';

/**
 * Convert a human amount ("1.5") to raw units (15000000n for 7 decimals).
 * Rejects negative numbers, exponents and more fractional digits than the
 * asset has, instead of rounding silently. Zero is only accepted with
 * `allowZero` (one entry of a multi-asset list).
 */
export function parseUnits(value: string, decimals: number, allowZero = false): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed) && !/^\.\d+$/.test(trimmed)) {
    throw new UsageError(`Invalid amount "${value}": use a positive decimal number such as 1.5`);
  }
  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new UsageError(`Amount "${value}" has more than ${decimals} decimal places`);
  }
  const raw = BigInt((whole || '0') + fraction.padEnd(decimals, '0'));
  if (raw === 0n && !allowZero) throw new UsageError(`Amount must be greater than zero`);
  return raw;
}

/** Parse a raw integer amount ("15000000"). */
export function parseRawAmount(value: string, allowZero = false): bigint {
  if (!/^\d+$/.test(value.trim())) {
    throw new UsageError(`Invalid raw amount "${value}": use a positive integer in the asset's smallest unit`);
  }
  const raw = BigInt(value.trim());
  if (raw === 0n && !allowZero) throw new UsageError(`Amount must be greater than zero`);
  return raw;
}

/** Convert raw units back to a human string, without trailing zeros. */
export function formatUnits(raw: bigint | string | number, decimals: number): string {
  const value = BigInt(typeof raw === 'number' ? Math.trunc(raw) : raw);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals).replace(/0+$/, '') : '';
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
