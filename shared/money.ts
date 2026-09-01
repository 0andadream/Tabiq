import type { Currency } from './types.ts'

export const DECIMALS: Record<Currency, number> = {
  NIM: 5,
  USDT: 6,
}

export function parseToMinor(input: string, currency: Currency): bigint {
  const decimals = DECIMALS[currency]
  const trimmed = input.trim().replace(/,/g, '')
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Enter a valid amount')
  }
  const [wholeRaw, fracRaw = ''] = trimmed.split('.')
  if (fracRaw.length > decimals) {
    throw new Error(
      currency === 'NIM'
        ? 'NIM supports up to 5 decimal places'
        : 'USDT supports up to 6 decimal places',
    )
  }
  const whole = BigInt(wholeRaw)
  const frac = BigInt(fracRaw.padEnd(decimals, '0') || '0')
  const base = 10n ** BigInt(decimals)
  return whole * base + frac
}

export function minorToDisplay(
  minor: bigint | string,
  currency: Currency,
  fractionDigits = 2,
): string {
  const value = typeof minor === 'string' ? BigInt(minor) : minor
  const decimals = DECIMALS[currency]
  const negative = value < 0n
  const abs = negative ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = abs % base
  const fracStr = frac.toString().padStart(decimals, '0')
  const shown = fracStr.slice(0, fractionDigits).padEnd(fractionDigits, '0')
  return `${negative ? '-' : ''}${whole.toString()}.${shown}`
}

export function splitEqual(total: bigint, count: number): bigint[] {
  if (count <= 0) return []
  const n = BigInt(count)
  const share = total / n
  const remainder = total % n
  return Array.from({ length: count }, (_, index) =>
    share + (BigInt(index) < remainder ? 1n : 0n),
  )
}

export function sumMinor(values: Array<bigint | string>): bigint {
  return values.reduce<bigint>((acc, value) => acc + BigInt(value), 0n)
}
