import { isValidEthAddress, normalizeEthAddress } from '@shared/address.ts'
import { AppError, classifyWalletError } from './errors.ts'

export const POLYGON_CHAIN_ID = '0x89'
export const POLYGON_CHAIN_ID_DECIMAL = 137
export const USDT_POLYGON = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
export const USDT_DECIMALS = 6

export const POLYGON_CHAIN = {
  chainId: POLYGON_CHAIN_ID,
  chainName: 'Polygon Mainnet',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: ['https://polygon-rpc.com'],
  blockExplorerUrls: ['https://polygonscan.com'],
}

function getProvider(): EthereumProvider {
  if (!window.ethereum) {
    throw new AppError(
      'wallet_unavailable',
      'Ethereum wallet is not available. Open Nimsplit inside Nimiq Pay to pay with USDT.',
      true,
    )
  }
  return window.ethereum
}

function pad32(hex: string): string {
  return hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

export function encodeTransfer(to: string, amountMinor: bigint): string {
  const selector = 'a9059cbb'
  const address = pad32(to)
  const value = pad32(amountMinor.toString(16))
  return `0x${selector}${address}${value}`
}

export function encodeBalanceOf(owner: string): string {
  return `0x70a08231${pad32(owner)}`
}

export async function requestEthAccounts(): Promise<string[]> {
  const provider = getProvider()
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' })
    if (!Array.isArray(accounts)) {
      throw new AppError('wallet_disconnected', 'No Ethereum account is connected.', true)
    }
    return accounts.filter((value): value is string => typeof value === 'string' && isValidEthAddress(value)).map(normalizeEthAddress)
  } catch (error) {
    throw classifyWalletError(error)
  }
}

export async function getChainId(): Promise<string> {
  const provider = getProvider()
  const chainId = await provider.request({ method: 'eth_chainId' })
  return String(chainId).toLowerCase()
}

export function isPolygon(chainId: string): boolean {
  return chainId === POLYGON_CHAIN_ID || Number.parseInt(chainId, 16) === POLYGON_CHAIN_ID_DECIMAL
}

export async function ensurePolygon(): Promise<void> {
  const provider = getProvider()
  const current = await getChainId()
  if (isPolygon(current)) return

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_CHAIN_ID }],
    })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? Number((error as { code?: number }).code) : undefined
    if (code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [POLYGON_CHAIN],
        })
      } catch (addError) {
        throw classifyWalletError(addError)
      }
      return
    }
    throw new AppError('wrong_network', 'Switch to Polygon to pay with USDT.', true)
  }

  const after = await getChainId()
  if (!isPolygon(after)) {
    throw new AppError('wrong_network', 'Switch to Polygon to pay with USDT.', true)
  }
}

export async function getUsdtBalance(owner: string): Promise<bigint> {
  const provider = getProvider()
  const result = await provider.request({
    method: 'eth_call',
    params: [
      {
        to: USDT_POLYGON,
        data: encodeBalanceOf(owner),
      },
      'latest',
    ],
  })
  if (typeof result !== 'string' || result === '0x') return 0n
  return BigInt(result)
}

export async function sendUsdt(input: {
  from: string
  to: string
  amountMinor: bigint
}): Promise<string> {
  const provider = getProvider()
  await ensurePolygon()

  const balance = await getUsdtBalance(input.from)
  if (balance < input.amountMinor) {
    throw new AppError('insufficient_balance', 'Not enough USDT on Polygon to complete this payment.', true)
  }

  try {
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: input.from,
          to: USDT_POLYGON,
          data: encodeTransfer(input.to, input.amountMinor),
          value: '0x0',
        },
      ],
    })
    if (typeof hash !== 'string' || !hash.startsWith('0x')) {
      throw new AppError(
        'tx_failed',
        'The wallet did not return a transaction hash. The payment was not marked as settled.',
        true,
      )
    }
    return hash
  } catch (error) {
    throw classifyWalletError(error)
  }
}

export async function getTransactionReceipt(hash: string): Promise<{ status?: string } | null> {
  const provider = getProvider()
  const receipt = await provider.request({
    method: 'eth_getTransactionReceipt',
    params: [hash],
  })
  if (!receipt || typeof receipt !== 'object') return null
  return receipt as { status?: string }
}

export function polygonExplorerUrl(hash: string): string {
  return `https://polygonscan.com/tx/${hash}`
}
