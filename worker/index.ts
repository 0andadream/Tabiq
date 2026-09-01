import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { addressFromLabel, isValidEthAddress, isValidNimiqAddress, normalizeEthAddress, normalizeNimiqAddress } from '../shared/address.ts'
import { memberNet, netsForCurrency, pairwiseDebts, SETTLED_STATUSES } from '../shared/balances.ts'
import { parseToMinor, splitEqual, sumMinor } from '../shared/money.ts'
import {
  CURRENCIES,
  DEMO_EXPENSE_TITLE,
  DEMO_GROUP_CODE,
  DEMO_GROUP_NAME,
  type Currency,
  type DemoInfo,
  type Expense,
  type Group,
  type GroupSummary,
  type Member,
  type Network,
  type Payment,
  type PaymentStatus,
  type SplitType,
} from '../shared/types.ts'

type D1Stmt = {
  bind: (...args: unknown[]) => D1Stmt
  first: <T>() => Promise<T | null>
  all: <T>() => Promise<{ results: T[] }>
  run: () => Promise<{ success: boolean; meta?: { changes?: number } }>
}

type D1Database = {
  prepare: (query: string) => D1Stmt
  exec: (query: string) => Promise<unknown>
}

type Env = {
  DB: D1Database
}

type MemberRow = {
  id: string
  group_id: string
  display_name: string
  nimiq_address: string | null
  eth_address: string | null
  is_demo: number
  claimed: number
  created_at: number
}

type GroupRow = {
  id: string
  code: string
  name: string
  created_at: number
  created_by: string
}

type ExpenseRow = {
  id: string
  group_id: string
  title: string
  amount_minor: string
  currency: Currency
  payer_id: string
  split_type: SplitType
  created_at: number
}

type SplitRow = {
  id: string
  expense_id: string
  member_id: string
  amount_minor: string
}

type PaymentRow = {
  id: string
  group_id: string
  from_member_id: string
  to_member_id: string
  amount_minor: string
  currency: Currency
  status: PaymentStatus
  tx_hash: string | null
  network: Network | null
  idempotency_key: string
  created_at: number
  updated_at: number
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    nimiq_address TEXT,
    eth_address TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    claimed INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    title TEXT NOT NULL,
    amount_minor TEXT NOT NULL,
    currency TEXT NOT NULL,
    payer_id TEXT NOT NULL,
    split_type TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS splits (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount_minor TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    from_member_id TEXT NOT NULL,
    to_member_id TEXT NOT NULL,
    amount_minor TEXT NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    tx_hash TEXT,
    network TEXT,
    idempotency_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_code ON groups(code)',
  'CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id)',
  'CREATE INDEX IF NOT EXISTS idx_members_nimiq ON members(nimiq_address)',
  'CREATE INDEX IF NOT EXISTS idx_members_eth ON members(eth_address)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id)',
  'CREATE INDEX IF NOT EXISTS idx_splits_expense ON splits(expense_id)',
  'CREATE INDEX IF NOT EXISTS idx_payments_group ON payments(group_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotency_key)',
]

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const READY_STATUSES = SETTLED_STATUSES
const RETRYABLE = new Set<PaymentStatus>(['pending', 'failed', 'rejected'])

function now(): number {
  return Date.now()
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

function jsonError(message: string, status = 400, code?: string) {
  return Response.json({ error: message, code: code ?? 'bad_request' }, { status })
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

function mapMember(row: MemberRow): Member {
  return {
    id: row.id,
    groupId: row.group_id,
    displayName: row.display_name,
    nimiqAddress: row.nimiq_address,
    ethAddress: row.eth_address,
    isDemo: row.is_demo === 1,
    claimed: row.claimed === 1,
    createdAt: row.created_at,
  }
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    groupId: row.group_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    txHash: row.tx_hash,
    network: row.network,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeOptionalNimiq(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  if (!isValidNimiqAddress(value)) throw new Error('Invalid Nimiq address')
  return normalizeNimiqAddress(value)
}

function normalizeOptionalEth(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  if (!isValidEthAddress(value)) throw new Error('Invalid Ethereum address')
  return normalizeEthAddress(value)
}

async function ensureSchema(db: D1Database): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.prepare(statement).run()
  }
}

async function loadGroup(db: D1Database, groupId: string): Promise<Group | null> {
  const group = await db.prepare('SELECT * FROM groups WHERE id = ?').bind(groupId).first<GroupRow>()
  if (!group) return null

  const members = (await db.prepare('SELECT * FROM members WHERE group_id = ? ORDER BY created_at').bind(groupId).all<MemberRow>()).results
  const expenses = (await db.prepare('SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at').bind(groupId).all<ExpenseRow>()).results
  const payments = (await db.prepare('SELECT * FROM payments WHERE group_id = ? ORDER BY created_at').bind(groupId).all<PaymentRow>()).results
  const expenseIds = expenses.map((row) => row.id)
  const splits = expenseIds.length
    ? (await db.prepare(`SELECT * FROM splits WHERE expense_id IN (${expenseIds.map(() => '?').join(',')})`).bind(...expenseIds).all<SplitRow>()).results
    : []

  const splitsByExpense = new Map<string, SplitRow[]>()
  for (const split of splits) {
    const list = splitsByExpense.get(split.expense_id) ?? []
    list.push(split)
    splitsByExpense.set(split.expense_id, list)
  }

  return {
    id: group.id,
    code: group.code,
    name: group.name,
    createdAt: group.created_at,
    createdBy: group.created_by,
    members: members.map(mapMember),
    expenses: expenses.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      title: row.title,
      amountMinor: row.amount_minor,
      currency: row.currency,
      payerId: row.payer_id,
      splitType: row.split_type,
      createdAt: row.created_at,
      splits: (splitsByExpense.get(row.id) ?? []).map((split) => ({
        memberId: split.member_id,
        amountMinor: split.amount_minor,
      })),
    })),
    payments: payments.map(mapPayment),
  }
}

