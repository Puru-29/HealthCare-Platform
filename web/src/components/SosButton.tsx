import { useCallback, useEffect, useRef, useState } from 'react'

const HOLD_MS = 1200
const R = 92
const CIRC = 2 * Math.PI * R

/**
 * Press and hold to send SOS. Holding avoids pocket-dials but takes about a second —
 * a tap shows how to use it rather than doing nothing.
 */
export function SosButton({ onTrigger, disabled }: { onTrigger: () => void; disabled?: boolean }) {
  const [progress, setProgress] = useState(0)
  const [hint, setHint] = useState(false)
  const start = useRef<number | null>(null)
  const raf = useRef<number | null>(null)
  const fired = useRef(false)

  const stop = useCallback((tapped: boolean) => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = null
    if (tapped && !fired.current && start.current && Date.now() - start.current < 400) setHint(true)
    start.current = null
    setProgress(0)
  }, [])

  const tick = useCallback(() => {
    if (start.current === null) return
    const p = Math.min(1, (Date.now() - start.current) / HOLD_MS)
    setProgress(p)
    if (p >= 1 && !fired.current) {
      fired.current = true
      navigator.vibrate?.(200)
      stop(false)
      onTrigger()
      return
    }
    raf.current = requestAnimationFrame(tick)
  }, [onTrigger, stop])

  const begin = useCallback(() => {
    if (disabled || start.current !== null) return
    fired.current = false
    setHint(false)
    start.current = Date.now()
    navigator.vibrate?.(30)
    raf.current = requestAnimationFrame(tick)
  }, [disabled, tick])

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        disabled={disabled}
        aria-label="SOS — press and hold to call an ambulance"
        className="relative grid size-52 touch-none select-none place-items-center rounded-full focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-sos disabled:opacity-60"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); begin() }}
        onPointerUp={() => stop(true)}
        onPointerCancel={() => stop(false)}
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin() } }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(true) }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="absolute inset-3 rounded-full bg-sos/15" aria-hidden />
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 208 208" aria-hidden>
          <circle cx="104" cy="104" r={R} fill="none" stroke="#fde2df" strokeWidth="8" />
          <circle className="sos-ring" cx="104" cy="104" r={R} fill="none" stroke="#b42318" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} />
        </svg>
        <span
          className="relative grid size-40 place-items-center rounded-full bg-sos text-white shadow-[0_12px_30px_-6px_rgb(217_45_32/0.6)] transition-transform"
          style={{ transform: `scale(${1 - progress * 0.06})` }}
        >
          <span className="text-center">
            <span className="block text-4xl font-black tracking-wide">SOS</span>
            <span className="mt-1 block text-xs font-medium opacity-90">{progress > 0 ? 'Keep holding…' : 'Press & hold'}</span>
          </span>
        </span>
      </button>
      <p className={`mt-3 h-5 text-sm ${hint ? 'font-medium text-sos-dark' : 'text-ink-2'}`} aria-live="polite">
        {hint ? 'Hold the button for one second to send SOS' : 'Alerts the nearest hospitals with an ambulance'}
      </p>
    </div>
  )
}
