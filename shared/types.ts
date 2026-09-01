export const CURRENCIES = ['NIM', 'USDT'] as const
export type Currency = (typeof CURRENCIES)[number]

export const SPLIT_TYPES = ['equal', 'custom'] as const
export type SplitType = (typeof SPLIT_TYPES)[number]

export const PAYMENT_STATUSES = [
  'pending',
  'submitted',
  'confirmed',
  'failed',
  'rejected',
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const NETWORKS = ['nimiq', 'polygon'] as const
export type Network = (typeof NETWORKS)[number]

export type Member = {
  id: string
  groupId: string
  displayName: string
  nimiqAddress: string | null
  ethAddress: string | null
  isDemo: boolean
  claimed: boolean
  createdAt: number
}

export type Split = {
  memberId: string
  amountMinor: string
}

export type Expense = {
  id: string
  groupId: string
  title: string
  amountMinor: string
  currency: Currency
  payerId: string
  splitType: SplitType
  splits: Split[]
  createdAt: number
}

export type Payment = {
  id: string
  groupId: string
  fromMemberId: string
  toMemberId: string
  amountMinor: string
  currency: Currency
  status: PaymentStatus
  txHash: string | null
  network: Network | null
  idempotencyKey: string
  createdAt: number
  updatedAt: number
}

export type Group = {
  id: string
  code: string
  name: string
  createdAt: number
  createdBy: string
  members: Member[]
  expenses: Expense[]
  payments: Payment[]
}

export type GroupSummary = {
  id: string
  code: string
  name: string
  createdAt: number
  memberCount: number
  youOwe: { currency: Currency; amountMinor: string }[]
  youAreOwed: { currency: Currency; amountMinor: string }[]
}

export type DemoInfo = {
  id: string
  code: string
  name: string
  joined: boolean
}

export const DEMO_GROUP_CODE = 'FRIDAY'
export const DEMO_GROUP_NAME = 'Friday Dinner'
export const DEMO_EXPENSE_TITLE = 'Dinner'
