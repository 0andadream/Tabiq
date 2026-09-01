const NIM_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'

function ibanCheck(value: string): number {
  const numbered = value
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0)
      return code >= 65 ? String(code - 55) : char
    })
    .join('')

  let tmp = ''
  for (let i = 0; i < Math.ceil(numbered.length / 6); i += 1) {
    tmp = String(Number(tmp + numbered.substr(i * 6, 6)) % 97)
  }
  return Number(tmp)
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += NIM_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += NIM_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

export function toUserFriendlyAddress(bytes: Uint8Array): string {
  if (bytes.length !== 20) {
    throw new Error('Nimiq address must be 20 bytes')
  }
  const payload = base32Encode(bytes)
  const checksum = `00${98 - ibanCheck(`${payload}NQ00`)}`.slice(-2)
  const compact = `NQ${checksum}${payload}`
  return compact.replace(/(.{4})/g, '$1 ').trim()
}

export function normalizeNimiqAddress(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

export function formatNimiqAddress(input: string): string {
  const compact = normalizeNimiqAddress(input)
  return compact.replace(/(.{4})/g, '$1 ').trim()
}

export function isValidNimiqAddress(input: string): boolean {
  const compact = normalizeNimiqAddress(input)
  if (!/^NQ\d{2}[0-9A-Z]{32}$/.test(compact)) return false
  const payload = compact.slice(4)
  if ([...payload].some((char) => !NIM_ALPHABET.includes(char))) return false
  return ibanCheck(`${payload}NQ${compact.slice(2, 4)}`) === 1
}

export function shortenNimiqAddress(input: string): string {
  const formatted = formatNimiqAddress(input)
  if (formatted.length < 12) return formatted
  return `${formatted.slice(0, 11)}…${formatted.slice(-4)}`
}

export function normalizeEthAddress(input: string): string {
  return input.trim().toLowerCase()
}

export function isValidEthAddress(input: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(input.trim())
}

export function shortenEthAddress(input: string): string {
  const value = input.trim()
  if (value.length < 12) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export async function addressFromLabel(label: string): Promise<{
  nimiq: string
  eth: string
}> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`tabiq-demo:${label}`),
  )
  const bytes = new Uint8Array(digest)
  const nimiq = toUserFriendlyAddress(bytes.slice(0, 20))
  const ethBytes = bytes.slice(0, 20)
  const eth = `0x${[...ethBytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
  return { nimiq, eth }
}
