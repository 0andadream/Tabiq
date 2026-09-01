import type { Group, Member } from '@shared/types.ts'
import { normalizeEthAddress, normalizeNimiqAddress } from '@shared/address.ts'

export function findMe(
  group: Group,
  nimiqAddress: string | null,
  ethAddress: string | null,
): Member | undefined {
  const nimiq = nimiqAddress ? normalizeNimiqAddress(nimiqAddress) : null
  const eth = ethAddress ? normalizeEthAddress(ethAddress) : null
  return group.members.find((member) => {
    if (nimiq && member.nimiqAddress && normalizeNimiqAddress(member.nimiqAddress) === nimiq) return true
    if (eth && member.ethAddress && member.ethAddress === eth) return true
    return false
  })
}

export function displayNameOrYou(name: string): string {
  const trimmed = name.trim()
  return trimmed || 'You'
}
