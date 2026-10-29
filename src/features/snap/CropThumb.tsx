import { useEffect, useRef } from 'react'
import type { NormBox } from '@/import/types'

/** A small preview of one box of the photo. */
export function CropThumb({ photo, box, size }: { photo: HTMLCanvasElement; box: NormBox; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const [y0, x0, y1, x1] = box.map((v, k) => (v / 1000) * (k % 2 ? photo.width : photo.height))
    const w = x1! - x0!
    const h = y1! - y0!
    const scale = Math.min(size / w, size / h)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(photo, x0!, y0!, w, h, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale)
  }, [photo, box, size])
  return <canvas ref={ref} width={size} height={size} className="shrink-0 rounded-md bg-sunken" style={{ width: size, height: size }} />
}
