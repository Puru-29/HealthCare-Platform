import { Bot, SendHorizontal, Siren, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { HospitalCard } from '../components/HospitalCard'
import { api, type AssistantReply, type ChatTurn, type RankedHospital } from '../lib/api'
import { isDialable, tel } from '../lib/format'
import { useLocation, useMeta } from '../lib/hooks'

interface Message extends ChatTurn {
  data?: AssistantReply
}

const SUGGESTIONS = [
  'My knee has been hurting for 2 weeks',
  'Bachche ko 3 din se bukhar hai',
  'I need a cataract operation with Ayushman card',
  'Pregnancy check-up near Gohana',
]
const KEY = 'cp:chat'

function BotAvatar() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-brand/40 bg-brand-soft">
      <Bot className="size-[18px] text-brand-3" aria-hidden />
    </span>
  )
}

export function AssistantPage() {
  const meta = useMeta()
  const loc = useLocation()
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Message[] } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(messages)) } catch { /* storage unavailable */ }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  async function send(text: string, e?: FormEvent) {
    e?.preventDefault()
    const content = text.trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError(null)
    try {
      const data = await api.post<AssistantReply>('/assistant', {
        messages: next.slice(-20).map(({ role, content }) => ({ role, content })),
        location: loc.coords ? { lat: loc.coords.lat, lng: loc.coords.lng } : null,
      })
      setMessages([...next, { role: 'assistant', content: data.reply, data }])
    } catch (err) {
      setError((err as Error).message)
      setMessages(messages)
      setInput(content)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="glass fu flex min-h-[calc(100dvh-10rem)] flex-col overflow-hidden rounded-[30px] lg:min-h-[calc(100dvh-3rem)]">
      <header className="flex flex-wrap items-center justify-between gap-3.5 border-b border-line px-5 py-5 sm:px-7">
        <div className="flex items-center gap-3.5">
          <span className="orb grid size-12 place-items-center rounded-full" style={{ background: 'radial-gradient(circle at 30% 25%,#ccfbf1,#2dd4bf 55%,#0f766e)' }}>
            <Sparkles className="size-[22px] text-on-mint" aria-hidden />
          </span>
          <div>
            <h1 className="heading text-2xl">Care guide</h1>
            <p className="mt-0.5 text-sm text-ink-2">Tell me what’s wrong — in English or Hindi.</p>
          </div>
        </div>
        {messages.length > 0 && <button className="btn-secondary" onClick={() => setMessages([])}>Start over</button>}
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-6 sm:px-7" aria-live="polite">
        {meta && !meta.assistant.aiAvailable && (
          <p className="rounded-2xl border border-amber/30 bg-amber-soft px-4 py-2.5 text-[13px] text-amber">AI isn’t switched on for this server yet, so answers use simple keyword matching.</p>
        )}
        {messages.length === 0 && (
          <div className="fu d1 flex gap-3">
            <BotAvatar />
            <p className="max-w-[680px] rounded-[6px_22px_22px_22px] border border-line bg-fill px-4.5 py-4 text-[15px] leading-relaxed">
              Namaste! Describe the problem — who it’s for, how long it’s been going on, and anything that worries you. I’ll suggest the right kind of care, the <b>nearest</b> suitable place and the <b>best option within 100 km</b>. I’m not a doctor, and I’ll tell you if something needs SOS.
            </p>
          </div>
        )}

        {messages.map((m, i) => m.role === 'user' ? (
          <div key={i} className="pop flex justify-end">
            <p className="max-w-[80%] rounded-[22px_22px_6px_22px] text-white px-4.5 py-3.5 text-base leading-normal whitespace-pre-wrap shadow-[0_10px_30px_rgb(45_212_191/0.3)]" style={{ background: 'linear-gradient(135deg,#2dd4bf,#0f766e)' }}>{m.content}</p>
          </div>
        ) : (
          <div key={i} className="pop flex items-start gap-3">
            <BotAvatar />
            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
              <p className="max-w-[680px] rounded-[6px_22px_22px_22px] border border-line bg-fill px-4.5 py-4 text-[15px] leading-relaxed whitespace-pre-wrap">{m.content}</p>
              {m.data?.emergency.flagged && (
                <Link to="/app/sos" className="sos-surface flex max-w-[680px] items-center gap-3 rounded-[20px] p-4 no-underline">
                  <Siren className="live size-6 shrink-0" aria-hidden />
                  <span className="flex-1 text-sm"><b>This may be an emergency.</b> Tap to open SOS, or call 112 / 108.</span>
                </Link>
              )}
              {m.data?.recommendation && <Recommendations rec={m.data.recommendation} />}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-3">
            <BotAvatar />
            <span aria-label="Thinking" className="inline-flex gap-1.5 rounded-[6px_22px_22px_22px] border border-line bg-fill px-4.5 py-4"><span className="dot" /><span className="dot" /><span className="dot" /></span>
          </div>
        )}
        {error && <p className="rounded-2xl bg-sos-soft p-3 text-sm text-sos-dark" role="alert">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line px-5 pt-4.5 pb-6 sm:px-7">
        <div className="mb-3.5 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => void send(s)} disabled={busy}
              className="min-h-10 rounded-full border border-line bg-fill px-3.5 text-sm font-medium text-ink-2 transition hover:border-brand/50 hover:bg-brand-soft">{s}</button>
          ))}
        </div>
        <form onSubmit={(e) => void send(input, e)} className="flex gap-2.5">
          <label htmlFor="chat-input" className="sr-only">Describe your problem</label>
          <input id="chat-input" className="input min-h-14 flex-1 rounded-[18px] text-base" placeholder="Describe the problem… (English / हिन्दी / Hinglish)" autoComplete="off"
            value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} />
          <button className="grid size-14 flex-none place-items-center rounded-[18px] text-on-mint shadow-[0_10px_28px_rgb(45_212_191/0.4)] disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#99f6e4,#2dd4bf)' }}
            disabled={busy || !input.trim()} aria-label="Send"><SendHorizontal className="size-5" /></button>
        </form>
        <p className="mt-3 text-[13px] text-ink-3">
          Not a doctor and not a diagnosis. In an emergency use SOS or call 112.
          {!loc.coords && <> Share your location for distances from where you are. <button className="font-semibold text-brand underline" onClick={() => void loc.locate()}>Share</button></>}
        </p>
      </div>
    </section>
  )
}

