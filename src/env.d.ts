/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface EthereumRequestArguments {
  method: string
  params?: unknown[] | Record<string, unknown>
}

interface EthereumProvider {
  request: (args: EthereumRequestArguments) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

interface Window {
  ethereum?: EthereumProvider
}
