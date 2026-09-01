import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { netsForCurrency, pairwiseDebts } from '@shared/balances.ts'
import { minorToDisplay } from '@shared/money.ts'
import type { Currency, Group } from '@shared/types.ts'
import { Amount, Avatar, BackButton, Button, Notice, ScreenHeader, Sheet, StatusMark } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { fetchGroup } from '../lib/api.ts'
import { toErrorMessage } from '../lib/errors.ts'
import { memberLabel, money } from '../lib/format.ts'
import { findMe } from '../lib/identity.ts'
import { AddExpense } from './AddExpense.tsx'
import { Settle } from './Settle.tsx'

export function GroupScreen() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const wallet = useWallet()
  const [group, setGroup] = useState<Group | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sheet = params.get('pay') ? 'pay' : params.get('add') ? 'add' : null

  function closeSheet() {
    setParams({})
  }

  function openPay(to?: string, currency?: string) {
    const next = new URLSearchParams()
    next.set('pay', '1')
    if (to) next.set('to', to)
    if (currency) next.set('currency', currency)
    setParams(next)
  }

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
        <ScreenHeader title="Group" back={<BackButton onClick={() => nav('/app')} />} />
        {error ? <Notice tone="danger">{error}</Notice> : <p className="text-muted">Loading…</p>}
      </div>
    )
  }

  const primaryCurrency: Currency = view.total.NIM >= view.total.USDT ? 'NIM' : 'USDT'
  const myOwe = view.myDebts.reduce((acc, debt) => acc + (debt.currency === primaryCurrency ? debt.amountMinor : 0n), 0n)

  return (
    <div className="screen">
      <ScreenHeader
        title={group.name}
        back={<BackButton onClick={() => nav('/app')} />}
        action={
          <button onClick={() => nav(`/g/${group.id}/invite`)} className="text-[13px] text-muted">
            Invite
          </button>
        }
      />

      {error && <div className="mb-5"><Notice tone="danger">{error}</Notice></div>}

      <Amount value={view.total[primaryCurrency]} currency={primaryCurrency} size="lg" />
      <p className={`mt-4 text-[15px] ${me && myOwe > 0n ? 'text-danger' : 'text-ok'}`}>
        {me && myOwe > 0n
          ? `You owe ${money(myOwe, primaryCurrency)}`
          : me && view.myCredits.length > 0
            ? `They owe you ${money(view.myCredits.reduce((acc, debt) => acc + debt.amountMinor, 0n), view.myCredits[0].currency)}`
            : 'Settled'}
      </p>

      {me && view.myDebts[0] && (
        <Button className="w-full mt-8" onClick={() => openPay(view.myDebts[0].toMemberId, view.myDebts[0].currency)}>
          Pay your share
        </Button>
      )}

      <section className="mt-10">
        <div className="text-[13px] text-muted mb-2">Who owes whom</div>
        <div className="hairline" />
        {view.debts.length === 0 ? (
          <p className="py-5 text-[14px] text-muted">Everyone is settled.</p>
        ) : (
          view.debts.map((debt) => {
            const from = group.members.find((member) => member.id === debt.fromMemberId)
            const to = group.members.find((member) => member.id === debt.toMemberId)
            if (!from || !to) return null
            const mine = me?.id === from.id
            return (
              <div
                key={`${debt.fromMemberId}-${debt.toMemberId}-${debt.currency}`}
                className="py-4 flex items-center justify-between gap-3 border-b border-line"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={from.displayName} />
                  <div className="min-w-0 text-[15px] truncate">
                    {memberLabel(from, me?.id)}
                    <span className="text-muted"> → </span>
                    {memberLabel(to, me?.id)}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                  <span className="num text-[16px] text-danger">{minorToDisplay(debt.amountMinor, debt.currency)}</span>
                  {mine && (
                    <button className="text-[13px] text-gold" onClick={() => openPay(to.id, debt.currency)}>
                      Pay
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </section>

      <section className="mt-10">
        <div className="text-[13px] text-muted mb-2">Expenses</div>
        <div className="hairline" />
        {group.expenses.length === 0 ? (
          <p className="py-5 text-[14px] text-muted">No expenses yet.</p>
        ) : (
          [...group.expenses].reverse().map((expense) => {
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
            const unpaid = Boolean(
              mySplit && me && expense.payerId !== me.id && !myPayment && view.myDebts.some((debt) => debt.currency === expense.currency),
            )
            return (
              <div
                key={expense.id}
                className={`py-4 border-b border-line flex items-center justify-between gap-3 transition-opacity ${unpaid ? '' : 'opacity-55'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={payer?.displayName ?? 'Payer'} dim={!unpaid} />
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium truncate">{expense.title}</div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {payer ? memberLabel(payer, me?.id) : 'Someone'} · {money(expense.amountMinor, expense.currency)}
                    </div>
                  </div>
                </div>
                {unpaid && mySplit ? (
                  <span className="num text-[16px] text-danger">{minorToDisplay(mySplit.amountMinor, expense.currency)}</span>
                ) : (
                  <StatusMark status="settled" />
                )}
              </div>
            )
          })
        )}
      </section>

      <button className="mt-8 text-[14px] text-muted" onClick={() => nav(`/g/${group.id}/activity`)}>
        Activity
      </button>

      {!view.myDebts[0] && (
        <Button className="w-full mt-8" variant="secondary" onClick={() => setParams({ add: '1' })}>
          Add expense
        </Button>
      )}
      {view.myDebts[0] && (
        <button className="mt-6 block w-full text-center text-[14px] text-muted" onClick={() => setParams({ add: '1' })}>
          Add expense
        </button>
      )}

      {sheet === 'pay' && (
        <Sheet title="Pay your share" onClose={closeSheet}>
          <Settle inSheet onClose={closeSheet} />
        </Sheet>
      )}
      {sheet === 'add' && (
        <Sheet title="Add expense" onClose={closeSheet}>
          <AddExpense inSheet onClose={closeSheet} />
        </Sheet>
      )}
    </div>
  )
}