function Recommendations({ rec }: { rec: NonNullable<AssistantReply['recommendation']> }) {
  const nearest = rec.nearest[0]
  const best: RankedHospital | undefined = rec.best.find((h) => h.id !== nearest?.id)
  const others = [...rec.nearest.slice(1), ...rec.best].filter((h, i, all) => h.id !== nearest?.id && h.id !== best?.id && all.findIndex((x) => x.id === h.id) === i)
  if (!nearest) return <p className="text-sm text-ink-2">No listed facility for {rec.specialtyLabel?.toLowerCase()} within {rec.maxKm} km.</p>
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 xl:grid-cols-2">
        <HospitalCard hospital={nearest} label={`Nearest suitable${rec.specialtyLabel ? ` · ${rec.specialtyLabel}` : ''}`} />
        {best && <HospitalCard hospital={best} label={`Best within ${rec.maxKm} km — if you can travel`} labelTone="sky" />}
      </div>
      {others.length > 0 && (
        <details className="text-sm text-ink-2">
          <summary className="cursor-pointer font-semibold text-brand">{others.length} more option{others.length === 1 ? '' : 's'}</summary>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">{others.map((h) => <HospitalCard key={h.id} hospital={h} />)}</div>
        </details>
      )}
      <div className="flex flex-wrap gap-2.5">
        <Link to={`/app/appointments?hospital=${encodeURIComponent(nearest.id)}`} className="btn border border-brand/40 bg-brand-soft text-brand-3">Request appointment</Link>
        {isDialable(nearest.phone) && <a href={tel(nearest.phone)} className="btn-secondary">Call {nearest.name.split(/[,(]/)[0]}</a>}
      </div>
    </div>
  )
}
