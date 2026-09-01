import type { Currency, Expense, Member, Payment } from './types.ts'

export type NetMap = Map<string, bigint>

export const SETTLED_STATUSES = new Set(['submitted', 'confirmed'])

export function netsForCurrency(
  members: Member[],
  expenses: Expense[],
  payments: Payment[],
  currency: Currency,
): NetMap {
  const net: NetMap = new Map(members.map((member) => [member.id, 0n]))

  for (const expense of expenses) {
    if (expense.currency !== currency) continue
    for (const split of expense.splits) {
      if (split.memberId === expense.payerId) continue
      const share = BigInt(split.amountMinor)
      net.set(split.memberId, (net.get(split.memberId) ?? 0n) - share)
      net.set(expense.payerId, (net.get(expense.payerId) ?? 0n) + share)
    }
  }

  for (const payment of payments) {
    if (payment.currency !== currency) continue
    if (!SETTLED_STATUSES.has(payment.status)) continue
    const amount = BigInt(payment.amountMinor)
    net.set(payment.fromMemberId, (net.get(payment.fromMemberId) ?? 0n) + amount)
    net.set(payment.toMemberId, (net.get(payment.toMemberId) ?? 0n) - amount)
  }

  return net
}

export type PairwiseDebt = {
  fromMemberId: string
  toMemberId: string
  amountMinor: bigint
  currency: Currency
}

export function pairwiseDebts(net: NetMap, currency: Currency): PairwiseDebt[] {
  const debtors = [...net.entries()]
    .filter(([, value]) => value < 0n)
    .map(([id, value]) => ({ id, remaining: -value }))
    .sort((a, b) => (a.remaining > b.remaining ? -1 : 1))

  const creditors = [...net.entries()]
    .filter(([, value]) => value > 0n)
    .map(([id, value]) => ({ id, remaining: value }))
    .sort((a, b) => (a.remaining > b.remaining ? -1 : 1))

  const debts: PairwiseDebt[] = []
  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]
    const creditor = creditors[j]
    const amount = debtor.remaining < creditor.remaining ? debtor.remaining : creditor.remaining
    if (amount > 0n) {
      debts.push({
        fromMemberId: debtor.id,
        toMemberId: creditor.id,
        amountMinor: amount,
        currency,
      })
    }
    debtor.remaining -= amount
    creditor.remaining -= amount
    if (debtor.remaining === 0n) i += 1
    if (creditor.remaining === 0n) j += 1
  }

  return debts
}

export function memberNet(net: NetMap, memberId: string): bigint {
  return net.get(memberId) ?? 0n
}

export function totalNegative(net: NetMap): bigint {
  let total = 0n
  for (const value of net.values()) {
    if (value < 0n) total += -value
  }
  return total
}
