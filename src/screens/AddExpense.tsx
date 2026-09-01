import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { parseToMinor, splitEqual } from '@shared/money.ts'
import type { Currency, Group, SplitType } from '@shared/types.ts'
import { Avatar, BackButton, Banner, Button, Field, Input, ScreenHeader } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { addExpense, fetchGroup } from '../lib/api.ts'
import { toErrorMessage } from '../lib/errors.ts'
import { memberLabel, moneyNumber } from '../lib/format.ts'
import { findMe } from '../lib/identity.ts'

export function AddExpense() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const wallet = useWallet()
  const [group, setGroup] = useState<Group | null>(null)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>(wallet.prefs.defaultCurrency)
  const [payerId, setPayerId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [splitType, setSplitType] = useState<SplitType>('equal')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchGroup(id)
      .then((next) => {
        setGroup(next)
        const me = findMe(next, wallet.nimiqAddress, wallet.ethAddress)
        const claimed = next.members.filter((member) => member.claimed)
        setPayerId(me?.id ?? claimed[0]?.id ?? '')
        setSelected(claimed.map((member) => member.id))
      })
      .catch((err) => setError(toErrorMessage(err)))
  }, [id, wallet.nimiqAddress, wallet.ethAddress])

  const preview = useMemo(() => {
    if (!group || selected.length === 0) return null
    try {
      const total = parseToMinor(amount || '0', currency)
      if (splitType === 'equal') {
        const shares = splitEqual(total, selected.length)
        return selected.map((memberId, index) => ({ memberId, amount: shares[index] }))
      }
      return selected.map((memberId) => ({
        memberId,
        amount: custom[memberId] ? parseToMinor(custom[memberId], currency) : 0n,
      }))
    } catch {
      return null
    }
  }, [amount, currency, custom, group, selected, splitType])

  const customSumOk = useMemo(() => {
    if (splitType !== 'custom' || !preview) return true
    try {
      return preview.reduce((acc, row) => acc + row.amount, 0n) === parseToMinor(amount || '0', currency)
    } catch {
      return false
    }
  }, [amount, currency, preview, splitType])

  async function onAdd() {
    if (!group) return
    setBusy(true)
    setError(null)
    try {
      await addExpense(group.id, {
        title,
        amount,
        currency,
        payerId,
        participantIds: selected,
        splitType,
        customSplits: splitType === 'custom'
          ? selected.map((memberId) => ({ memberId, amount: custom[memberId] || '0' }))
          : undefined,
      })
      nav(`/g/${group.id}`, { replace: true })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!group) {
    return (
      <div className="screen">
        <ScreenHeader title="Add expense" back={<BackButton onClick={() => nav(-1)} />} />
        {error ? <Banner tone="danger">{error}</Banner> : <p className="text-muted">Loading…</p>}
      </div>
    )
  }

  const me = findMe(group, wallet.nimiqAddress, wallet.ethAddress)
  const members = group.members.filter((member) => member.claimed)

  return (
    <div className="screen">
      <ScreenHeader title="Add expense" back={<BackButton onClick={() => nav(`/g/${group.id}`)} />} />
      {error && (
        <div className="mb-5">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}

      <div className="space-y-5">
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Dinner" maxLength={64} />
        </Field>
        <Field label="Amount">
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="40"
          />
        </Field>
        <Field label="Currency">
          <div className="grid grid-cols-2 gap-2">
            {(['NIM', 'USDT'] as Currency[]).map((item) => (
              <button
                key={item}
                onClick={() => setCurrency(item)}
                className={`h-12 rounded-2xl border ${currency === item ? 'border-gold text-gold bg-gold/10' : 'border-white/10 text-muted'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Paid by">
          <div className="space-y-2">
            {members.map((member) => (
              <button
                key={member.id}
                onClick={() => setPayerId(member.id)}
                className={`w-full h-12 px-3 rounded-2xl border flex items-center gap-3 ${
                  payerId === member.id ? 'border-gold/40 bg-gold/8' : 'border-white/10'
                }`}
              >
                <Avatar name={member.displayName} dim={payerId !== member.id} />
                <span>{memberLabel(member, me?.id)}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Participants">
          <div className="space-y-2">
            {members.map((member) => {
              const on = selected.includes(member.id)
              return (
                <button
                  key={member.id}
                  onClick={() =>
                    setSelected((current) =>
                      on ? current.filter((id) => id !== member.id) : [...current, member.id],
                    )
                  }
                  className={`w-full h-12 px-3 rounded-2xl border flex items-center justify-between ${
                    on ? 'border-gold/40 bg-gold/8' : 'border-white/10'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Avatar name={member.displayName} dim={!on} />
                    {memberLabel(member, me?.id)}
                  </span>
                  <span className="text-[12px] uppercase tracking-[0.12em] text-muted">{on ? 'In' : 'Out'}</span>
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Split">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSplitType('equal')}
              className={`h-12 rounded-2xl border ${splitType === 'equal' ? 'border-gold text-gold bg-gold/10' : 'border-white/10 text-muted'}`}
            >
              Equal
            </button>
            <button
              onClick={() => setSplitType('custom')}
              className={`h-12 rounded-2xl border ${splitType === 'custom' ? 'border-gold text-gold bg-gold/10' : 'border-white/10 text-muted'}`}
            >
              Custom
            </button>
          </div>
        </Field>
      </div>

      <section className="mt-8">
        <div className="text-[12px] uppercase tracking-[0.16em] text-muted mb-3">Calculated amounts</div>
        {preview ? (
          <div className="space-y-3">
            {preview.map((row) => {
              const member = group.members.find((item) => item.id === row.memberId)
              if (!member) return null
              return (
                <div key={row.memberId} className="flex items-center justify-between gap-3">
                  <span>{memberLabel(member, me?.id)}</span>
                  {splitType === 'custom' ? (
                    <Input
                      className="w-28 h-10 text-right"
                      inputMode="decimal"
                      value={custom[row.memberId] ?? ''}
                      onChange={(event) =>
                        setCustom((current) => ({ ...current, [row.memberId]: event.target.value.replace(/[^0-9.]/g, '') }))
                      }
                    />
                  ) : (
                    <span className="num text-[18px]">
                      {moneyNumber(row.amount, currency)} {currency}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-[14px] text-muted">Enter an amount to see each share.</p>
        )}
        {splitType === 'custom' && amount && !customSumOk && (
          <div className="mt-4">
            <Banner tone="warn">Custom amounts must add up to the total.</Banner>
          </div>
        )}
      </section>

      <Button
        className="w-full mt-8"
        disabled={busy || !title.trim() || !amount || selected.length === 0 || (splitType === 'custom' && !customSumOk)}
        onClick={() => void onAdd()}
      >
        {busy ? 'Adding…' : 'Add expense'}
      </Button>
    </div>
  )
}
