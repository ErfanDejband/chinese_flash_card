import { useEffect, useState } from 'react'

/** A QR code for `text`, drawn as one SVG path; the encoder is loaded only when a code is shown. */
export function QrCode({ text, className }: { text: string; className?: string }) {
  const [code, setCode] = useState<{ text: string; modules: boolean[][] }>()
  useEffect(() => {
    let active = true
    void import('uqr').then(({ encode }) => {
      if (active) setCode({ text, modules: encode(text, { ecc: 'M', border: 2 }).data })
    })
    return () => {
      active = false
    }
  }, [text])
  if (!code || code.text !== text) return <div className={className} aria-busy="true" />
  const size = code.modules.length
  let d = ''
  code.modules.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)))
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label="QR code of the class link" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
