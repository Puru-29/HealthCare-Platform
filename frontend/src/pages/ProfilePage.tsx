import { CalendarDays, CheckCircle2, ChevronRight, Stethoscope } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ErrorNote, Spinner } from '../components/ui'
import { api, type Me } from '../lib/api'
import { useMe } from '../lib/hooks'

export function ProfilePage() {
  const me = useMe()
  const [form, setForm] = useState<Me | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (me.data) setForm(me.data) }, [me.data])

  if (!form) return <Spinner />

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      const { activeSosId: _ignored, ...body } = form!
      setForm(await api.put<Me>('/me', { ...body, sumInsured: body.sumInsured || null }))
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }
  const text = (k: keyof Me) => ({
    value: (form[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f!, [k]: e.target.value })),
  })

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold">Me</h1>

      <div className="grid gap-2">
        <Link to="/appointments" className="card flex items-center gap-3 p-3.5"><CalendarDays className="size-5 text-brand" aria-hidden /><span className="flex-1 font-medium">My appointments</span><ChevronRight className="size-4 text-ink-3" aria-hidden /></Link>
        <Link to="/console" className="card flex items-center gap-3 p-3.5"><Stethoscope className="size-5 text-brand" aria-hidden /><span className="flex-1 font-medium">Hospital staff? Open the console</span><ChevronRight className="size-4 text-ink-3" aria-hidden /></Link>
      </div>

      <form onSubmit={save} className="card space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Emergency details</h2>
          <p className="text-xs text-ink-3">Saved on this device so SOS is one tap. Only shared with the hospital that accepts your SOS.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="p-name">Your name</label><input id="p-name" className="input" autoComplete="name" {...text('name')} /></div>
          <div><label className="label" htmlFor="p-phone">Mobile number</label><input id="p-phone" className="input" inputMode="tel" autoComplete="tel" {...text('phone')} /></div>
          <div><label className="label" htmlFor="p-ecn">Emergency contact name</label><input id="p-ecn" className="input" {...text('emergencyContactName')} /></div>
          <div><label className="label" htmlFor="p-ecp">Emergency contact mobile</label><input id="p-ecp" className="input" inputMode="tel" {...text('emergencyContactPhone')} /></div>
        </div>

        <div className="border-t border-line pt-4">
          <h2 className="font-semibold">Insurance</h2>
          <p className="text-xs text-ink-3">Used to rank hospitals where you can get cashless treatment.</p>
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" className="size-4 accent-brand" checked={form.hasPmjay} onChange={(e) => setForm({ ...form, hasPmjay: e.target.checked })} />
          <span className="text-sm">I have an <b>Ayushman Bharat (PM-JAY)</b> card</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="p-ins">Health insurer</label><input id="p-ins" className="input" placeholder="e.g. Star Health" {...text('insurer')} /></div>
          <div>
            <label className="label" htmlFor="p-si">Sum insured (₹)</label>
            <input id="p-si" className="input" type="number" min={0} inputMode="numeric" value={form.sumInsured ?? ''}
              onChange={(e) => setForm({ ...form, sumInsured: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex items-center gap-3">
          <button className="btn-primary">Save</button>
          {saved && <span className="flex items-center gap-1 text-sm text-brand"><CheckCircle2 className="size-4" aria-hidden /> Saved</span>}
        </div>
      </form>
    </div>
  )
}
