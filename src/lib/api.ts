import type { Currency, DemoInfo, Group, GroupSummary, Network, Payment, PaymentStatus } from '@shared/types.ts'
import { AppError, isAppError } from './errors.ts'
import {
  getPreviewDemo,
  getPreviewGroup,
  getPreviewSummaries,
  PREVIEW_GROUP_ID,
} from './preview.ts'
import { cacheGroup, cacheGroups, loadCachedGroup } from './storage.ts'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

type ApiErrorBody = {
  error?: string
  code?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 12_000)

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      signal: controller.signal,
    })

    const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody
    if (!response.ok) {
      const code = body.code === 'invalid_code'
        ? 'invalid_code'
        : body.code === 'duplicate_payment'
          ? 'duplicate_payment'
          : body.code === 'not_found'
            ? 'not_found'
            : response.status >= 500
              ? 'backend_unavailable'
              : 'bad_request'
      throw new AppError(code, body.error || 'Request failed', code !== 'not_found')
    }
    return body
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(
      'backend_unavailable',
      'Tabiq cannot reach the server right now. Check your connection and retry.',
      true,
    )
  } finally {
    window.clearTimeout(timer)
  }
}

export async function fetchHealth(): Promise<boolean> {
  try {
    await request<{ ok: boolean }>('/api/health')
    return true
  } catch {
    return false
  }
}

function isUnavailable(error: unknown): boolean {
  return isAppError(error) && error.code === 'backend_unavailable'
}

export async function fetchDemo(nimiq?: string | null, eth?: string | null): Promise<{ demo: DemoInfo; group: Group }> {
  const params = new URLSearchParams()
  if (nimiq) params.set('nimiq', nimiq)
  if (eth) params.set('eth', eth)
  const suffix = params.size ? `?${params}` : ''
  try {
    const result = await request<{ demo: DemoInfo; group: Group }>(`/api/demo${suffix}`)
    cacheGroup(result.group)
    return result
  } catch (error) {
    if (isUnavailable(error)) return getPreviewDemo()
    throw error
  }
}

export async function fetchMyGroups(nimiq?: string | null, eth?: string | null): Promise<GroupSummary[]> {
  const params = new URLSearchParams()
  if (nimiq) params.set('nimiq', nimiq)
  if (eth) params.set('eth', eth)
  const suffix = params.size ? `?${params}` : ''
  try {
    const result = await request<{ groups: GroupSummary[] }>(`/api/groups${suffix}`)
    return result.groups
  } catch (error) {
    if (isUnavailable(error)) return getPreviewSummaries()
    throw error
  }
}

export async function fetchGroup(id: string): Promise<Group> {
  try {
    const result = await request<{ group: Group }>(`/api/groups/${id}`)
    cacheGroup(result.group)
    cacheGroups([result.group])
    return result.group
  } catch (error) {
    if (id === PREVIEW_GROUP_ID || isUnavailable(error)) {
      const preview = getPreviewDemo().group
      if (id === preview.id || id === PREVIEW_GROUP_ID) return preview
    }
    const cached = loadCachedGroup(id)
    if (cached) return cached
    throw error
  }
}

export async function lookupCode(code: string): Promise<{ id: string; code: string; name: string; memberCount: number }> {
  try {
    const result = await request<{ group: { id: string; code: string; name: string; memberCount: number } }>(
      `/api/groups/code/${encodeURIComponent(code.trim().toUpperCase())}`,
    )
    return result.group
  } catch (error) {
    if (isUnavailable(error) && code.trim().toUpperCase() === 'FRIDAY') {
      const group = getPreviewDemo().group
      return { id: group.id, code: group.code, name: group.name, memberCount: group.members.length }
    }
    throw error
  }
}

export async function createGroup(input: {
  name: string
  displayName: string
  nimiqAddress?: string | null
  ethAddress?: string | null
}): Promise<Group> {
  const result = await request<{ group: Group }>('/api/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  cacheGroup(result.group)
  return result.group
}

export async function joinGroup(input: {
  code: string
  displayName: string
  nimiqAddress?: string | null
  ethAddress?: string | null
}): Promise<Group> {
  try {
    const result = await request<{ group: Group }>(`/api/groups/code/${encodeURIComponent(input.code.trim().toUpperCase())}/join`, {
      method: 'POST',
      body: JSON.stringify({
        displayName: input.displayName,
        nimiqAddress: input.nimiqAddress,
        ethAddress: input.ethAddress,
      }),
    })
    cacheGroup(result.group)
    return result.group
  } catch (error) {
    if (isUnavailable(error) && input.code.trim().toUpperCase() === 'FRIDAY') {
      return getPreviewGroup()
    }
    throw error
  }
}

export async function addExpense(groupId: string, input: {
  title: string
  amount: string
  currency: Currency
  payerId: string
  participantIds: string[]
  splitType: 'equal' | 'custom'
  customSplits?: { memberId: string; amount: string }[]
}): Promise<Group> {
  const result = await request<{ group: Group }>(`/api/groups/${groupId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  cacheGroup(result.group)
  return result.group
}

export async function createPayment(groupId: string, input: {
  fromMemberId: string
  toMemberId: string
  amountMinor: string
  currency: Currency
  idempotencyKey: string
  status: Extract<PaymentStatus, 'pending' | 'submitted'>
  txHash?: string | null
  network?: Network | null
}): Promise<{ payment: Payment; group: Group }> {
  const result = await request<{ payment: Payment; group: Group }>(`/api/groups/${groupId}/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  cacheGroup(result.group)
  return result
}

export async function updatePayment(
  groupId: string,
  paymentId: string,
  input: {
    status: PaymentStatus
    txHash?: string | null
    network?: Network | null
  },
): Promise<{ payment: Payment; group: Group }> {
  const result = await request<{ payment: Payment; group: Group }>(`/api/groups/${groupId}/payments/${paymentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  cacheGroup(result.group)
  return result
}

export async function updateMyName(
  groupId: string,
  input: { displayName: string; nimiqAddress?: string | null; ethAddress?: string | null },
): Promise<Group> {
  const result = await request<{ group: Group }>(`/api/groups/${groupId}/members/me`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  cacheGroup(result.group)
  return result.group
}
