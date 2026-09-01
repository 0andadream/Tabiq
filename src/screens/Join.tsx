import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BackButton, Banner, Button, Field, Input, ScreenHeader } from '../components/ui.tsx'
import { useWallet } from '../context/WalletContext.tsx'
import { joinGroup, lookupCode } from '../lib/api.ts'
import { isAppError, toErrorMessage } from '../lib/errors.ts'
import { displayNameOrYou } from '../lib/identity.ts'

export function Join() {
  const nav = useNavigate()
  const params = useParams()
  const [search] = useSearchParams()
  const wallet = useWallet()
  const preset = (params.code || search.get('join') || search.get('g') || '').toUpperCase()
  const [code, setCode] = useState(preset)
  const [preview, setPreview] = useState<{ name: string; memberCount: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (preset) setCode(preset)
  }, [preset])

  useEffect(() => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) {
      setPreview(null)
      return
    }
    let cancelled = false
    lookupCode(trimmed)
      .then((group) => {
        if (!cancelled) {
          setPreview({ name: group.name, memberCount: group.memberCount })
          setError(null)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setPreview(null)
        if (isAppError(err) && err.code === 'invalid_code') {
          setError('Invalid group code. Check the code or QR and try again.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [code])

  async function onJoin() {
    if (wallet.status !== 'connected' && code.trim().toUpperCase() !== 'FRIDAY') {
      setError('Connect a wallet in Nimiq Pay before joining.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const group = await joinGroup({
        code,
        displayName: displayNameOrYou(wallet.prefs.displayName),
        nimiqAddress: wallet.nimiqAddress,
        ethAddress: wallet.ethAddress,
      })
      nav(`/g/${group.id}`, { replace: true })
    } catch (err) {
      if (isAppError(err) && err.code === 'invalid_code') {
        setError('This code or QR is invalid or expired.')
      } else {
        setError(toErrorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Join group"
        subtitle="Enter a short code or open a Tabiq invite."
        back={<BackButton onClick={() => nav('/')} />}
      />

      {wallet.status !== 'connected' && (
        <div className="mb-5">
          <Banner tone="warn">
            Wallet not connected. You can still open the Friday Dinner preview; live joins need Nimiq Pay.
          </Banner>
        </div>
      )}
      {error && (
        <div className="mb-5">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}

      <Field label="Group code">
        <Input
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="FRIDAY"
        />
      </Field>

      {preview && (
        <div className="mt-6 rounded-2xl border border-white/10 p-4">
          <div className="text-[18px]">{preview.name}</div>
          <div className="mt-1 text-[13px] text-muted">
            {preview.memberCount} {preview.memberCount === 1 ? 'member' : 'members'}
          </div>
        </div>
      )}

      <Button className="w-full mt-8" onClick={() => void onJoin()} disabled={busy || code.trim().length < 4}>
        {busy ? 'Joining…' : preview?.name === 'Friday Dinner' ? 'Join Friday Dinner' : 'Join group'}
      </Button>
    </div>
  )
}
