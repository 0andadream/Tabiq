export type AppErrorCode =
  | 'wallet_unavailable'
  | 'wallet_disconnected'
  | 'tx_rejected'
  | 'tx_failed'
  | 'insufficient_balance'
  | 'wrong_network'
  | 'tx_pending'
  | 'backend_unavailable'
  | 'invalid_code'
  | 'expired_qr'
  | 'duplicate_payment'
  | 'not_found'
  | 'bad_request'
  | 'unknown'

export class AppError extends Error {
  code: AppErrorCode
  retryable: boolean

  constructor(code: AppErrorCode, message: string, retryable = true) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.retryable = retryable
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function toErrorMessage(error: unknown): string {
  if (isAppError(error)) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Try again.'
}

export function classifyWalletError(error: unknown): AppError {
  const text = error instanceof Error ? error.message : String(error)
  const lower = text.toLowerCase()
  const code =
    typeof error === 'object' && error && 'code' in error
      ? Number((error as { code?: number }).code)
      : undefined

  if (code === 4001 || /reject|denied|cancel|permission_denied/.test(lower)) {
    return new AppError('tx_rejected', 'Payment was rejected in the wallet.', true)
  }
  if (code === 4902 || /unrecognized chain|wrong network|chain/.test(lower)) {
    return new AppError('wrong_network', 'Switch to Polygon to pay with USDT.', true)
  }
  if (/insufficient|balance/.test(lower)) {
    return new AppError('insufficient_balance', 'Not enough balance to complete this payment.', true)
  }
  if (/timeout|timed out|not detected|not running|inject/.test(lower)) {
    return new AppError(
      'wallet_unavailable',
      'Nimiq Pay wallet is not available. Open Nimsplit inside Nimiq Pay.',
      true,
    )
  }
  if (/network/.test(lower)) {
    return new AppError('tx_failed', 'Network error while sending the payment. You can retry.', true)
  }
  return new AppError('tx_failed', text || 'Payment failed. You can retry.', true)
}