async function loadGroupByCode(db: D1Database, code: string): Promise<Group | null> {
  const row = await db.prepare('SELECT id FROM groups WHERE code = ?').bind(code.toUpperCase()).first<{ id: string }>()
  if (!row) return null
  return loadGroup(db, row.id)
}

function findMemberByWallet(group: Group, nimiq: string | null, eth: string | null): Member | undefined {
  return group.members.find((member) => {
    if (nimiq && member.nimiqAddress && normalizeNimiqAddress(member.nimiqAddress) === nimiq) return true
    if (eth && member.ethAddress && member.ethAddress === eth) return true
    return false
  })
}

function summarize(group: Group, memberId: string | null): GroupSummary {
  const youOwe: GroupSummary['youOwe'] = []
  const youAreOwed: GroupSummary['youAreOwed'] = []

  if (memberId) {
    for (const currency of CURRENCIES) {
      const net = memberNet(
        netsForCurrency(group.members, group.expenses, group.payments, currency),
        memberId,
      )
      if (net < 0n) youOwe.push({ currency, amountMinor: (-net).toString() })
      if (net > 0n) youAreOwed.push({ currency, amountMinor: net.toString() })
    }
  }

  return {
    id: group.id,
    code: group.code,
    name: group.name,
    createdAt: group.createdAt,
    memberCount: group.members.filter((member) => member.claimed).length,
    youOwe,
    youAreOwed,
  }
}

async function seedFridayDinner(db: D1Database): Promise<Group> {
  const existing = await loadGroupByCode(db, DEMO_GROUP_CODE)
  if (existing) return existing

  try {

  const createdAt = now()
  const groupId = id('grp')
  const alex = await addressFromLabel('alex')
  const sarah = await addressFromLabel('sarah')
  const david = await addressFromLabel('david')

  const youId = id('mem')
  const alexId = id('mem')
  const sarahId = id('mem')
  const davidId = id('mem')
  const expenseId = id('exp')

  const total = parseToMinor('40', 'NIM')
  const shares = splitEqual(total, 4)
  const participants = [youId, alexId, sarahId, davidId]

  await db.prepare(
    'INSERT INTO groups (id, code, name, created_at, created_by) VALUES (?, ?, ?, ?, ?)',
  ).bind(groupId, DEMO_GROUP_CODE, DEMO_GROUP_NAME, createdAt, alexId).run()

  const memberInsert = db.prepare(
    'INSERT INTO members (id, group_id, display_name, nimiq_address, eth_address, is_demo, claimed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )

  await memberInsert.bind(youId, groupId, 'You', null, null, 0, 0, createdAt).run()
  await memberInsert.bind(alexId, groupId, 'Alex', normalizeNimiqAddress(alex.nimiq), alex.eth, 1, 1, createdAt).run()
  await memberInsert.bind(sarahId, groupId, 'Sarah', normalizeNimiqAddress(sarah.nimiq), sarah.eth, 1, 1, createdAt).run()
  await memberInsert.bind(davidId, groupId, 'David', normalizeNimiqAddress(david.nimiq), david.eth, 1, 1, createdAt).run()

  await db.prepare(
    'INSERT INTO expenses (id, group_id, title, amount_minor, currency, payer_id, split_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(expenseId, groupId, DEMO_EXPENSE_TITLE, total.toString(), 'NIM', alexId, 'equal', createdAt).run()

  const splitInsert = db.prepare(
    'INSERT INTO splits (id, expense_id, member_id, amount_minor) VALUES (?, ?, ?, ?)',
  )
  for (let i = 0; i < participants.length; i += 1) {
    await splitInsert.bind(id('spl'), expenseId, participants[i], shares[i].toString()).run()
  }

    const seeded = await loadGroup(db, groupId)
    if (!seeded) throw new Error('Failed to seed Friday Dinner')
    return seeded
  } catch (error) {
    const raced = await loadGroupByCode(db, DEMO_GROUP_CODE)
    if (raced) return raced
    throw error
  }
}

async function uniqueCode(db: D1Database): Promise<string> {
  for (let i = 0; i < 12; i += 1) {
    const code = randomCode()
    const exists = await db.prepare('SELECT id FROM groups WHERE code = ?').bind(code).first()
    if (!exists) return code
  }
  return randomCode() + randomCode().slice(0, 2)
}

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowHeaders: ['Content-Type'] }))

