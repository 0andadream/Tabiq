import { netsForCurrency, pairwiseDebts } from '@shared/balances.ts'
import type { DemoInfo, Group, GroupSummary } from '@shared/types.ts'

export const PREVIEW_GROUP_ID = 'grp_friday_preview'
export const PREVIEW_YOU_ID = 'mem_preview_you'
export const PREVIEW_ALEX_ID = 'mem_preview_alex'
export const PREVIEW_SARAH_ID = 'mem_preview_sarah'
export const PREVIEW_DAVID_ID = 'mem_preview_david'

const createdAt = Date.UTC(2026, 8, 1, 19, 0, 0)

function fridayDinner(): Group {
  return {
    id: PREVIEW_GROUP_ID,
    code: 'FRIDAY',
    name: 'Friday Dinner',
    createdAt,
    createdBy: PREVIEW_ALEX_ID,
    members: [
      {
        id: PREVIEW_YOU_ID,
        groupId: PREVIEW_GROUP_ID,
        displayName: 'You',
        nimiqAddress: null,
        ethAddress: null,
        isDemo: false,
        claimed: true,
        createdAt,
      },
      {
        id: PREVIEW_ALEX_ID,
        groupId: PREVIEW_GROUP_ID,
        displayName: 'Alex',
        nimiqAddress: 'NQ30 A7HU XB26 K9H2 QFHT MB58 A0G1 DEXQ CSG5',
        ethAddress: '0x51e3cf2c469a622c3e3baaca8502016bbd866a05',
        isDemo: true,
        claimed: true,
        createdAt,
      },
      {
        id: PREVIEW_SARAH_ID,
        groupId: PREVIEW_GROUP_ID,
        displayName: 'Sarah',
        nimiqAddress: 'NQ66 UX2A V530 GCN3 T34J RS1V S7M1 KASV AANY',
        ethAddress: '0xe784ae9460832c3d8c92ce83dd1ea19ab5d52adf',
        isDemo: true,
        claimed: true,
        createdAt,
      },
      {
        id: PREVIEW_DAVID_ID,
        groupId: PREVIEW_GROUP_ID,
        displayName: 'David',
        nimiqAddress: 'NQ73 106V L6VH J0Y9 141L XMRC 2NJS AJ8S PAB9',
        ethAddress: '0x080dda1bb1903e909034f572c15a5a5491aba969',
        isDemo: true,
        claimed: true,
        createdAt,
      },
    ],
    expenses: [
      {
        id: 'exp_preview_dinner',
        groupId: PREVIEW_GROUP_ID,
        title: 'Dinner',
        amountMinor: '4000000',
        currency: 'NIM',
        payerId: PREVIEW_ALEX_ID,
        splitType: 'equal',
        createdAt,
        splits: [
          { memberId: PREVIEW_YOU_ID, amountMinor: '1000000' },
          { memberId: PREVIEW_ALEX_ID, amountMinor: '1000000' },
          { memberId: PREVIEW_SARAH_ID, amountMinor: '1000000' },
          { memberId: PREVIEW_DAVID_ID, amountMinor: '1000000' },
        ],
      },
    ],
    payments: [],
  }
}

let previewGroup: Group = fridayDinner()
let previewEnabled = false

export function enablePreview() {
  previewEnabled = true
}

export function isPreview(): boolean {
  return previewEnabled
}

export function getPreviewGroup(): Group {
  return previewGroup
}

export function setPreviewGroup(group: Group) {
  previewGroup = group
}

export function resetPreviewGroup() {
  previewGroup = fridayDinner()
}

export function getPreviewDemo(): { demo: DemoInfo; group: Group } {
  enablePreview()
  return {
    demo: {
      id: previewGroup.id,
      code: previewGroup.code,
      name: previewGroup.name,
      joined: true,
    },
    group: previewGroup,
  }
}

export function getPreviewSummaries(): GroupSummary[] {
  enablePreview()
  const group = previewGroup
  const debts = pairwiseDebts(
    netsForCurrency(group.members, group.expenses, group.payments, 'NIM'),
    'NIM',
  )
  const mine = debts.filter((debt) => debt.fromMemberId === PREVIEW_YOU_ID)
  const owed = debts.filter((debt) => debt.toMemberId === PREVIEW_YOU_ID)
  return [
    {
      id: group.id,
      code: group.code,
      name: group.name,
      createdAt: group.createdAt,
      memberCount: group.members.filter((member) => member.claimed).length,
      youOwe: mine.map((debt) => ({ currency: debt.currency, amountMinor: debt.amountMinor.toString() })),
      youAreOwed: owed.map((debt) => ({ currency: debt.currency, amountMinor: debt.amountMinor.toString() })),
    },
  ]
}
