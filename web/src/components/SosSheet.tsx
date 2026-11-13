import { Loader2, Siren, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type Incident, type LatLng, type Me } from '../lib/api'
import { getPosition } from '../lib/hooks'

/**
 * Last step before an SOS goes out: confirm a callback number (pre-filled after
 * the first time) and optionally say what happened. Fresh GPS is taken here.
 */
export function SosSheet({ me, coords, onClose, onSent }: {
  me: Me | null
  coords: (LatLng & { accuracy: number }) | null
  onClose: () => void
  onSent: (id: string) => void
}) {
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [name, setName] = useState(me?.name ?? '')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!me?.phone) phoneRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [me?.phone, onClose, sending])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    setSending(true)
    setError(null)
    let position = coords
    try {
      position = await getPosition(true)
    } catch (err) {
      if (!position) {
        setError(`${(err as Error).message} Without your location we can't send an ambulance — please call 112 or 108.`)
        setSending(false)
        return
      }
    }
    try {
      const incident = await api.post<Incident>('/sos', {
        lat: position!.lat, lng: position!.lng, accuracyM: position!.accuracy,
        phone, name: name || null, note: note || null,
      })
      onSent(incident.id)
    } catch (err) {
      setError((err as Error).message)
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="sos-title">
      <form onSubmit={send} className="w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-full bg-sos-soft text-sos"><Siren className="size-5" aria-hidden /></span>
            <h2 id="sos-title" className="text-lg font-bold">Send SOS</h2>
          </div>
          <button type="button" className="btn-ghost -mr-2 p-2" onClick={onClose} disabled={sending} aria-label="Close"><X className="size-5" /></button>
        </div>
        <p className="mt-2 text-sm text-ink-2">The ambulance crew will call this number. Your exact location is shared only with the hospital that accepts.</p>

        <label className="label mt-4" htmlFor="sos-phone">Mobile number</label>
        <input id="sos-phone" ref={phoneRef} className="input text-lg" inputMode="tel" autoComplete="tel" required
          placeholder="98xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="sos-name">Name <span className="font-normal text-ink-3">(optional)</span></label>
            <input id="sos-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sos-note">What happened? <span className="font-normal text-ink-3">(optional)</span></label>
            <input id="sos-note" className="input" maxLength={280} placeholder="e.g. chest pain, 60 yrs" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {error && <p className="mt-3 rounded-xl bg-sos-soft p-3 text-sm text-sos-dark" role="alert">{error}</p>}

        <button type="submit" className="btn-danger mt-5 w-full py-3.5 text-base" disabled={sending || phone.replace(/\D/g, '').length < 10}>
          {sending ? <><Loader2 className="size-5 animate-spin" aria-hidden /> Sending…</> : 'Send SOS now'}
        </button>
        <a href="tel:108" className="btn-ghost mt-2 w-full">Or call 108 instead</a>
      </form>
    </div>
  )
}
