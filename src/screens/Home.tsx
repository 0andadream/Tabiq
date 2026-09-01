import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { minorToDisplay } from '@shared/money.ts'
import type { Currency, DemoInfo, GroupSummary } from '@shared/types.ts'
import { Amount, Banner, Button, Logo } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { fetchDemo, fetchMyGroups } from '../lib/api.ts'
import { isAppError, toErrorMessage } from '../lib/errors.ts'

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
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [demoResult, myGroups] = await Promise.all([
          fetchDemo(wallet.nimiqAddress, wallet.ethAddress),
          wallet.nimiqAddress || wallet.ethAddress
            ? fetchMyGroups(wallet.nimiqAddress, wallet.ethAddress)
            : Promise.resolve([] as GroupSummary[]),
        ])
        if (cancelled) return
        setDemo(demoResult.demo)
        setGroups(myGroups)
        setOffline(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setOffline(isAppError(err) && err.code === 'backend_unavailable')
        setError(toErrorMessage(err))
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 8000)
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

  const primaryOwe = totals.oweNim > 0n || totals.oweUsdt === 0n
  const canAct = wallet.status === 'connected'

  return (
    <div className="screen flex flex-col">
      <div className="flex items-start justify-between mb-8">
        <div>
          <Logo />
          <p className="mt-3 text-[13px] text-muted">Split the bill. Settle in NIM.</p>
        </div>
        <button
          onClick={() => nav('/settings')}
          className="text-[12px] uppercase tracking-[0.16em] text-muted mt-1"
        >
          Settings
        </button>
      </div>

      {wallet.status === 'connecting' && (
        <Banner tone="muted">Connecting wallet…</Banner>
      )}
      {wallet.status === 'unavailable' && (
        <Banner
          tone="warn"
          action={
            <button className="text-[12px] uppercase tracking-[0.12em]" onClick={() => void wallet.connect()}>
              Retry
            </button>
          }
        >
          Wallet unavailable. Open Tabiq inside Nimiq Pay to pay.
        </Banner>
      )}
      {wallet.status === 'error' && (
        <Banner
          tone="danger"
          action={
            <button className="text-[12px] uppercase tracking-[0.12em]" onClick={() => void wallet.connect()}>
              Retry
            </button>
          }
        >
          {wallet.error ?? 'Wallet disconnected.'}
        </Banner>
      )}
      {offline && (
        <Banner tone="danger">Backend unavailable. Groups cannot sync until the server is back.</Banner>
      )}
      {error && !offline && <Banner tone="danger">{error}</Banner>}

      <section className="mt-8">
        <div className="text-[12px] uppercase tracking-[0.18em] text-muted mb-3">You owe</div>
        {primaryOwe ? (
          <Amount value={totals.oweNim} currency="NIM" tone="owe" size="xl" />
        ) : (
          <Amount value={totals.oweUsdt} currency="USDT" tone="owe" size="xl" />
        )}
        {totals.oweNim > 0n && totals.oweUsdt > 0n && (
          <p className="mt-2 text-[13px] text-muted">and {minorToDisplay(totals.oweUsdt, 'USDT')} USDT</p>
        )}
      </section>

      <section className="mt-8">
        <div className="text-[12px] uppercase tracking-[0.18em] text-muted mb-2">You are owed</div>
        <div className="text-[18px] text-ok">
          {totals.owedNim > 0n || totals.owedUsdt > 0n
            ? `You're owed ${totals.owedNim > 0n ? `${minorToDisplay(totals.owedNim, 'NIM')} NIM` : ''}`.trim() +
              (totals.owedUsdt > 0n ? `${totals.owedNim > 0n ? ' and ' : ''}${minorToDisplay(totals.owedUsdt, 'USDT')} USDT` : '')
            : `You're owed 0.00 NIM`}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <Button onClick={() => nav('/create')} disabled={!canAct}>
          Create group
        </Button>
        <Button variant="secondary" onClick={() => nav('/join')} disabled={!canAct}>
          Join group
        </Button>
      </div>
      {!canAct && (
        <p className="mt-3 text-[13px] text-muted">
          Connect in Nimiq Pay to create or join a group. This usually takes a few seconds.
        </p>
      )}

      {demo && !demo.joined && (
        <button
          onClick={() => nav(`/join/${demo.code}`)}
          className="mt-8 w-full text-left rounded-[24px] border border-gold/25 bg-gold/[0.06] p-5 active:scale-[0.995] transition"
        >
          <div className="text-[12px] uppercase tracking-[0.16em] text-gold">Demo</div>
          <div className="mt-2 text-[20px] font-medium">Friday Dinner</div>
          <p className="mt-2 text-[14px] text-muted leading-relaxed">
            Dinner — 40 NIM, split equally. Your share is 10.00 NIM.
          </p>
          <div className="mt-4 text-[13px] font-medium text-gold">Join Friday Dinner →</div>
        </button>
      )}

      <section className="mt-10 flex-1">
        <div className="text-[12px] uppercase tracking-[0.18em] text-muted mb-4">My groups</div>
        {groups.length === 0 ? (
          <p className="text-[14px] text-muted">No groups yet. Create one or join Friday Dinner.</p>
        ) : (
          <div className="divide-y divide-white/8">
            {groups.map((group) => {
              const owe = group.youOwe[0]
              const owed = group.youAreOwed[0]
              return (
                <button
                  key={group.id}
                  onClick={() => nav(`/g/${group.id}`)}
                  className="w-full py-4 flex items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-[16px] truncate">{group.name}</div>
                    <div className="mt-1 text-[13px] text-muted">
                      {group.memberCount} {group.memberCount === 1 ? 'person' : 'people'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {owe ? (
                      <div className="text-gold text-[15px]">
                        You owe {minorToDisplay(owe.amountMinor, owe.currency)} {owe.currency}
                      </div>
                    ) : owed ? (
                      <div className="text-ok text-[15px]">
                        You're owed {minorToDisplay(owed.amountMinor, owed.currency)} {owed.currency}
                      </div>
                    ) : (
                      <div className="text-muted text-[15px]">Settled</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
