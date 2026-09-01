import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackButton, Banner, Button, Field, Input, ScreenHeader } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { createGroup } from '../lib/api.ts'
import { toErrorMessage } from '../lib/errors.ts'
import { displayNameOrYou } from '../lib/identity.ts'

export function CreateGroup() {
  const nav = useNavigate()
  const wallet = useWallet()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onCreate() {
    if (wallet.status !== 'connected') {
      setError('Connect a wallet in Nimiq Pay before creating a group.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const group = await createGroup({
        name,
        displayName: displayNameOrYou(wallet.prefs.displayName),
        nimiqAddress: wallet.nimiqAddress,
        ethAddress: wallet.ethAddress,
      })
      nav(`/g/${group.id}/invite`, { replace: true })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Create group"
        subtitle="Share a code. Split later."
        back={<BackButton onClick={() => nav('/')} />}
      />
      {wallet.status !== 'connected' && (
        <div className="mb-5">
          <Banner tone="warn">Wallet not connected. Open Tabiq inside Nimiq Pay.</Banner>
        </div>
      )}
      {error && (
        <div className="mb-5">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
      <Field label="Group name">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Friday Dinner"
          maxLength={48}
        />
      </Field>
      <Button className="w-full mt-8" disabled={busy || name.trim().length < 2} onClick={() => void onCreate()}>
        {busy ? 'Creating…' : 'Create group'}
      </Button>
    </div>
  )
}