app.use('/api/*', async (c, next) => {
  try {
    await ensureSchema(c.env.DB)
    await seedFridayDinner(c.env.DB)
  } catch (error) {
    console.error('bootstrap failed', error)
    return jsonError('Backend unavailable', 503, 'backend_unavailable')
  }
  await next()
})

app.get('/api/health', (c) => c.json({ ok: true, name: 'Tabiq' }))

app.get('/api/demo', async (c) => {
  const nimiq = c.req.query('nimiq') ? normalizeNimiqAddress(c.req.query('nimiq') ?? '') : null
  const eth = c.req.query('eth') ? normalizeEthAddress(c.req.query('eth') ?? '') : null
  const group = await loadGroupByCode(c.env.DB, DEMO_GROUP_CODE)
  if (!group) return jsonError('Demo group missing', 500, 'backend_unavailable')
  const joined = Boolean(findMemberByWallet(group, nimiq, eth)?.claimed)
  const demo: DemoInfo = { id: group.id, code: group.code, name: group.name, joined }
  return c.json({ demo, group: joined ? group : { ...group, payments: group.payments, expenses: group.expenses } })
})

app.get('/api/groups', async (c) => {
  const nimiq = c.req.query('nimiq') ? normalizeNimiqAddress(c.req.query('nimiq') ?? '') : null
  const eth = c.req.query('eth') ? normalizeEthAddress(c.req.query('eth') ?? '') : null
  if (!nimiq && !eth) return c.json({ groups: [] as GroupSummary[] })

  const clauses: string[] = []
  const params: string[] = []
  if (nimiq) {
    clauses.push('nimiq_address = ?')
    params.push(nimiq)
  }
  if (eth) {
    clauses.push('eth_address = ?')
    params.push(eth)
  }

  const memberRows = (await c.env.DB.prepare(
    `SELECT * FROM members WHERE claimed = 1 AND (${clauses.join(' OR ')})`,
  ).bind(...params).all<MemberRow>()).results

  const seen = new Set<string>()
  const summaries: GroupSummary[] = []
  for (const row of memberRows) {
    if (seen.has(row.group_id)) continue
    seen.add(row.group_id)
    const group = await loadGroup(c.env.DB, row.group_id)
    if (!group) continue
    summaries.push(summarize(group, row.id))
  }

  summaries.sort((a, b) => b.createdAt - a.createdAt)
  return c.json({ groups: summaries })
})

app.get('/api/groups/:id', async (c) => {
  const group = await loadGroup(c.env.DB, c.req.param('id'))
  if (!group) return jsonError('Group not found', 404, 'not_found')
  return c.json({ group })
})

app.get('/api/groups/code/:code', async (c) => {
  const code = c.req.param('code').trim().toUpperCase()
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return jsonError('Invalid group code', 400, 'invalid_code')
  const group = await loadGroupByCode(c.env.DB, code)
  if (!group) return jsonError('Invalid group code', 404, 'invalid_code')
  return c.json({
    group: {
      id: group.id,
      code: group.code,
      name: group.name,
      memberCount: group.members.filter((member) => member.claimed).length,
      createdAt: group.createdAt,
    },
  })
})

