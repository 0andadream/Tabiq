import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { shortenNimiqAddress } from '@shared/address.ts'
import { minorToDisplay } from '@shared/money.ts'
import type { Currency, DemoInfo, GroupSummary } from '@shared/types.ts'
import { Amount, Button, Logo, Notice, WalletChip } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { fetchDemo, fetchMyGroups } from '../lib/api.ts'
import { toErrorMessage } from '../lib/errors.ts'
import { isPreview } from '../lib/preview.ts'

function sumCurrency(items: { currency: Currency; amountMinor: string }[], currency: Currency): bigint {
  return items
    .filter((item) => item.currency === currency)
    .reduce((acc, item) => acc + BigInt(item.amountMinor), 0n)
}

export function Home() {
  const nav = useNavigate()
  const wallet = useWallet()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [demo, setDemo] = useState<DemoInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [demoResult, myGroups] = await Promise.all([
          fetchDemo(wallet.nimiqAddress, wallet.ethAddress),
          fetchMyGroups(wallet.nimiqAddress, wallet.ethAddress),
        ])
        if (cancelled) return
        setDemo(demoResult.demo)
        setGroups(myGroups)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(toErrorMessage(err))
      }
    }
    void load()
    const timer = window.setInterval(() => {
      if (!isPreview()) void load()
    }, 8000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [wallet.nimiqAddress, wallet.ethAddress])

  const totals = useMemo(() => {
    const oweNim = groups.reduce((acc, group) => acc + sumCurrency(group.youOwe, 'NIM'), 0n)
    const oweUsdt = groups.reduce((acc, group) => acc + sumCurrency(group.youOwe, 'USDT'), 0n)
    const owedNim = groups.reduce((acc, group) => acc + sumCurrency(group.youAreOwed, 'NIM'), 0n)
    const owedUsdt = groups.reduce((acc, group) => acc + sumCurrency(group.youAreOwed, 'USDT'), 0n)
    return { oweNim, oweUsdt, owedNim, owedUsdt }
  }, [groups])

  const oweCurrency: Currency = totals.oweNim > 0n || totals.oweUsdt === 0n ? 'NIM' : 'USDT'
  const oweAmount = oweCurrency === 'NIM' ? totals.oweNim : totals.oweUsdt
  const hasOwe = oweAmount > 0n
  const activeGroup = groups.find((group) => group.youOwe.length > 0) ?? groups[0] ?? (demo ? { id: demo.id } : null)

  const chip = wallet.nimiqAddress ? shortenNimiqAddress(wallet.nimiqAddress) : 'Wallet'

  const theyOwe =
    totals.owedNim > 0n || totals.owedUsdt > 0n
      ? [
          totals.owedNim > 0n ? `${minorToDisplay(totals.owedNim, 'NIM')} NIM` : null,
          totals.owedUsdt > 0n ? `${minorToDisplay(totals.owedUsdt, 'USDT')} USDT` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '0.00 NIM'

  return (
    <div className="screen flex flex-col">
      <div className="flex items-center justify-between">
        <Logo />
        <WalletChip label={chip} onClick={() => nav('/settings')} />
      </div>

      {isPreview() && (
        <div className="mt-5">
          <Notice tone="muted">Preview. Pay in Nimiq Pay.</Notice>
        </div>
      )}
      {wallet.status === 'error' && (
        <div className="mt-5">
          <Notice tone="danger">{wallet.error ?? 'Wallet disconnected.'}</Notice>
        </div>
      )}
      {error && !isPreview() && (
        <div className="mt-5">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      <section className="mt-14">
        <div className="text-[14px] text-muted mb-3">{hasOwe ? 'You owe' : 'You owe'}</div>
        <Amount
          value={oweAmount}
          currency={oweCurrency}
          tone={hasOwe ? 'owe' : 'default'}
          size="xl"
          countUp
        />
        <p className="mt-5 text-[14px] text-muted">They owe you {theyOwe}</p>
      </section>

      <div className="mt-10 space-y-3">
        <Button
          className="w-full"
          disabled={!activeGroup}
          onClick={() => activeGroup && nav(`/g/${activeGroup.id}?pay=1`)}
        >
          Pay now
        </Button>
        <Button
          className="w-full"
          variant="secondary"
          disabled={!activeGroup}
          onClick={() => activeGroup && nav(`/g/${activeGroup.id}?add=1`)}
        >
          Add expense
        </Button>
      </div>

      <section className="mt-12 flex-1">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] text-muted">Groups</div>
          <div className="flex gap-4 text-[13px] text-muted">
            <button onClick={() => nav('/create')}>Create</button>
            <button onClick={() => nav('/join')}>Join</button>
          </div>
        </div>
        <div className="hairline" />
        {groups.length === 0 ? (
          <p className="py-6 text-[14px] text-muted">No groups yet.</p>
        ) : (
          groups.map((group) => {
            const owe = group.youOwe[0]
            const owed = group.youAreOwed[0]
            const settled = !owe && !owed
            return (
              <button
                key={group.id}
                onClick={() => nav(`/g/${group.id}`)}
                className={`w-full py-4 flex items-center justify-between gap-3 text-left border-b border-line ${
                  settled ? 'opacity-55' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[16px] font-medium tracking-[-0.03em] truncate">{group.name}</div>
                  <div className="mt-0.5 text-[12px] text-muted">{group.memberCount} people</div>
                </div>
                <div className="shrink-0 text-right">
                  {owe ? (
                    <div className="num text-[18px] text-danger">{minorToDisplay(owe.amountMinor, owe.currency)}</div>
                  ) : owed ? (
                    <div className="num text-[18px] text-ok">{minorToDisplay(owed.amountMinor, owed.currency)}</div>
                  ) : (
                    <div className="text-[12px] font-medium text-ok">Settled</div>
                  )}
                </div>
              </button>
            )
          })
        )}
      </section>
    </div>
  )
}
