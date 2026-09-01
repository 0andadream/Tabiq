import { init, type NimiqProvider } from '@nimiq/mini-app-sdk'
import type { ErrorResponse } from '@nimiq/mini-app-sdk'
import { formatNimiqAddress, isValidNimiqAddress } from '@shared/address.ts'
import { AppError, classifyWalletError } from './errors.ts'

let providerPromise: Promise<NimiqProvider> | null = null

function isErrorResponse(value: unknown): value is ErrorResponse {
  return Boolean(value && typeof value === 'object' && 'error' in value)
}

export function extractProviderError(value: unknown): string | null {
  if (isErrorResponse(value)) {
    return value.error.message || value.error.type || 'Wallet request failed'
  }
  return null
}

export async function getNimiqProvider(): Promise<NimiqProvider> {
  if (!providerPromise) {
    providerPromise = init({ timeout: 10_000 })
  }
  try {
    return await providerPromise
  } catch (error) {
    providerPromise = null
    throw classifyWalletError(error)
  }
}

export async function listNimiqAccounts(): Promise<string[]> {
  const nimiq = await getNimiqProvider()
  const result = await nimiq.listAccounts()
  const message = extractProviderError(result)
  if (message) throw new AppError('wallet_disconnected', message, true)
  if (!Array.isArray(result) || result.length === 0) {
    throw new AppError('wallet_disconnected', 'No Nimiq account is available in this wallet.', true)
  }
  return result.filter((address) => isValidNimiqAddress(address)).map(formatNimiqAddress)
}

export function extractTxReference(result: unknown): string | null {
  const error = extractProviderError(result)
  if (error) return null
  if (typeof result === 'string' && result.trim()) return result.trim()
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>
    if (typeof record.hash === 'string' && record.hash.trim()) return record.hash.trim()
    if (typeof record.serializedTx === 'string' && record.serializedTx.trim()) {
      return record.serializedTx.trim()
    }
  }
  return null
}

export async function sendNim(input: {
  recipient: string
  valueLuna: number
  memo: string
}): Promise<string> {
  if (!Number.isInteger(input.valueLuna) || input.valueLuna <= 0) {
    throw new AppError('bad_request', 'Invalid NIM amount.', false)
  }

  const nimiq = await getNimiqProvider()
  const recipient = formatNimiqAddress(input.recipient)
  const data = input.memo.slice(0, 64)

  try {
    const consensus = await nimiq.isConsensusEstablished()
    if (consensus === false) {
      throw new AppError(
        'tx_pending',
        'Nimiq Pay is still connecting to the network. Wait a moment and retry.',
        true,
      )
    }

    const result = data
      ? await nimiq.sendBasicTransactionWithData({
          recipient,
          value: input.valueLuna,
          data,
        })
      : await nimiq.sendBasicTransaction({
          recipient,
          value: input.valueLuna,
        })

    const error = extractProviderError(result)
    if (error) throw classifyWalletError(new Error(error))

    const txRef = extractTxReference(result)
    if (!txRef) {
      throw new AppError(
        'tx_failed',
        'The wallet did not return a transaction id. The payment was not marked as settled.',
        true,
      )
    }
    return txRef
  } catch (error) {
    if (error instanceof AppError) throw error
    throw classifyWalletError(error)
  }
}

export function nimiqExplorerUrl(txRef: string): string | null {
  if (/^[0-9a-fA-F]{64}$/.test(txRef)) {
    return `https://v2.nimiqwatch.com/tx/${txRef}`
  }
  return null
}
