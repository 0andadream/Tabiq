import type { Currency, PaymentStatus } from '@shared/types.ts'
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { initials, moneyNumber } from '../lib/format.ts'

export function Logo({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <div
      className={
        size === 'lg'
          ? 'text-[44px] font-semibold tracking-[-0.06em] leading-none'
          : 'text-[20px] font-semibold tracking-[-0.04em]'
      }
    >
      Nimsplit
    </div>
  )
}

export function WalletChip({
  label,
  onClick,
}: {
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 px-3 rounded-full bg-surface border border-line text-[12px] text-muted tracking-[-0.01em] active:scale-[0.97] transition-transform"
    >
      {label}
    </button>
  )
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  const styles = {
    primary: 'bg-gold text-[#14110a] font-semibold',
    secondary: 'bg-transparent text-ink border border-line font-medium',
    ghost: 'bg-transparent text-ink font-medium',
    danger: 'bg-danger/15 text-danger font-medium',
  }[variant]
  return (
    <button
      className={`h-[52px] px-5 text-[15px] rounded-full disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.97] transition-transform ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-[12px] text-muted">{label}</div>
      {children}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-[52px] w-full rounded-[20px] bg-card border border-line px-4 text-[16px] text-ink outline-none focus:border-gold/50 placeholder:text-muted/60 ${props.className ?? ''}`}
    />
  )
}

export function Amount({
  value,
  currency,
  tone = 'default',
  size = 'lg',
  countUp = false,
}: {
  value: bigint | string
  currency: Currency
  tone?: 'owe' | 'owed' | 'default' | 'ok'
  size?: 'sm' | 'lg' | 'xl'
  countUp?: boolean
}) {
  const target = Number(moneyNumber(value, currency))
  const [shown, setShown] = useState(countUp ? 0 : target)

  useEffect(() => {
    if (!countUp) {
      setShown(target)
      return
    }
    const start = performance.now()
    if (target <= 0) {
      setShown(0)
      return
    }
    const from = 0
    const duration = 700
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - p) ** 3
      setShown(from + (target - from) * eased)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [countUp, target])

  const color = {
    owe: 'text-danger',
    owed: 'text-ok',
    ok: 'text-ok',
    default: 'text-ink',
  }[tone]
  const num = {
    sm: 'text-[28px]',
    lg: 'text-[48px]',
    xl: 'text-[56px]',
  }[size]

  return (
    <div className={`${color}`}>
      <div className={`num leading-none ${num}`}>{shown.toFixed(2)}</div>
      <div className="mt-2 text-[13px] font-medium tracking-[0.08em] text-current/70">{currency}</div>
    </div>
  )
}

export function Avatar({ name, dim = false }: { name: string; dim?: boolean }) {
  return (
    <div
      className={`h-10 w-10 rounded-full grid place-items-center text-[12px] font-semibold tracking-wide shrink-0 ${
        dim ? 'bg-white/5 text-muted' : 'bg-[#3a3018] text-gold'
      }`}
    >
      {initials(name)}
    </div>
  )
}

export function StatusMark({ status }: { status: PaymentStatus | 'unpaid' | 'settled' }) {
  const map: Record<string, { label: string; className: string }> = {
    unpaid: { label: 'Unpaid', className: 'text-danger' },
    pending: { label: 'Pending', className: 'text-gold' },
    submitted: { label: 'Settled', className: 'text-ok' },
    confirmed: { label: 'Settled', className: 'text-ok' },
    settled: { label: 'Settled', className: 'text-ok' },
    failed: { label: 'Failed', className: 'text-danger' },
    rejected: { label: 'Rejected', className: 'text-danger' },
  }
  const item = map[status] ?? map.unpaid
  return <span className={`text-[12px] font-medium ${item.className}`}>{item.label}</span>
}

export function StatusPill(props: { status: PaymentStatus | 'unpaid' | 'settled' }) {
  return <StatusMark {...props} />
}

export function Notice({
  tone = 'muted',
  children,
  action,
}: {
  tone?: 'warn' | 'danger' | 'ok' | 'muted'
  children: ReactNode
  action?: ReactNode
}) {
  const color = {
    warn: 'text-gold',
    danger: 'text-danger',
    ok: 'text-ok',
    muted: 'text-muted',
  }[tone]
  return (
    <div className={`text-[13px] leading-relaxed ${color}`}>
      <div className="flex items-start justify-between gap-3">
        <div>{children}</div>
        {action}
      </div>
    </div>
  )
}

export function Banner(props: {
  tone?: 'warn' | 'danger' | 'ok' | 'muted'
  children: ReactNode
  action?: ReactNode
}) {
  return <Notice {...props} />
}

export function ScreenHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string
  subtitle?: string
  back?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="mb-8 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {back}
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.04em] truncate">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  )
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-10 w-10 rounded-full bg-surface border border-line grid place-items-center text-ink active:scale-[0.97] transition-transform"
      aria-label="Back"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className="flex p-1 rounded-full bg-surface border border-line">
      {options.map((option) => (
        <button
          key={option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`flex-1 h-10 rounded-full text-[14px] font-medium transition-colors ${
            value === option.value ? 'bg-card text-ink' : 'text-muted'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/55" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-[430px] max-h-[92dvh] overflow-y-auto rounded-t-[28px] bg-surface border-t border-line px-5 pt-3 pb-[calc(24px+var(--safe-bottom))]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold tracking-[-0.03em]">{title}</h2>
          <button onClick={onClose} className="text-[13px] text-muted">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
