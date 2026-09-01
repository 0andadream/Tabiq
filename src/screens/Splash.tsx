import { useNavigate } from 'react-router-dom'
import { Button, Logo } from '../components/ui.tsx'

function PhoneMock() {
  return (
    <div className="pointer-events-none w-[280px] rounded-[36px] border border-line bg-surface p-[10px] shadow-none">
      <div className="rounded-[28px] bg-bg px-5 pt-6 pb-8">
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-semibold tracking-[-0.04em]">Nimsplit</div>
          <div className="h-7 px-2.5 rounded-full border border-line text-[11px] text-muted grid place-items-center">
            Wallet
          </div>
        </div>
        <div className="mt-10 text-[13px] text-muted">You owe</div>
        <div className="mt-2 num text-[52px] leading-none text-danger">10.00</div>
        <div className="mt-2 text-[12px] font-medium tracking-[0.08em] text-danger/70">NIM</div>
        <div className="mt-8 h-[48px] rounded-full bg-gold grid place-items-center text-[14px] font-semibold text-[#14110a]">
          Pay now
        </div>
      </div>
    </div>
  )
}

export function Splash() {
  const nav = useNavigate()

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      <div className="absolute inset-x-0 bottom-[-48px] flex justify-center opacity-40">
        <PhoneMock />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #07070A 0%, #07070A 38%, rgba(7,7,10,0.55) 62%, #07070A 100%)',
        }}
      />

      <div className="relative z-10 min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <Logo size="lg" />
        <p className="mt-4 text-[16px] text-ink/80">Split the bill. Settle in NIM.</p>
        <Button className="mt-10 w-full max-w-[280px]" onClick={() => nav('/app')}>
          Open app
        </Button>
        <p className="mt-5 text-[12px] text-muted">Feeless NIM settlement inside Nimiq Pay</p>
      </div>
    </div>
  )
}
