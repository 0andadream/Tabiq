import type { Currency, PaymentStatus } from '@shared/types.ts'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { initials, moneyNumber } from '../lib/format.ts'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" rx="8" stroke="#E2B13C" strokeOpacity="0.35" />
        <path d="M8 20V8h3.1l4.1 7.4V8H18v12h-3.1L10.8 12.7V20H8Z" fill="#E2B13C" />
      </svg>
      {!compact && (
        <div>
          <div className="text-[15px] font-semibold tracking-[0.18em] uppercase">Tabiq</div>
        </div>
      )}
    </div>
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
    primary: 'bg-gold text-[#16140d] font-semibold',
    secondary: 'bg-white/5 text-ink border border-white/10 font-medium',
    ghost: 'bg-transparent text-ink font-medium',
    danger: 'bg-danger/15 text-danger font-medium',
  }[variant]
  return (
    <button
      className={`h-12 px-5 rounded-2xl text-[15px] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-2 text-[12px] uppercase tracking-[0.16em] text-muted">{label}</div>
      {children}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-12 w-full rounded-2xl bg-white/[0.04] border border-white/10 px-4 text-[16px] text-ink outline-none focus:border-gold/50 placeholder:text-white/25 ${props.className ?? ''}`}
    />
  )
}

export function Amount({
  value,
  currency,
  tone = 'default',
  size = 'lg',
}: {
  value: bigint | string
  currency: Currency
  tone?: 'owe' | 'owed' | 'default' | 'ok'
  size?: 'sm' | 'lg' | 'xl'
}) {
  const color = {
    owe: 'text-gold',
    owed: 'text-ok',
    ok: 'text-ok',
    default: 'text-ink',
  }[tone]
  const num = {
    sm: 'text-[22px]',
    lg: 'text-[40px]',
    xl: 'text-[52px]',
  }[size]
  return (
    <div className={`num leading-none ${color} ${num}`}>
      {moneyNumber(value, currency)}
      <span className="ml-2 text-[0.42em] tracking-[0.12em] align-middle font-sans font-medium opacity-70">
        {currency}
      </span>
    </div>
  )
}

export function Avatar({ name, dim = false }: { name: string; dim?: boolean }) {
  return (
    <div
      className={`h-10 w-10 rounded-full grid place-items-center text-[12px] font-semibold tracking-wide ${
        dim ? 'bg-white/5 text-muted' : 'bg-gold/15 text-gold'
      }`}
    >
      {initials(name)}
    </div>
  )
}

export function StatusPill({ status }: { status: PaymentStatus | 'unpaid' | 'settled' }) {
  const map: Record<string, { label: string; className: string }> = {
    unpaid: { label: 'Unpaid', className: 'text-gold bg-gold/10' },
    pending: { label: 'Payment pending', className: 'text-gold bg-gold/10' },
    submitted: { label: 'Settled', className: 'text-ok bg-ok/10' },
    confirmed: { label: 'Settled', className: 'text-ok bg-ok/10' },
    settled: { label: 'Settled', className: 'text-ok bg-ok/10' },
    failed: { label: 'Payment failed', className: 'text-danger bg-danger/10' },
    rejected: { label: 'Payment rejected', className: 'text-danger bg-danger/10' },
  }
  const item = map[status] ?? map.unpaid
  return (
    <span className={`inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-medium ${item.className}`}>
      {item.label}
    </span>
  )
}

export function Banner({
  tone = 'warn',
  children,
  action,
}: {
  tone?: 'warn' | 'danger' | 'ok' | 'muted'
  children: ReactNode
  action?: ReactNode
}) {
  const color = {
    warn: 'border-gold/25 bg-gold/8 text-gold',
    danger: 'border-danger/30 bg-danger/10 text-danger',
    ok: 'border-ok/25 bg-ok/10 text-ok',
    muted: 'border-white/10 bg-white/[0.03] text-muted',
  }[tone]
  return (
    <div className={`rounded-2xl border px-4 py-3 text-[14px] leading-snug ${color}`}>
      <div className="flex items-start justify-between gap-3">
        <div>{children}</div>
        {action}
      </div>
    </div>
  )
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
    <header className="mb-6 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        {back}
        <div className="min-w-0">
          <h1 className="text-[22px] font-medium tracking-tight truncate">{title}</h1>
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
      className="mt-0.5 h-10 w-10 rounded-full border border-white/10 grid place-items-center text-ink/80"
      aria-label="Back"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export function BottomNav({
  active,
  onHome,
  onActivity,
  onSettings,
}: {
  active: 'home' | 'activity' | 'settings'
  onHome: () => void
  onActivity: () => void
  onSettings: () => void
}) {
  const item = (id: typeof active, label: string, path: ReactNode, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-[11px] tracking-[0.14em] uppercase ${active === id ? 'text-gold' : 'text-muted'}`}
    >
      <div className="grid place-items-center gap-1">
        {path}
        {label}
      </div>
    </button>
  )
  return (
    <nav className="sticky bottom-0 -mx-5 mt-6 border-t border-white/8 bg-[#070708]/95 backdrop-blur px-2 pt-2 pb-[max(10px,var(--safe-bottom))] flex">
      {item('home', 'Home', <span className="text-[16px]">▣</span>, onHome)}
      {item('activity', 'Activity', <span className="text-[16px]">≡</span>, onActivity)}
      {item('settings', 'Settings', <span className="text-[16px]">⚙</span>, onSettings)}
    </nav>
  )
}
