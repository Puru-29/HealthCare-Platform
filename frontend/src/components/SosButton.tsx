import { useCallback, useEffect, useRef, useState } from 'react'

const HOLD_MS = 1200
const R = 108
const CIRC = 2 * Math.PI * R

/**
 * Press and hold to send SOS. Holding avoids pocket-dials but takes about a second —
 * a quick tap explains how to use it rather than doing nothing.
 */
export function SosButton({ onTrigger, disabled, caption = 'Alerts the nearest hospitals with an ambulance' }: { onTrigger: () => void; disabled?: boolean; caption?: string }) {
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
        className="relative grid size-[230px] touch-none select-none place-items-center rounded-full focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-sos disabled:opacity-60"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); begin() }}
        onPointerUp={() => stop(true)}
        onPointerCancel={() => stop(false)}
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin() } }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(true) }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {progress === 0 && <><span className="sos-ring" /><span className="sos-ring r2" /><span className="sos-ring r3" /></>}
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 230 230" aria-hidden="true">
          <circle className="sos-progress" cx="115" cy="115" r={R} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} opacity={progress > 0 ? 0.95 : 0} />
        </svg>
        <span
          className="relative grid size-44 place-items-center rounded-full text-center text-white transition-transform"
          style={{
            transform: `scale(${1 - progress * 0.06})`,
            background: 'radial-gradient(circle at 30% 25%, #ff8a8d, #ff5a5f 45%, #c81e3a)',
            boxShadow: '0 20px 60px rgb(255 90 95 / 0.55), inset 0 2px 0 rgb(255 255 255 / 0.4)',
          }}
        >
          <span>
            <span className="heading block text-[44px] leading-none tracking-[0.04em]">SOS</span>
            <span className="mt-1 block text-[13px] font-semibold">{progress > 0 ? 'Keep holding…' : 'Press & hold'}</span>
          </span>
        </span>
      </button>
      <p className={`mt-5 min-h-5 text-[15px] ${hint ? 'font-semibold text-sos-dark' : 'text-ink-2'}`} aria-live="polite">
        {hint ? 'Hold the button for one second to send SOS' : caption}
      </p>
    </div>
  )
}
