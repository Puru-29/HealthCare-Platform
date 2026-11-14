import { Bot, Loader2, RotateCcw, SendHorizontal, Siren } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { HospitalCard } from '../components/HospitalCard'
import { api, type AssistantReply, type ChatTurn } from '../lib/api'
import { cx } from '../lib/format'
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
    <div className="mx-auto flex max-w-2xl flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Care guide</h1>
          <p className="text-sm text-ink-2">
            Tell me what's wrong — in English or Hindi. I'll suggest the right kind of care and the best place to go.
          </p>
        </div>
        {messages.length > 0 && (
          <button className="btn-ghost shrink-0" onClick={() => setMessages([])} aria-label="Start over"><RotateCcw className="size-4" /></button>
        )}
      </div>

      {meta && !meta.assistant.aiAvailable && (
        <p className="mb-3 rounded-xl bg-amber-soft px-3 py-2 text-xs text-amber">AI is not configured on this server — using basic keyword matching.</p>
      )}

      <div className="space-y-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="card p-4">
            <p className="text-sm font-medium">Try asking:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => void send(s)} className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-brand hover:text-brand">{s}</button>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-3">Not a doctor and not a diagnosis. In an emergency use SOS or call 112.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'user' ? (
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">{m.content}</p>
            ) : (
              <div className="w-full space-y-3">
                <div className="flex gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Bot className="size-4" aria-hidden /></span>
                  <p className="card whitespace-pre-wrap rounded-tl-md px-4 py-2.5 text-sm leading-relaxed">{m.content}</p>
                </div>
                {m.data?.emergency.flagged && (
                  <Link to="/" className="ml-10 flex items-center gap-3 rounded-2xl bg-sos p-3.5 text-white">
                    <Siren className="size-6 shrink-0" aria-hidden />
                    <span className="flex-1 text-sm"><b>This may be an emergency.</b> Tap to open SOS, or call 112 / 108.</span>
                  </Link>
                )}
                {m.data?.recommendation && <RecommendationBlock rec={m.data.recommendation} />}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 pl-10 text-sm text-ink-3"><Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…</div>
        )}
        {error && <p className="rounded-xl bg-sos-soft p-3 text-sm text-sos-dark" role="alert">{error}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => void send(input, e)} className="sticky bottom-20 mt-5 flex gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm md:bottom-4">
        <label htmlFor="chat-input" className="sr-only">Describe your problem</label>
        <input id="chat-input" className="flex-1 bg-transparent px-2 text-sm focus:outline-none" placeholder="Describe the problem…" autoComplete="off"
          value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} />
        <button className="btn-primary px-3" disabled={busy || !input.trim()} aria-label="Send"><SendHorizontal className="size-4" /></button>
      </form>
      {!loc.coords && <p className="mt-2 text-center text-xs text-ink-3">Share your location for distances from where you are. <button className="underline" onClick={() => void loc.locate()}>Share</button></p>}
    </div>
  )
}

function RecommendationBlock({ rec }: { rec: NonNullable<AssistantReply['recommendation']> }) {
  const bestIds = new Set(rec.nearest.map((h) => h.id))
  const better = rec.best.filter((h) => !bestIds.has(h.id))
  if (rec.nearest.length === 0) return <p className="ml-10 text-sm text-ink-2">No listed facility for {rec.specialtyLabel?.toLowerCase()} within {rec.maxKm} km.</p>
  return (
    <div className="ml-10 space-y-3">
      <div className="space-y-2">
        <p className="eyebrow">Nearest to you{rec.specialtyLabel && ` · ${rec.specialtyLabel}`}</p>
        {rec.nearest.map((h, i) => <HospitalCard key={h.id} hospital={h} rank={i + 1} highlight="nearest" />)}
      </div>
      {better.length > 0 && (
        <div className="space-y-2">
          <p className="eyebrow">Best within {rec.maxKm} km — if you can travel</p>
          {better.map((h, i) => <HospitalCard key={h.id} hospital={h} rank={i + 1} highlight="best" />)}
        </div>
      )}
    </div>
  )
}
