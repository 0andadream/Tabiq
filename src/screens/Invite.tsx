import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackButton, Banner, Button, ScreenHeader } from '../components/ui.tsx'
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
        subtitle={name ? `Share ${name}` : 'Share this group'}
        back={<BackButton onClick={() => nav(`/g/${id}`)} />}
      />
      {error && (
        <div className="mb-5">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
      <div className="rounded-[28px] bg-[#f7f3ea] text-[#16140d] p-6 grid place-items-center">
        {qr ? <img src={qr} alt="Group invite QR code" className="w-[220px] h-[220px]" /> : <div className="w-[220px] h-[220px]" />}
      </div>
      <div className="mt-6 text-center">
        <div className="text-[12px] uppercase tracking-[0.18em] text-muted">Group code</div>
        <div className="mt-2 text-[32px] tracking-[0.28em] font-medium">{code || '••••••'}</div>
      </div>
      <p className="mt-4 text-center text-[14px] text-muted">Scan the QR or enter the code in Tabiq. Codes do not expire, but an invalid QR will be rejected.</p>
      <Button className="w-full mt-8" onClick={() => void onCopy()}>
        {copied ? 'Copied' : 'Copy code'}
      </Button>
      <Button className="w-full mt-3" variant="secondary" onClick={() => nav(`/g/${id}`)}>
        Done
      </Button>
    </div>
  )
}
