import { formatNimiqAddress, shortenEthAddress, shortenNimiqAddress } from '@shared/address.ts'
import { minorToDisplay } from '@shared/money.ts'
import type { Currency, Member } from '@shared/types.ts'

export function money(amountMinor: bigint | string, currency: Currency): string {
  return `${minorToDisplay(amountMinor, currency)} ${currency}`
}

export function moneyNumber(amountMinor: bigint | string, currency: Currency): string {
  return minorToDisplay(amountMinor, currency)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function memberLabel(member: Member, currentId?: string | null): string {
  if (currentId && member.id === currentId) return `${member.displayName} (you)`
  return member.displayName
}

export function formatTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ts)
}

export function walletLabel(member: Member, currency: Currency): string {
  if (currency === 'NIM' && member.nimiqAddress) return shortenNimiqAddress(formatNimiqAddress(member.nimiqAddress))
  if (currency === 'USDT' && member.ethAddress) return shortenEthAddress(member.ethAddress)
  return 'No address'
}

export function copyText(value: string): Promise<void> {
  return navigator.clipboard.writeText(value)
}
