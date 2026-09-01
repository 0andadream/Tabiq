import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SETTLED_STATUSES } from '@shared/balances.ts'
import type { Group } from '@shared/types.ts'
import { Avatar, BackButton, Banner, ScreenHeader, StatusPill } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { fetchGroup, fetchMyGroups } from '../lib/api.ts'
import { toErrorMessage } from '../lib/errors.ts'
import { formatTime, memberLabel, money } from '../lib/format.ts'
import { polygonExplorerUrl } from '../lib/ethereum.ts'
import { findMe } from '../lib/identity.ts'
import { nimiqExplorerUrl } from '../lib/nimiq.ts'

type ActivityItem = {
  id: string
  at: number
  title: string
  detail: string
  status?: Parameters<typeof StatusPill>[0]['status']
  hash?: string | null
  network?: 'nimiq' | 'polygon' | null
  groupName?: string
}

export function Activity({ global = false }: { global?: boolean }) {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const wallet = useWallet()
  const [groups, setGroups] = useState<Group[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (global) {
          const summaries = await fetchMyGroups(wallet.nimiqAddress, wallet.ethAddress)
          const loaded = await Promise.all(summaries.map((item) => fetchGroup(item.id)))
          if (!cancelled) setGroups(loaded)
        } else {
          const group = await fetchGroup(id)
          if (!cancelled) setGroups([group])
        }
        if (!cancelled) setError(null)
      } catch (err) {
        if (!cancelled) setError(toErrorMessage(err))
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [global, id, wallet.ethAddress, wallet.nimiqAddress])

  const items = useMemo(() => {
    const list: ActivityItem[] = []
    for (const group of groups) {
      const me = findMe(group, wallet.nimiqAddress, wallet.ethAddress)
      for (const expense of group.expenses) {
        const payer = group.members.find((member) => member.id === expense.payerId)
        list.push({
          id: expense.id,
          at: expense.createdAt,
          title: expense.title,
          detail: `${payer ? memberLabel(payer, me?.id) : 'Someone'} paid ${money(expense.amountMinor, expense.currency)}`,
          groupName: global ? group.name : undefined,
        })
      }
      for (const payment of group.payments) {
        const from = group.members.find((member) => member.id === payment.fromMemberId)
        const to = group.members.find((member) => member.id === payment.toMemberId)
        const settled = SETTLED_STATUSES.has(payment.status)
        list.push({
          id: payment.id,
          at: payment.updatedAt,
          title: settled ? 'Payment' : 'Payment attempt',
          detail: `${from ? memberLabel(from, me?.id) : 'Someone'} → ${to ? memberLabel(to, me?.id) : 'someone'} · ${money(payment.amountMinor, payment.currency)}`,
          status: payment.status,
          hash: payment.txHash,
          network: payment.network,
          groupName: global ? group.name : undefined,
        })
      }
    }
    return list.sort((a, b) => b.at - a.at)
  }, [global, groups, wallet.ethAddress, wallet.nimiqAddress])

  const title = global ? 'Activity' : groups[0]?.name ?? 'Activity'

  return (
    <div className="screen">
      <ScreenHeader
        title={title}
        subtitle={global ? 'Expenses and payments across your groups' : 'Expenses and payments'}
        back={<BackButton onClick={() => nav(global ? '/' : `/g/${id}`)} />}
      />
      {error && (
        <div className="mb-5">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-[14px] text-muted">Nothing here yet.</p>
      ) : (
        <div className="space-y-5">
          {items.map((item) => {
            const explorer = item.hash
              ? item.network === 'polygon'
                ? polygonExplorerUrl(item.hash)
                : nimiqExplorerUrl(item.hash)
              : null
            return (
              <div key={item.id} className="flex gap-3">
                <Avatar name={item.title} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[16px]">{item.title}</div>
                      {item.groupName && <div className="text-[12px] text-muted mt-0.5">{item.groupName}</div>}
                    </div>
                    {item.status && <StatusPill status={item.status} />}
                  </div>
                  <p className="mt-1 text-[14px] text-muted">{item.detail}</p>
                  <p className="mt-1 text-[12px] text-muted/80">{formatTime(item.at)}</p>
                  {item.hash && (
                    <p className="mt-2 text-[12px] break-all text-ink/70">
                      {explorer ? (
                        <a href={explorer} className="text-gold" target="_blank" rel="noreferrer">
                          {item.hash}
                        </a>
                      ) : (
                        item.hash
                      )}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
