import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatNimiqAddress, shortenEthAddress } from '@shared/address.ts'
import type { Currency } from '@shared/types.ts'
import { BackButton, Button, Field, Input, Logo, Notice, ScreenHeader, Segmented } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { toErrorMessage } from '../lib/errors.ts'

export function Settings() {
  const nav = useNavigate()
  const wallet = useWallet()
  const [name, setName] = useState(wallet.prefs.displayName)
  const [ethError, setEthError] = useState<string | null>(null)
  const [ethBusy, setEthBusy] = useState(false)

  async function onConnectEth() {
    setEthBusy(true)
    setEthError(null)
    try {
      await wallet.connectEthereum()
    } catch (err) {
      setEthError(toErrorMessage(err))
    } finally {
      setEthBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Settings" back={<BackButton onClick={() => nav('/app')} />} />

      <Logo />
      <p className="mt-3 text-[14px] text-muted">Split the bill. Settle in NIM.</p>

      <div className="mt-12 space-y-10">
        <Field label="Display name">
          <Input
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => wallet.setDisplayName(name.trim() || 'You')}
            placeholder="You"
          />
        </Field>

        <Field label="Default currency">
          <Segmented
            value={wallet.prefs.defaultCurrency}
            onChange={(value) => wallet.setDefaultCurrency(value as Currency)}
            options={[
              { value: 'NIM', label: 'NIM' },
              { value: 'USDT', label: 'USDT' },
            ]}
          />
        </Field>

        <section>
          <div className="text-[12px] text-muted mb-2">Wallet</div>
          <div className="hairline" />
          <div className="py-4 flex justify-between gap-3 text-[15px] border-b border-line">
            <span className="text-muted">Status</span>
            <span>
              {wallet.status === 'connected' ? 'Connected' : wallet.status === 'connecting' ? 'Connecting' : 'Not connected'}
            </span>
          </div>
          <div className="py-4 flex justify-between gap-3 text-[15px] border-b border-line">
            <span className="text-muted">NIM</span>
            <span className="text-right break-all text-[13px]">
              {wallet.nimiqAddress ? formatNimiqAddress(wallet.nimiqAddress) : '—'}
            </span>
          </div>
          <div className="py-4 flex justify-between gap-3 text-[15px] border-b border-line">
            <span className="text-muted">Polygon</span>
            <span className="text-[13px]">{wallet.ethAddress ? shortenEthAddress(wallet.ethAddress) : '—'}</span>
          </div>
          <Button className="w-full mt-6" variant="secondary" onClick={() => void wallet.connect()}>
            Reconnect Nimiq
          </Button>
          <Button className="w-full mt-3" variant="secondary" disabled={ethBusy} onClick={() => void onConnectEth()}>
            {wallet.ethAddress ? 'Reconnect Ethereum' : 'Connect Ethereum for USDT'}
          </Button>
          {ethError && <Notice tone="danger">{ethError}</Notice>}
        </section>

        <section className="text-[13px] text-muted leading-relaxed space-y-3">
          <p>Nimsplit never asks for private keys and never holds your funds. Payments are approved in Nimiq Pay.</p>
          <p>USDT settlements use Polygon. NIM settlements use the Nimiq Mini App provider.</p>
          <p>Nimsplit 1.0.0 · MIT License</p>
        </section>
      </div>
    </div>
  )
}
