import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackButton, Button, Notice, ScreenHeader } from '../components/ui.tsx'
import { fetchGroup } from '../lib/api.ts'
import { copyText } from '../lib/format.ts'
import { inviteUrl, makeQrDataUrl } from '../lib/qr.ts'

export function Invite() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchGroup(id)
      .then(async (group) => {
        setName(group.name)
        setCode(group.code)
        setQr(await makeQrDataUrl(inviteUrl(group.code)))
      })
      .catch(() => setError('Could not load this group invite.'))
  }, [id])

  async function onCopy() {
    await copyText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Invite"
        subtitle={name || undefined}
        back={<BackButton onClick={() => nav(`/g/${id}`)} />}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="rounded-[20px] bg-[#f5f5f2] p-5 grid place-items-center">
        {qr ? <img src={qr} alt="Group invite QR code" className="w-[200px] h-[200px]" /> : <div className="w-[200px] h-[200px]" />}
      </div>
      <div className="mt-8 text-[12px] text-muted">Group code</div>
      <button
        onClick={() => void onCopy()}
        className="mt-2 font-mono text-[40px] tracking-[0.22em] leading-none text-ink"
      >
        {code || '••••••'}
      </button>
      <p className="mt-4 text-[13px] text-muted">Tap to copy.</p>
      <Button className="w-full mt-10" onClick={() => void onCopy()}>
        {copied ? 'Copied' : 'Copy code'}
      </Button>
    </div>
  )
}