app.post('/api/groups', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return jsonError('Invalid JSON')
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  if (name.length < 2 || name.length > 48) return jsonError('Group name must be 2–48 characters')
  if (displayName.length < 1 || displayName.length > 32) return jsonError('Display name is required')

  let nimiq: string | null
  let eth: string | null
  try {
    nimiq = normalizeOptionalNimiq(body.nimiqAddress)
    eth = normalizeOptionalEth(body.ethAddress)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invalid address')
  }
  if (!nimiq && !eth) return jsonError('Connect a wallet before creating a group')

  const groupId = id('grp')
  const memberId = id('mem')
  const createdAt = now()
  const code = await uniqueCode(c.env.DB)

  await c.env.DB.prepare(
    'INSERT INTO groups (id, code, name, created_at, created_by) VALUES (?, ?, ?, ?, ?)',
  ).bind(groupId, code, name, createdAt, memberId).run()

  await c.env.DB.prepare(
    'INSERT INTO members (id, group_id, display_name, nimiq_address, eth_address, is_demo, claimed, created_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?)',
  ).bind(memberId, groupId, displayName, nimiq, eth, createdAt).run()

  const group = await loadGroup(c.env.DB, groupId)
  return c.json({ group }, 201)
})

app.post('/api/groups/code/:code/join', async (c) => {
  const code = c.req.param('code').trim().toUpperCase()
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return jsonError('Invalid group code', 400, 'invalid_code')

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return jsonError('Invalid JSON')
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  if (displayName.length < 1 || displayName.length > 32) return jsonError('Display name is required')

  let nimiq: string | null
  let eth: string | null
  try {
    nimiq = normalizeOptionalNimiq(body.nimiqAddress)
    eth = normalizeOptionalEth(body.ethAddress)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invalid address')
  }
  if (!nimiq && !eth) return jsonError('Connect a wallet before joining a group')

  const group = await loadGroupByCode(c.env.DB, code)
  if (!group) return jsonError('Invalid group code', 404, 'invalid_code')

  const existing = findMemberByWallet(group, nimiq, eth)
  if (existing?.claimed) {
    if (displayName && displayName !== existing.displayName) {
      await c.env.DB.prepare(
        'UPDATE members SET display_name = ?, nimiq_address = COALESCE(?, nimiq_address), eth_address = COALESCE(?, eth_address) WHERE id = ?',
      ).bind(displayName, nimiq, eth, existing.id).run()
    }
    const refreshed = await loadGroup(c.env.DB, group.id)
    return c.json({ group: refreshed, memberId: existing.id })
  }

  const unclaimed = group.members.find((member) => !member.claimed)
  const createdAt = now()

  if (unclaimed) {
    await c.env.DB.prepare(
      'UPDATE members SET display_name = ?, nimiq_address = ?, eth_address = ?, claimed = 1 WHERE id = ?',
    ).bind(displayName, nimiq, eth, unclaimed.id).run()
    const refreshed = await loadGroup(c.env.DB, group.id)
    return c.json({ group: refreshed, memberId: unclaimed.id })
  }

  const memberId = id('mem')
  await c.env.DB.prepare(
    'INSERT INTO members (id, group_id, display_name, nimiq_address, eth_address, is_demo, claimed, created_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?)',
  ).bind(memberId, group.id, displayName, nimiq, eth, createdAt).run()

  const refreshed = await loadGroup(c.env.DB, group.id)
  return c.json({ group: refreshed, memberId }, 201)
})

