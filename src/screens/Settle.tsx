import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatNimiqAddress, shortenEthAddress, shortenNimiqAddress } from '@shared/address.ts'
import { netsForCurrency, pairwiseDebts } from '@shared/balances.ts'
import { minorToDisplay } from '@shared/money.ts'
import type { Currency, Group, Network, Payment } from '@shared/types.ts'
import { Amount, BackButton, Banner, Button, ScreenHeader, StatusPill } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { createPayment, fetchGroup, updatePayment } from '../lib/api.ts'
import { isAppError, toErrorMessage, type AppErrorCode } from '../lib/errors.ts'
import { formatTime, memberLabel, money } from '../lib/format.ts'
import { getTransactionReceipt, polygonExplorerUrl, sendUsdt } from '../lib/ethereum.ts'
import { findMe } from '../lib/identity.ts'
import { nimiqExplorerUrl, sendNim } from '../lib/nimiq.ts'

type Phase = 'ready' | 'pending' | 'success' | 'rejected' | 'failed'

export function Settle() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const wallet = useWallet()
  const [group, setGroup] = useState<Group | null>(null)
  const [currency, setCurrency] = useState<Currency>((params.get('currency') as Currency) || 'NIM')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [payment, setPayment] = useState<Payment | null>(null)
  const lock = useRef(false)

  useEffect(() => {
    fetchGroup(id)
      .then(setGroup)
      .catch((err) => setError(toErrorMessage(err)))
  }, [id])

  const me = group ? findMe(group, wallet.nimiqAddress, wallet.ethAddress) : undefined

  const debt = useMemo(() => {
    if (!group || !me) return null
    const debts = pairwiseDebts(
      netsForCurrency(group.members, group.expenses, group.payments, currency),
      currency,
    )
    const to = params.get('to')
    return debts.find((item) => item.fromMemberId === me.id && (!to || item.toMemberId === to)) ?? debts.find((item) => item.fromMemberId === me.id) ?? null
  }, [currency, group, me, params])

  const recipient = group && debt ? group.members.find((member) => member.id === debt.toMemberId) : undefined

  async function pay() {
    if (!group || !me || !debt || !recipient || lock.current) return
    if (wallet.status !== 'connected') {
      setErrorCode('wallet_disconnected')
      setError('Wallet disconnected. Reopen Tabiq inside Nimiq Pay.')
      setPhase('failed')
      return
    }

    lock.current = true
    setPhase('pending')
    setError(null)
    setErrorCode(null)

    const network: Network = currency === 'NIM' ? 'nimiq' : 'polygon'
    const idempotencyKey = `${group.id}:${me.id}:${recipient.id}:${debt.amountMinor.toString()}:${currency}`

    let record: Payment | null = null
    try {
      const created = await createPayment(group.id, {
        fromMemberId: me.id,
        toMemberId: recipient.id,
        amountMinor: debt.amountMinor.toString(),
        currency,
        idempotencyKey,
        status: 'pending',
        network,
      })
      record = created.payment
      setPayment(record)
      setGroup(created.group)
      if (record.status === 'submitted' || record.status === 'confirmed') {
        setPhase('success')
        lock.current = false
        return
      }
    } catch (err) {
      lock.current = false
      if (isAppError(err) && err.code === 'duplicate_payment') {
        setErrorCode('duplicate_payment')
        setError('This share is already paid or a matching payment already exists.')
      } else {
        setError(toErrorMessage(err))
      }
      setPhase('failed')
      return
    }

    try {
      let txHash: string
      if (currency === 'NIM') {
        if (!recipient.nimiqAddress) throw new Error('Recipient has no Nimiq address.')
        if (!wallet.nimiqAddress) throw new Error('Connect a Nimiq account to pay in NIM.')
        txHash = await sendNim({
          recipient: recipient.nimiqAddress,
          valueLuna: Number(debt.amountMinor),
          memo: `Tabiq ${group.name}`.slice(0, 64),
        })
      } else {
        if (!recipient.ethAddress) throw new Error('Recipient has no Polygon address.')
        const from = wallet.ethAddress ?? (await wallet.connectEthereum())
        txHash = await sendUsdt({
          from,
          to: recipient.ethAddress,
          amountMinor: debt.amountMinor,
        })
        try {
          const receipt = await getTransactionReceipt(txHash)
          if (receipt?.status === '0x0') {
            throw new Error('USDT transaction failed on Polygon.')
          }
        } catch (receiptError) {
          if (isAppError(receiptError) || (receiptError instanceof Error && /failed on Polygon/.test(receiptError.message))) {
            throw receiptError
          }
        }
      }

      const updated = await updatePayment(group.id, record.id, {
        status: 'submitted',
        txHash,
        network,
      })
      setPayment(updated.payment)
      setGroup(updated.group)
      setPhase('success')
    } catch (err) {
      const rejected = isAppError(err) && err.code === 'tx_rejected'
      const code = isAppError(err) ? err.code : 'tx_failed'
      setErrorCode(code)
      setError(toErrorMessage(err))
      setPhase(rejected ? 'rejected' : 'failed')
      if (record) {
        try {
          const updated = await updatePayment(group.id, record.id, {
            status: rejected ? 'rejected' : 'failed',
            network,
          })
          setPayment(updated.payment)
          setGroup(updated.group)
        } catch {
          // Keep local failure state even if the status patch fails.
        }
      }
    } finally {
      lock.current = false
    }
  }

  if (!group) {
    return (
      <div className="screen">
        <ScreenHeader title="Pay" back={<BackButton onClick={() => nav(-1)} />} />
        {error ? <Banner tone="danger">{error}</Banner> : <p className="text-muted">Loading…</p>}
      </div>
    )
  }

  if (phase === 'success' && payment && recipient) {
    const explorer = payment.network === 'polygon' && payment.txHash
      ? polygonExplorerUrl(payment.txHash)
      : payment.txHash
        ? nimiqExplorerUrl(payment.txHash)
        : null
    return (
      <div className="screen">
        <ScreenHeader title="Settled" back={<BackButton onClick={() => nav(`/g/${group.id}`)} />} />
        <div className="mt-6 text-ok text-[28px] font-medium">Settled ✓</div>
        <div className="mt-8">
          <Amount value={payment.amountMinor} currency={payment.currency} tone="ok" />
        </div>
        <dl className="mt-8 space-y-4 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Recipient</dt>
            <dd>{recipient.displayName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Time</dt>
            <dd>{formatTime(payment.updatedAt)}</dd>
          </div>
          {payment.txHash && (
            <div>
              <dt className="text-muted mb-1">Transaction</dt>
              <dd className="break-all text-[13px] text-ink/80">{payment.txHash}</dd>
            </div>
          )}
        </dl>
        {explorer && (
          <a className="mt-6 inline-block text-gold text-[14px]" href={explorer} target="_blank" rel="noreferrer">
            View on explorer
          </a>
        )}
        <Button className="w-full mt-10" onClick={() => nav(`/g/${group.id}`)}>
          Back to group
        </Button>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="screen">
        <ScreenHeader title="Pay" back={<BackButton onClick={() => nav(`/g/${group.id}`)} />} />
        <Banner tone="warn">Join this group with your wallet before paying.</Banner>
      </div>
    )
  }

  if (!debt || !recipient) {
    return (
      <div className="screen">
        <ScreenHeader title="Pay" back={<BackButton onClick={() => nav(`/g/${group.id}`)} />} />
        <Banner tone="muted">Nothing to pay in {currency}. Switch currency or go back to the group.</Banner>
        <Button className="w-full mt-8" variant="secondary" onClick={() => nav(`/g/${group.id}`)}>
          Back to group
        </Button>
      </div>
    )
  }

  const canPayCurrency = currency === 'NIM' ? Boolean(recipient.nimiqAddress) : Boolean(recipient.ethAddress)
  const networkLabel = currency === 'NIM' ? 'Nimiq' : 'Polygon'

  return (
    <div className="screen">
      <ScreenHeader title="Pay your share" back={<BackButton onClick={() => nav(`/g/${group.id}`)} />} />

      {phase === 'pending' && (
        <div className="mb-5">
          <Banner tone="warn">Payment pending. Approve in Nimiq Pay. Do not close this screen.</Banner>
        </div>
      )}
      {phase === 'rejected' && (
        <div className="mb-5">
          <Banner tone="danger">{error ?? 'Payment was rejected in the wallet.'}</Banner>
        </div>
      )}
      {phase === 'failed' && (
        <div className="mb-5">
          <Banner tone="danger">
            {errorCode === 'insufficient_balance' && 'Not enough balance to complete this payment. '}
            {errorCode === 'wrong_network' && 'Wrong network. Switch to Polygon and retry. '}
            {errorCode === 'duplicate_payment' && 'This payment was already submitted. '}
            {error ?? 'Payment failed. It was not marked as paid.'}
          </Banner>
        </div>
      )}
      {wallet.status !== 'connected' && (
        <div className="mb-5">
          <Banner tone="warn">Wallet disconnected. Reopen Tabiq inside Nimiq Pay.</Banner>
        </div>
      )}

      <div className="text-[12px] uppercase tracking-[0.16em] text-muted mb-2">You owe</div>
      <Amount value={debt.amountMinor} currency={currency} tone="owe" size="xl" />

      <dl className="mt-8 space-y-4 text-[15px]">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Recipient</dt>
          <dd>{memberLabel(recipient, me.id)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Exact amount</dt>
          <dd>{money(debt.amountMinor, currency)}</dd>
        </div>
        <div>
          <dt className="text-muted mb-2">Pay with</dt>
          <div className="grid grid-cols-2 gap-2">
            {(['NIM', 'USDT'] as Currency[]).map((item) => (
              <button
                key={item}
                disabled={phase === 'pending'}
                onClick={() => setCurrency(item)}
                className={`h-12 rounded-2xl border ${currency === item ? 'border-gold text-gold bg-gold/10' : 'border-white/10 text-muted'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Network</dt>
          <dd>{networkLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">To</dt>
          <dd className="text-right text-[13px]">
            {currency === 'NIM' && recipient.nimiqAddress
              ? shortenNimiqAddress(formatNimiqAddress(recipient.nimiqAddress))
              : recipient.ethAddress
                ? shortenEthAddress(recipient.ethAddress)
                : 'No address'}
          </dd>
        </div>
      </dl>

      {!canPayCurrency && (
        <div className="mt-6">
          <Banner tone="warn">
            {currency === 'NIM'
              ? 'This recipient has no Nimiq address. Pay with USDT or ask them to connect NIM.'
              : 'This recipient has no Polygon address. Pay with NIM or ask them to connect Ethereum.'}
          </Banner>
        </div>
      )}

      <Button
        className="w-full mt-8"
        disabled={phase === 'pending' || !canPayCurrency || lock.current}
        onClick={() => void pay()}
      >
        {phase === 'pending' ? 'Waiting for wallet…' : `Pay ${minorToDisplay(debt.amountMinor, currency)} ${currency}`}
      </Button>
      {(phase === 'failed' || phase === 'rejected') && (
        <Button className="w-full mt-3" variant="secondary" onClick={() => void pay()}>
          Retry payment
        </Button>
      )}
      {payment && <div className="mt-4"><StatusPill status={payment.status} /></div>}
    </div>
  )
}
