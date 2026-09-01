import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { parseToMinor, splitEqual } from '@shared/money.ts'
import type { Currency, Group, SplitType } from '@shared/types.ts'
import { BackButton, Button, Field, Input, Notice, ScreenHeader, Segmented } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { addExpense, fetchGroup } from '../lib/api.ts'
import { toErrorMessage } from '../lib/errors.ts'
import { memberLabel, moneyNumber } from '../lib/format.ts'
import { findMe } from '../lib/identity.ts'

export function AddExpense({ inSheet = false, onClose }: { inSheet?: boolean; onClose?: () => void } = {}) {
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
      if (inSheet) onClose?.()
      else nav(`/g/${group.id}`, { replace: true })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!group) {
    return (
      <div className={inSheet ? '' : 'screen'}>
        {!inSheet && <ScreenHeader title="Add expense" back={<BackButton onClick={() => nav(-1)} />} />}
        {error ? <Notice tone="danger">{error}</Notice> : <p className="text-muted">Loading…</p>}
      </div>
    )
  }

  const me = findMe(group, wallet.nimiqAddress, wallet.ethAddress)
  const members = group.members.filter((member) => member.claimed)

  return (
    <div className={inSheet ? '' : 'screen'}>
      {!inSheet && <ScreenHeader title="Add expense" back={<BackButton onClick={() => nav(`/g/${group.id}`)} />} />}
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}

      <div className="space-y-8">
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
          <Segmented
            value={currency}
            onChange={setCurrency}
            options={[
              { value: 'NIM', label: 'NIM' },
              { value: 'USDT', label: 'USDT' },
            ]}
          />
        </Field>
        <Field label="Paid by">
          <div className="divide-y divide-line border-b border-line">
            {members.map((member) => (
              <button
                key={member.id}
                onClick={() => setPayerId(member.id)}
                className="w-full py-3.5 flex items-center justify-between"
              >
                <span className={payerId === member.id ? 'text-ink' : 'text-muted'}>
                  {memberLabel(member, me?.id)}
                </span>
                {payerId === member.id && <span className="text-gold text-[13px]">Payer</span>}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Participants">
          <div className="divide-y divide-line border-b border-line">
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
                  className="w-full py-3.5 flex items-center justify-between"
                >
                  <span className={on ? 'text-ink' : 'text-muted'}>{memberLabel(member, me?.id)}</span>
                  <span className="text-[13px] text-muted">{on ? 'In' : 'Out'}</span>
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Split">
          <Segmented
            value={splitType}
            onChange={setSplitType}
            options={[
              { value: 'equal', label: 'Equal' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </Field>
      </div>

      <section className="mt-12">
        <div className="text-[12px] text-muted mb-2">Each share</div>
        <div className="hairline" />
        {preview ? (
          preview.map((row) => {
            const member = group.members.find((item) => item.id === row.memberId)
            if (!member) return null
            return (
              <div key={row.memberId} className="py-4 flex items-baseline justify-between gap-3 border-b border-line">
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
                    {moneyNumber(row.amount, currency)}
                  </span>
                )}
              </div>
            )
          })
        ) : (
          <p className="py-5 text-[14px] text-muted">Enter an amount to see each share.</p>
        )}
        {splitType === 'custom' && amount && !customSumOk && (
          <Notice tone="warn">Custom amounts must add up to the total.</Notice>
        )}
      </section>

      <Button
        className="w-full mt-10"
        disabled={busy || !title.trim() || !amount || selected.length === 0 || (splitType === 'custom' && !customSumOk)}
        onClick={() => void onAdd()}
      >
        {busy ? 'Adding…' : 'Add expense'}
      </Button>
    </div>
  )
}