app.post('/api/groups/:id/expenses', async (c) => {
  const group = await loadGroup(c.env.DB, c.req.param('id'))
  if (!group) return jsonError('Group not found', 404, 'not_found')

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return jsonError('Invalid JSON')
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const currency = body.currency
  const payerId = typeof body.payerId === 'string' ? body.payerId : ''
  const splitType = body.splitType === 'custom' ? 'custom' : 'equal'
  const participantIds = Array.isArray(body.participantIds) ? body.participantIds.filter((value): value is string => typeof value === 'string') : []

  if (title.length < 1 || title.length > 64) return jsonError('Expense title is required')
  if (currency !== 'NIM' && currency !== 'USDT') return jsonError('Currency must be NIM or USDT')
  if (!group.members.some((member) => member.id === payerId)) return jsonError('Payer must be a group member')
  if (participantIds.length < 1) return jsonError('Select at least one participant')
  if (participantIds.some((memberId) => !group.members.some((member) => member.id === memberId))) {
    return jsonError('Every participant must be a group member')
  }

  let total: bigint
  try {
    total = parseToMinor(String(body.amount ?? ''), currency)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invalid amount')
  }
  if (total <= 0n) return jsonError('Amount must be greater than zero')

  let shares: { memberId: string; amount: bigint }[]
  if (splitType === 'equal') {
    const amounts = splitEqual(total, participantIds.length)
    shares = participantIds.map((memberId, index) => ({ memberId, amount: amounts[index] }))
  } else {
    const custom = Array.isArray(body.customSplits) ? body.customSplits : []
    shares = []
    for (const memberId of participantIds) {
      const row = custom.find((item) => item && typeof item === 'object' && (item as { memberId?: string }).memberId === memberId) as { amount?: string } | undefined
      try {
        const amount = parseToMinor(String(row?.amount ?? ''), currency)
        if (amount < 0n) return jsonError('Split amounts cannot be negative')
        shares.push({ memberId, amount })
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : 'Invalid split amount')
      }
    }
    if (sumMinor(shares.map((share) => share.amount)) !== total) {
      return jsonError('Custom splits must add up to the total')
    }
  }

  const expenseId = id('exp')
  const createdAt = now()
  await c.env.DB.prepare(
    'INSERT INTO expenses (id, group_id, title, amount_minor, currency, payer_id, split_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(expenseId, group.id, title, total.toString(), currency, payerId, splitType, createdAt).run()

  const splitInsert = c.env.DB.prepare(
    'INSERT INTO splits (id, expense_id, member_id, amount_minor) VALUES (?, ?, ?, ?)',
  )
  for (const share of shares) {
    await splitInsert.bind(id('spl'), expenseId, share.memberId, share.amount.toString()).run()
  }

  const refreshed = await loadGroup(c.env.DB, group.id)
  const expense = refreshed?.expenses.find((item) => item.id === expenseId)
  return c.json({ group: refreshed, expense }, 201)
})

