import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatNimiqAddress, shortenEthAddress, shortenNimiqAddress } from '@shared/address.ts'
import { netsForCurrency, pairwiseDebts } from '@shared/balances.ts'
import { minorToDisplay } from '@shared/money.ts'
import type { Currency, Group, Network, Payment } from '@shared/types.ts'
import { Amount, BackButton, Button, Notice, ScreenHeader, Segmented, StatusMark } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { createPayment, fetchGroup, updatePayment } from '../lib/api.ts'
import { isAppError, toErrorMessage, type AppErrorCode } from '../lib/errors.ts'
import { formatTime, memberLabel, money } from '../lib/format.ts'
import { getTransactionReceipt, polygonExplorerUrl, sendUsdt } from '../lib/ethereum.ts'
import { findMe } from '../lib/identity.ts'
import { nimiqExplorerUrl, sendNim } from '../lib/nimiq.ts'

type Phase = 'ready' | 'pending' | 'success' | 'rejected' | 'failed'

export function Settle({ inSheet = false, onClose }: { inSheet?: boolean; onClose?: () => void } = {}) {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const goBack = () => {
    if (inSheet) onClose?.()
    else nav(`/g/${id}`)
  }
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

  const wrap = (node: ReactNode) =>
    inSheet ? <div>{node}</div> : <div className="screen">{node}</div>

  if (!group) {
    return wrap(
      <>
        {!inSheet && <ScreenHeader title="Pay" back={<BackButton onClick={() => nav(-1)} />} />}
        {error ? <Notice tone="danger">{error}</Notice> : <p className="text-muted">Loading…</p>}
      </>,
    )
  }

  if (phase === 'success' && payment && recipient) {
    const explorer = payment.network === 'polygon' && payment.txHash
      ? polygonExplorerUrl(payment.txHash)
      : payment.txHash
        ? nimiqExplorerUrl(payment.txHash)
        : null
    return (
      wrap(
        <>
          {!inSheet && <ScreenHeader title="Settled" back={<BackButton onClick={goBack} />} />}
          <p className="text-[28px] font-semibold tracking-[-0.04em] text-ok">Settled</p>
          <div className="mt-8">
            <Amount value={payment.amountMinor} currency={payment.currency} tone="ok" />
          </div>
          <div className="mt-8 hairline" />
          <div className="py-4 flex justify-between text-[15px] border-b border-line">
            <span className="text-muted">To</span>
            <span>{recipient.displayName}</span>
          </div>
          <div className="py-4 flex justify-between text-[15px] border-b border-line">
            <span className="text-muted">Time</span>
            <span>{formatTime(payment.updatedAt)}</span>
          </div>
          {payment.txHash && (
            <div className="py-4 border-b border-line">
              <div className="text-muted text-[13px] mb-1">Transaction</div>
              <div className="break-all text-[12px] text-muted font-mono">{payment.txHash}</div>
            </div>
          )}
          {explorer && (
            <a className="mt-5 inline-block text-[14px] text-gold" href={explorer} target="_blank" rel="noreferrer">
              View on explorer
            </a>
          )}
          <Button className="w-full mt-8" variant="secondary" onClick={goBack}>
            Done
          </Button>
        </>,
      )
    )
  }

  if (!me) {
    return (
      wrap(
        <>
          {!inSheet && <ScreenHeader title="Pay" back={<BackButton onClick={goBack} />} />}
          <Notice tone="warn">Join this group with your wallet before paying.</Notice>
        </>,
      )
    )
  }

  if (!debt || !recipient) {
    return (
      wrap(
        <>
          {!inSheet && <ScreenHeader title="Pay" back={<BackButton onClick={goBack} />} />}
          <Notice tone="muted">Nothing to pay in {currency}.</Notice>
          <Button className="w-full mt-8" variant="secondary" onClick={goBack}>
            Close
          </Button>
        </>,
      )
    )
  }

  const canPayCurrency = currency === 'NIM' ? Boolean(recipient.nimiqAddress) : Boolean(recipient.ethAddress)
  const networkLabel = currency === 'NIM' ? 'Nimiq' : 'Polygon'

  return wrap(
    <>
      {!inSheet && <ScreenHeader title="Pay your share" back={<BackButton onClick={goBack} />} />}

      {phase === 'pending' && (
        <div className="mb-4"><Notice tone="warn">Payment pending. Approve in Nimiq Pay.</Notice></div>
      )}
      {phase === 'rejected' && (
        <div className="mb-4"><Notice tone="danger">{error ?? 'Payment was rejected in the wallet.'}</Notice></div>
      )}
      {phase === 'failed' && (
        <div className="mb-4">
          <Notice tone="danger">
            {errorCode === 'insufficient_balance' && 'Not enough balance. '}
            {errorCode === 'wrong_network' && 'Switch to Polygon and retry. '}
            {errorCode === 'duplicate_payment' && 'This payment was already submitted. '}
            {error ?? 'Payment failed. It was not marked as paid.'}
          </Notice>
        </div>
      )}
      {wallet.status !== 'connected' && (
        <div className="mb-4"><Notice tone="warn">Wallet disconnected. Reopen Tabiq inside Nimiq Pay.</Notice></div>
      )}

      <p className="text-[14px] text-muted mb-4">To {memberLabel(recipient, me.id)}</p>
      <Amount value={debt.amountMinor} currency={currency} tone="owe" size="xl" />

      <div className="mt-8">
        <div className="text-[12px] text-muted mb-2">Pay with</div>
        <Segmented
          value={currency}
          disabled={phase === 'pending'}
          onChange={setCurrency}
          options={[
            { value: 'NIM', label: 'NIM' },
            { value: 'USDT', label: 'USDT' },
          ]}
        />
      </div>

      <div className="mt-6 hairline" />
      <div className="py-4 flex justify-between text-[15px] border-b border-line">
        <span className="text-muted">Amount</span>
        <span>{money(debt.amountMinor, currency)}</span>
      </div>
      <div className="py-4 flex justify-between text-[15px] border-b border-line">
        <span className="text-muted">Network</span>
        <span>{networkLabel}</span>
      </div>
      <div className="py-4 flex justify-between gap-4 text-[15px] border-b border-line">
        <span className="text-muted">Address</span>
        <span className="text-right text-[13px] font-mono">
          {currency === 'NIM' && recipient.nimiqAddress
            ? shortenNimiqAddress(formatNimiqAddress(recipient.nimiqAddress))
            : recipient.ethAddress
              ? shortenEthAddress(recipient.ethAddress)
              : 'No address'}
        </span>
      </div>

      {!canPayCurrency && (
        <div className="mt-4">
          <Notice tone="warn">
            {currency === 'NIM'
              ? 'This recipient has no Nimiq address. Pay with USDT.'
              : 'This recipient has no Polygon address. Pay with NIM.'}
          </Notice>
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
          Retry
        </Button>
      )}
      {payment && (
        <div className="mt-5">
          <StatusMark status={payment.status} />
        </div>
      )}
    </>,
  )
}
