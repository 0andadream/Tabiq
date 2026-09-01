import QRCode from 'qrcode'

export function inviteUrl(code: string): string {
  const origin = (
    import.meta.env.VITE_APP_URL ||
    `${window.location.origin}${import.meta.env.BASE_URL}`
  ).replace(/\/$/, '')
  return `${origin}/join/${code}`
}

export function nimiqPayUrl(code: string): string {
  const host = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `nimiqpay://miniapp?url=${host}/join/${code}`
}

export async function makeQrDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, {
    margin: 1,
    width: 280,
    color: {
      dark: '#111111',
      light: '#F7F3EA',
    },
    errorCorrectionLevel: 'M',
  })
}
