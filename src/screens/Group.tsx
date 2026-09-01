import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { netsForCurrency, pairwiseDebts } from '@shared/balances.ts'
import { minorToDisplay } from '@shared/money.ts'
import type { Currency, Group } from '@shared/types.ts'
import { Amount, Avatar, BackButton, Banner, Button, ScreenHeader, StatusPill } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { fetchGroup } from '../lib/api.ts'
import { toErrorMessage } from '../lib/errors.ts'
import { memberLabel, money } from '../lib/format.ts'
import { findMe } from '../lib/identity.ts'

export function GroupScreen() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const wallet = useWallet()
  const [group, setGroup] = useState<Group | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const next = await fetchGroup(id)
        if (!cancelled) {
          setGroup(next)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(toErrorMessage(err))
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [id])

  const me = group ? findMe(group, wallet.nimiqAddress, wallet.ethAddress) : undefined

  const view = useMemo(() => {
    if (!group) return null
    const currencies: Currency[] = ['NIM', 'USDT']
    const debts = currencies.flatMap((currency) =>
      pairwiseDebts(netsForCurrency(group.members, group.expenses, group.payments, currency), currency),
    )
    const myDebts = me ? debts.filter((debt) => debt.fromMemberId === me.id) : []
    const myCredits = me ? debts.filter((debt) => debt.toMemberId === me.id) : []
    const total = group.expenses.reduce(
      (acc, expense) => {
        acc[expense.currency] += BigInt(expense.amountMinor)
        return acc
      },
      { NIM: 0n, USDT: 0n },
    )
    return { debts, myDebts, myCredits, total }
  }, [group, me])

  if (!group || !view) {
    return (
      <div className="screen">
        <ScreenHeader title="Group" back={<BackButton onClick={() => nav('/')} />} />
        {error ? <Banner tone="danger">{error}</Banner> : <p className="text-muted">Loading…</p>}
      </div>
    )
  }

  const primaryCurrency: Currency = view.total.NIM >= view.total.USDT ? 'NIM' : 'USDT'
  const myOwe = view.myDebts.reduce((acc, debt) => acc + (debt.currency === primaryCurrency ? debt.amountMinor : 0n), 0n)

  return (
    <div className="screen">
      <ScreenHeader
        title={group.name}
        subtitle={`${group.members.filter((member) => member.claimed).length} people · code ${group.code}`}
        back={<BackButton onClick={() => nav('/')} />}
        action={
          <button onClick={() => nav(`/g/${group.id}/invite`)} className="text-[12px] uppercase tracking-[0.14em] text-gold mt-2">
            Invite
          </button>
        }
      />

      {error && (
        <div className="mb-5">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}

      <section>
        <div className="text-[12px] uppercase tracking-[0.16em] text-muted mb-2">Total expenses</div>
        <Amount value={view.total[primaryCurrency]} currency={primaryCurrency} size="lg" />
        {view.total.NIM > 0n && view.total.USDT > 0n && (
          <p className="mt-2 text-[13px] text-muted">{minorToDisplay(view.total.USDT, 'USDT')} USDT</p>
        )}
      </section>

      <section className="mt-8">
        <div className="text-[12px] uppercase tracking-[0.16em] text-muted mb-3">Current balance</div>
        {me && myOwe > 0n ? (
          <p className="text-[18px] text-gold">You owe {money(myOwe, primaryCurrency)}</p>
        ) : me && view.myCredits.length > 0 ? (
          <p className="text-[18px] text-ok">
            You're owed {money(view.myCredits.reduce((acc, debt) => acc + debt.amountMinor, 0n), view.myCredits[0].currency)}
          </p>
        ) : (
          <p className="text-[18px] text-ok">Settled</p>
        )}
      </section>

      <section className="mt-8">
        <div className="text-[12px] uppercase tracking-[0.16em] text-muted mb-3">Who owes whom</div>
        {view.debts.length === 0 ? (
          <p className="text-[14px] text-muted">Everyone is settled.</p>
        ) : (
          <div className="space-y-3">
            {view.debts.map((debt) => {
              const from = group.members.find((member) => member.id === debt.fromMemberId)
              const to = group.members.find((member) => member.id === debt.toMemberId)
              if (!from || !to) return null
              const mine = me?.id === from.id
              return (
                <div key={`${debt.fromMemberId}-${debt.toMemberId}-${debt.currency}`} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] truncate">
                      {memberLabel(from, me?.id)} owes {memberLabel(to, me?.id)}
                    </div>
                    <div className="text-[13px] text-muted mt-0.5">{money(debt.amountMinor, debt.currency)}</div>
                  </div>
                  {mine && (
                    <Button
                      className="h-10 px-4 text-[13px] shrink-0"
                      onClick={() =>
                        nav(
                          `/g/${group.id}/pay?to=${to.id}&currency=${debt.currency}&amount=${debt.amountMinor.toString()}`,
                        )
                      }
                    >
                      Pay
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {me && view.myDebts[0] && (
        <Button
          className="w-full mt-8"
          onClick={() =>
            nav(
              `/g/${group.id}/pay?to=${view.myDebts[0].toMemberId}&currency=${view.myDebts[0].currency}&amount=${view.myDebts[0].amountMinor.toString()}`,
            )
          }
        >
          Pay your share
        </Button>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => nav(`/g/${group.id}/add`)}>
          Add expense
        </Button>
        <Button variant="secondary" onClick={() => nav(`/g/${group.id}/activity`)}>
          Activity
        </Button>
      </div>

      <section className="mt-10">
        <div className="text-[12px] uppercase tracking-[0.16em] text-muted mb-4">Expenses</div>
        {group.expenses.length === 0 ? (
          <p className="text-[14px] text-muted">No expenses yet.</p>
        ) : (
          <div className="space-y-4">
            {[...group.expenses].reverse().map((expense) => {
              const payer = group.members.find((member) => member.id === expense.payerId)
              const mySplit = me ? expense.splits.find((split) => split.memberId === me.id) : undefined
              const myPayment = me
                ? group.payments.find(
                    (payment) =>
                      payment.fromMemberId === me.id &&
                      (payment.status === 'submitted' || payment.status === 'confirmed') &&
                      payment.currency === expense.currency,
                  )
                : undefined
              const unpaid = Boolean(mySplit && me && expense.payerId !== me.id && !myPayment && view.myDebts.some((debt) => debt.currency === expense.currency))
              return (
                <div key={expense.id} className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 min-w-0">
                    <Avatar name={payer?.displayName ?? 'Payer'} />
                    <div className="min-w-0">
                      <div className="text-[16px] truncate">{expense.title}</div>
                      <div className="text-[13px] text-muted mt-0.5">
                        {payer ? memberLabel(payer, me?.id) : 'Someone'} paid {money(expense.amountMinor, expense.currency)}
                      </div>
                      {mySplit && me && expense.payerId !== me.id && (
                        <div className="text-[13px] mt-1 text-gold">Your share {money(mySplit.amountMinor, expense.currency)}</div>
                      )}
                    </div>
                  </div>
                  <StatusPill status={unpaid ? 'unpaid' : 'settled'} />
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
