import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackButton, Button, Field, Input, Notice, ScreenHeader } from '../components/ui.tsx'
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
        title="Create"
        subtitle="Name the group. Share a code later."
        back={<BackButton onClick={() => nav('/app')} />}
      />
      {wallet.status !== 'connected' && (
        <Notice tone="warn">Wallet not connected. Open Nimsplit inside Nimiq Pay.</Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Group name">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Friday Dinner"
          maxLength={48}
        />
      </Field>
      <Button className="w-full mt-10" disabled={busy || name.trim().length < 2} onClick={() => void onCreate()}>
        {busy ? 'Creating…' : 'Create group'}
      </Button>
    </div>
  )
}
