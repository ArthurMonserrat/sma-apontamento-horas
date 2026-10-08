import { useState } from 'react'
import officialLogo from '../assets/brand/sma-logo.jpg'

type BrandMarkProps = {
  alt?: string
  variant?: 'compact' | 'full'
  src?: string
  transparent?: boolean
  className?: string
}

const defaultAlt = 'SM&A — Sistemas Elétricos e Automação'

export function BrandMark({ alt = defaultAlt, variant = 'compact', src = officialLogo, transparent = false, className = '' }: BrandMarkProps) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed

  return (
    <span className={`brand-mark brand-mark--${variant}${transparent ? ' brand-mark--transparent' : ''} ${className}`} data-brand-variant={variant}>
      {showImage
        ? (
            <span className="brand-mark__image-frame">
              <img src={src} alt={alt} className="h-full w-full object-contain" onError={() => setFailed(true)} />
            </span>
          )
        : <span className="brand-mark__fallback" role="img" aria-label={alt}>SM&amp;A</span>}
    </span>
  )
}
