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
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-[rgb(11_42_37/0.28)] backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="sos-title">
      <form onSubmit={send} className="glass pop w-full max-w-md rounded-t-[28px] bg-white/85 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-[28px]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#ff8a8d,#e11d48)' }}><Siren className="size-5" aria-hidden /></span>
            <h2 id="sos-title" className="heading text-2xl">Send SOS</h2>
          </div>
          <button type="button" className="btn-ghost -mr-2 px-3" onClick={onClose} disabled={sending} aria-label="Close"><X className="size-5" /></button>
        </div>
        <p className="mt-3 text-sm text-ink-2">The ambulance crew will call this number. Your exact location is shared only with the hospital that accepts.</p>

        <label className="label mt-5" htmlFor="sos-phone">Mobile number</label>
        <div className="flex gap-2.5">
          <span className="input grid w-[76px] flex-none place-items-center px-0 font-semibold">+91</span>
          <input id="sos-phone" ref={phoneRef} className="input text-lg" inputMode="tel" autoComplete="tel" required
            placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="sos-name">Name <span className="font-normal text-ink-3">(optional)</span></label>
            <input id="sos-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sos-note">What happened? <span className="font-normal text-ink-3">(optional)</span></label>
            <input id="sos-note" className="input" maxLength={280} placeholder="e.g. chest pain, 60 yrs" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {me?.bloodGroup && <p className="mt-3 text-xs text-ink-3">Your blood group ({me.bloodGroup}){me.allergies ? ' and allergies' : ''} from your profile will be shared with the crew.</p>}

        {error && <p className="mt-4 rounded-2xl bg-sos-soft p-3 text-sm text-sos-dark" role="alert">{error}</p>}

        <button type="submit" className="btn-danger mt-6 min-h-14 w-full text-base" disabled={sending || phone.replace(/\D/g, '').length < 10}>
          {sending ? <><Loader2 className="size-5 animate-spin" aria-hidden /> Sending…</> : 'Send SOS now'}
        </button>
        <a href="tel:108" className="btn-ghost mt-2 w-full">Or call 108 instead</a>
      </form>
    </div>
  )
}