app.post('/api/groups/:id/payments', async (c) => {
  const group = await loadGroup(c.env.DB, c.req.param('id'))
  if (!group) return jsonError('Group not found', 404, 'not_found')

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return jsonError('Invalid JSON')
  }

  const fromMemberId = typeof body.fromMemberId === 'string' ? body.fromMemberId : ''
  const toMemberId = typeof body.toMemberId === 'string' ? body.toMemberId : ''
  const currency = body.currency
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : ''
  const network = body.network === 'polygon' || body.network === 'nimiq' ? body.network : null
  const status = body.status === 'submitted' || body.status === 'pending' ? body.status : 'pending'
  const txHash = typeof body.txHash === 'string' && body.txHash.trim() ? body.txHash.trim() : null

  if (!group.members.some((member) => member.id === fromMemberId)) return jsonError('Payer is not in this group')
  if (!group.members.some((member) => member.id === toMemberId)) return jsonError('Recipient is not in this group')
  if (fromMemberId === toMemberId) return jsonError('Cannot pay yourself')
  if (currency !== 'NIM' && currency !== 'USDT') return jsonError('Currency must be NIM or USDT')
  if (!idempotencyKey) return jsonError('Missing payment key')
  if (status === 'submitted' && !txHash) return jsonError('A transaction hash is required to mark a payment as submitted')

  let amount: bigint
  try {
    amount = BigInt(String(body.amountMinor ?? ''))
  } catch {
    return jsonError('Invalid amount')
  }
  if (amount <= 0n) return jsonError('Amount must be greater than zero')

  const existingKey = await c.env.DB.prepare(
    'SELECT * FROM payments WHERE idempotency_key = ?',
  ).bind(idempotencyKey).first<PaymentRow>()
  if (existingKey) {
    return c.json({ payment: mapPayment(existingKey), group })
  }

  if (txHash) {
    const existingHash = await c.env.DB.prepare(
      'SELECT * FROM payments WHERE tx_hash = ?',
    ).bind(txHash).first<PaymentRow>()
    if (existingHash) {
      return jsonError('This transaction was already recorded', 409, 'duplicate_payment')
    }
  }

  const net = netsForCurrency(group.members, group.expenses, group.payments, currency)
  const debts = pairwiseDebts(net, currency)
  const owed = debts.find((debt) => debt.fromMemberId === fromMemberId && debt.toMemberId === toMemberId)
  if (!owed || owed.amountMinor < amount) {
    return jsonError('No outstanding balance to pay', 409, 'duplicate_payment')
  }

  const inFlight = group.payments.find(
    (payment) =>
      payment.fromMemberId === fromMemberId &&
      payment.toMemberId === toMemberId &&
      payment.currency === currency &&
      payment.status === 'pending',
  )
  if (inFlight && status === 'pending') {
    return c.json({ payment: inFlight, group })
  }

  const paymentId = id('pay')
  const createdAt = now()
  await c.env.DB.prepare(
    `INSERT INTO payments (
      id, group_id, from_member_id, to_member_id, amount_minor, currency, status, tx_hash, network, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    paymentId,
    group.id,
    fromMemberId,
    toMemberId,
    amount.toString(),
    currency,
    status,
    txHash,
    network,
    idempotencyKey,
    createdAt,
    createdAt,
  ).run()

  const refreshed = await loadGroup(c.env.DB, group.id)
  const payment = refreshed?.payments.find((item) => item.id === paymentId)
  return c.json({ payment, group: refreshed }, 201)
})

app.patch('/api/groups/:id/payments/:paymentId', async (c) => {
  const group = await loadGroup(c.env.DB, c.req.param('id'))
  if (!group) return jsonError('Group not found', 404, 'not_found')

  const payment = group.payments.find((item) => item.id === c.req.param('paymentId'))
  if (!payment) return jsonError('Payment not found', 404, 'not_found')

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return jsonError('Invalid JSON')
  }

  const status = body.status
  if (status !== 'pending' && status !== 'submitted' && status !== 'confirmed' && status !== 'failed' && status !== 'rejected') {
    return jsonError('Invalid payment status')
  }

  if (READY_STATUSES.has(payment.status) && (status === 'failed' || status === 'rejected' || status === 'pending')) {
    return jsonError('Settled payments cannot be reversed', 409, 'duplicate_payment')
  }

  const txHash = typeof body.txHash === 'string' && body.txHash.trim() ? body.txHash.trim() : payment.txHash
  const network = body.network === 'polygon' || body.network === 'nimiq' ? body.network : payment.network

  if ((status === 'submitted' || status === 'confirmed') && !txHash) {
    return jsonError('A transaction hash is required before this payment can be marked settled')
  }

  if (txHash && txHash !== payment.txHash) {
    const existingHash = await c.env.DB.prepare(
      'SELECT id FROM payments WHERE tx_hash = ? AND id != ?',
    ).bind(txHash, payment.id).first()
    if (existingHash) return jsonError('This transaction was already recorded', 409, 'duplicate_payment')
  }

  if (READY_STATUSES.has(payment.status) && !RETRYABLE.has(status as PaymentStatus)) {
    const refreshed = await loadGroup(c.env.DB, group.id)
    return c.json({ payment, group: refreshed })
  }

  await c.env.DB.prepare(
    'UPDATE payments SET status = ?, tx_hash = ?, network = ?, updated_at = ? WHERE id = ?',
  ).bind(status, txHash, network, now(), payment.id).run()

  const refreshed = await loadGroup(c.env.DB, group.id)
  const updated = refreshed?.payments.find((item) => item.id === payment.id)
  return c.json({ payment: updated, group: refreshed })
})

app.patch('/api/groups/:id/members/me', async (c) => {
  const group = await loadGroup(c.env.DB, c.req.param('id'))
  if (!group) return jsonError('Group not found', 404, 'not_found')

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return jsonError('Invalid JSON')
  }

  let nimiq: string | null
  let eth: string | null
  try {
    nimiq = normalizeOptionalNimiq(body.nimiqAddress)
    eth = normalizeOptionalEth(body.ethAddress)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invalid address')
  }

  const member = findMemberByWallet(group, nimiq, eth)
  if (!member) return jsonError('Member not found', 404, 'not_found')

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : member.displayName
  if (displayName.length < 1 || displayName.length > 32) return jsonError('Display name is required')

  await c.env.DB.prepare(
    'UPDATE members SET display_name = ?, nimiq_address = COALESCE(?, nimiq_address), eth_address = COALESCE(?, eth_address) WHERE id = ?',
  ).bind(displayName, nimiq, eth, member.id).run()

  const refreshed = await loadGroup(c.env.DB, group.id)
  return c.json({ group: refreshed })
})

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return jsonError('Not found', 404, 'not_found')
  return jsonError('Not found', 404, 'not_found')
})

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'Backend unavailable', code: 'backend_unavailable' }, 503)
})

export default app
