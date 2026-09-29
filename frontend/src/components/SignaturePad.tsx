import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type SignaturePadProps = {
  value?: string
  disabled?: boolean
  onChange: (signatureBase64?: string) => void
}

const CANVAS_WIDTH = 768
const CANVAS_HEIGHT = 192

function configureContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) return null
  context.lineWidth = 3
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#0f344a'
  return context
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  }
}

export function SignaturePad({ value, disabled = false, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const hasUserDrawingRef = useRef(Boolean(value))
  const [hasDrawing, setHasDrawing] = useState(Boolean(value))

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = configureContext(canvas)
    context?.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    drawingRef.current = false
    hasUserDrawingRef.current = false
    setHasDrawing(false)
    onChange(undefined)
  }, [onChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = configureContext(canvas)
    if (!context) return
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    if (!value) {
      hasUserDrawingRef.current = false
      setHasDrawing(false)
      return
    }
    const image = new Image()
    image.onload = () => {
      context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      context.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      hasUserDrawingRef.current = true
      setHasDrawing(true)
    }
    image.src = value
  }, [value])

  const beginDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    event.preventDefault()
    const canvas = event.currentTarget
    canvas.setPointerCapture(event.pointerId)
    const context = configureContext(canvas)
    if (!context) return
    const point = getCanvasPoint(canvas, event)
    context.beginPath()
    context.moveTo(point.x, point.y)
    drawingRef.current = true
    hasUserDrawingRef.current = true
    setHasDrawing(true)
  }

  const continueDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return
    event.preventDefault()
    const canvas = event.currentTarget
    const context = configureContext(canvas)
    if (!context) return
    const point = getCanvasPoint(canvas, event)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  const finishDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    event.preventDefault()
    drawingRef.current = false
    const canvas = event.currentTarget
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (hasUserDrawingRef.current) onChange(canvas.toDataURL('image/png'))
  }

  const confirmSignature = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasUserDrawingRef.current) return
    onChange(canvas.toDataURL('image/png'))
  }

  return (
    <section className="rounded-2xl border ui-border bg-[var(--color-surface)] p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-bold ui-text">Assinatura digital</h3>
          <p className="text-xs ui-text-subtle">Assine abaixo usando o dedo no celular ou o mouse no computador.</p>
        </div>
        {hasDrawing && <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Assinatura capturada</span>}
      </div>
      <div className="mt-3 rounded-xl border ui-border bg-white p-2 shadow-inner">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-label="Área para assinatura digital"
          className="block aspect-[4/1] h-auto w-full touch-none rounded-lg bg-white"
          onPointerDown={beginDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
          onPointerLeave={finishDrawing}
        />
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={disabled || !hasDrawing} onClick={clearCanvas} className="rounded-xl border ui-border px-4 py-2 text-sm font-bold ui-text disabled:cursor-not-allowed disabled:opacity-50">
          Limpar
        </button>
        <button type="button" disabled={disabled || !hasDrawing} onClick={confirmSignature} className="rounded-xl ui-button-primary px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">
          Confirmar
        </button>
      </div>
    </section>
  )
}
