import { getHostLanguage } from '@nimiq/mini-app-sdk'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppError, classifyWalletError, toErrorMessage } from '../lib/errors.ts'
import { requestEthAccounts } from '../lib/ethereum.ts'
import { listNimiqAccounts } from '../lib/nimiq.ts'
import { loadPreferences, savePreferences, type Preferences } from '../lib/storage.ts'

type WalletStatus = 'connecting' | 'connected' | 'unavailable' | 'disconnected' | 'error'

type WalletContextValue = {
  status: WalletStatus
  nimiqAddress: string | null
  ethAddress: string | null
  error: string | null
  insideNimiqPay: boolean
  language: string
  prefs: Preferences
  connect: () => Promise<void>
  connectEthereum: () => Promise<string>
  setDisplayName: (name: string) => void
  setDefaultCurrency: (currency: Preferences['defaultCurrency']) => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('connecting')
  const [nimiqAddress, setNimiqAddress] = useState<string | null>(null)
  const [ethAddress, setEthAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [insideNimiqPay, setInsideNimiqPay] = useState(false)
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences())

  const persistPrefs = useCallback((next: Preferences) => {
    setPrefs(next)
    savePreferences(next)
  }, [])

  const connect = useCallback(async () => {
    setStatus('connecting')
    setError(null)
    try {
      const accounts = await listNimiqAccounts()
      setNimiqAddress(accounts[0])
      setInsideNimiqPay(true)
      setStatus('connected')
      setPrefs((current) => {
        if (current.displayName) return current
        const next = { ...current, displayName: 'You' }
        savePreferences(next)
        return next
      })
    } catch (err) {
      const appError = err instanceof AppError ? err : classifyWalletError(err)
      setNimiqAddress(null)
      setError(appError.message)
      setStatus(appError.code === 'wallet_unavailable' ? 'unavailable' : 'error')
    }
  }, [])

  const connectEthereum = useCallback(async () => {
    try {
      const accounts = await requestEthAccounts()
      if (!accounts[0]) throw new AppError('wallet_disconnected', 'No Ethereum account connected.', true)
      setEthAddress(accounts[0])
      setStatus((current) => (current === 'connected' ? current : 'connected'))
      return accounts[0]
    } catch (err) {
      setError(toErrorMessage(err))
      throw err
    }
  }, [])

  useEffect(() => {
    void connect()
  }, [connect])

  const value = useMemo<WalletContextValue>(() => ({
    status,
    nimiqAddress,
    ethAddress,
    error,
    insideNimiqPay,
    language: getHostLanguage() ?? navigator.language.split('-')[0] ?? 'en',
    prefs,
    connect,
    connectEthereum,
    setDisplayName: (displayName) => persistPrefs({ ...prefs, displayName }),
    setDefaultCurrency: (defaultCurrency) => persistPrefs({ ...prefs, defaultCurrency }),
  }), [status, nimiqAddress, ethAddress, error, insideNimiqPay, prefs, connect, connectEthereum, persistPrefs])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const value = useContext(WalletContext)
  if (!value) throw new Error('useWallet must be used within WalletProvider')
  return value
}
