import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { config } from '../config.js'
import type { DB } from '../db.js'
import type { LatLng } from '../domain/geo.js'
import { SPECIALTIES, SPECIALTY_KEYS, isSpecialtyKey, type SpecialtyKey } from '../domain/specialties.js'
import { detectRedFlags, matchSpecialties, type RedFlag } from '../domain/triage.js'
import { recommendHospitals } from './hospitals.js'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantContext {
  origin: LatLng | null
  hasPmjay: boolean
}

type Recommendation = ReturnType<typeof recommendHospitals>

export interface AssistantReply {
  reply: string
  emergency: { flagged: boolean; reasons: string[] }
  recommendation: Recommendation | null
  mode: 'ai' | 'rules'
}

const SYSTEM_PROMPT = `You are CarePath's care guide for people in Sonipat district, Haryana, India. People describe a health problem; you help them decide what kind of care they need and where to go.

How to help:
- Work out which kind of care fits (the specialty) from what they describe. If it is genuinely unclear, ask one short clarifying question; otherwise go straight to finding hospitals.
- Use find_hospitals to get real options. Never name a hospital, doctor, phone number or price that did not come from a tool result.
- Present two kinds of answer when both exist: the nearest suitable place, and the strongest option within 100 km "if you have time to travel". Say why the stronger option is stronger using the reasons in the tool result, and how much further it is.
- Mention Ayushman Bharat (PM-JAY) cashless treatment when a recommended hospital is empanelled.
- Specialty information marked "From facility name" or "Expected for this facility level" is not confirmed by the hospital; suggest calling ahead for anything specialised.

Safety:
- You are not a doctor and do not diagnose or prescribe. You may explain in plain words what a specialty deals with and what to tell the doctor.
- If anything suggests an emergency (chest pain, trouble breathing, unconsciousness, heavy bleeding, stroke signs, seizure, major injury, poisoning, severe burns, pregnancy bleeding or labour, a very sick infant, thoughts of self-harm), call flag_emergency first, then tell them to press the red SOS button in the app or call 112 / 108 immediately. Keep that reply very short.
- For thoughts of self-harm, also share Tele-MANAS: 14416 (free, 24×7).

Style: Reply in the user's language — English, Hindi or Hinglish as they write. Be warm and brief: short paragraphs, no headings, at most 120 words unless they ask for detail. The app shows hospital cards under your message, so do not repeat addresses or phone numbers in full.`

const findHospitalsInput = z.object({
  specialty: z.enum(SPECIALTY_KEYS as [SpecialtyKey, ...SpecialtyKey[]]),
  max_distance_km: z.number().min(1).max(100),
  pmjay_only: z.boolean(),
})
const flagEmergencyInput = z.object({ reason: z.string().min(1).max(200) })

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'find_hospitals',
    description: 'Search the CarePath hospital directory around the user. Returns the nearest suitable facilities and the strongest options within the distance limit, each with distance, facility type, Ayushman (PM-JAY) status, how confident we are it offers the specialty, and reasons it ranks well. Use 100 km to include stronger options further away.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        specialty: {
          type: 'string',
          enum: SPECIALTY_KEYS,
          description: `Kind of care needed. ${SPECIALTY_KEYS.map((k) => `${k} = ${SPECIALTIES[k].label}`).join('; ')}.`,
        },
        max_distance_km: { type: 'number', description: 'Search radius in km, 1 to 100.' },
        pmjay_only: { type: 'boolean', description: 'Only hospitals empanelled under Ayushman Bharat PM-JAY (cashless for card holders).' },
      },
      required: ['specialty', 'max_distance_km', 'pmjay_only'],
      additionalProperties: false,
    },
  },
  {
    name: 'flag_emergency',
    description: 'Show the emergency banner with the SOS button in the app. Call this whenever the situation may be a medical emergency.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Short reason, e.g. "chest pain with sweating".' } },
      required: ['reason'],
      additionalProperties: false,
    },
  },
]

// Default origin when the user has not shared location: Sonipat city centre.
const SONIPAT_CENTRE: LatLng = { lat: 28.9931, lng: 77.0151 }

let aiDisabledReason: string | null = null

function compactForModel(rec: Recommendation) {
  const brief = (h: Recommendation['nearest'][number]) => ({
    name: h.name,
    type: h.facilityTypeLabel,
    distance_km: h.distanceKm,
    approx_drive_min: h.etaMinutes,
    pmjay_cashless: !!h.pmjay?.empanelled,
    specialty_evidence: h.evidenceLabel,
    reasons: h.reasons,
  })
  return {
    specialty: rec.specialtyLabel,
    searched_within_km: rec.maxKm,
    facilities_considered: rec.considered,
    nearest: rec.nearest.map(brief),
    best_options: rec.best.map(brief),
  }
}

export async function runAssistant(db: DB, history: ChatTurn[], ctx: AssistantContext): Promise<AssistantReply> {
  const lastUser = [...history].reverse().find((t) => t.role === 'user')?.content ?? ''
  const redFlags = detectRedFlags(lastUser)
  if (!aiDisabledReason) {
    try {
      return await runClaude(db, history, ctx, redFlags)
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || (error instanceof Error && /api key|credentials|authentication/i.test(error.message) && !(error instanceof Anthropic.APIError))) {
        aiDisabledReason = 'No valid Anthropic credentials'
        console.warn('[assistant] Claude unavailable (no valid credentials) — using rule-based guidance.')
      } else if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
        console.warn('[assistant] Claude temporarily unavailable:', (error as Error).message)
      } else {
        throw error
      }
    }
  }
  return runRules(db, lastUser, ctx, redFlags)
}

let client: Anthropic | null = null

async function runClaude(db: DB, history: ChatTurn[], ctx: AssistantContext, redFlags: RedFlag[]): Promise<AssistantReply> {
  client ??= new Anthropic()
  const origin = ctx.origin ?? SONIPAT_CENTRE
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }))
  const contextNote = [
    ctx.origin ? 'The user shared their location; distances are from there.' : 'The user has not shared location; distances are from Sonipat city centre — say so if distance matters.',
    ctx.hasPmjay ? 'The user has an Ayushman Bharat (PM-JAY) card.' : 'We do not know whether the user has an Ayushman Bharat card.',
    redFlags.length ? `Safety screen matched possible emergency signs: ${redFlags.map((f) => f.label).join(', ')}.` : '',
  ].filter(Boolean).join(' ')
  // Operator context as a mid-conversation system message: it must follow a user
  // turn and be last or followed by an assistant turn — both hold in this loop.
  messages.push({ role: 'system', content: contextNote })

  let recommendation: Recommendation | null = null
  const emergencyReasons = new Set(redFlags.map((f) => f.label))

  for (let turn = 0; turn < config.assistant.maxTurns; turn++) {
    const response = await client.beta.messages.create({
      model: config.assistant.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })

    if (response.stop_reason === 'refusal') {
      return {
        reply: 'I can’t help with that here. If this is about your health, please describe the problem, or call 112 in an emergency.',
        emergency: { flagged: emergencyReasons.size > 0, reasons: [...emergencyReasons] },
        recommendation,
        mode: 'ai',
      }
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
      return {
        reply: text || 'Sorry, I could not put together an answer. Please try rephrasing.',
        emergency: { flagged: emergencyReasons.size > 0, reasons: [...emergencyReasons] },
        recommendation,
        mode: 'ai',
      }
    }

    messages.push({ role: 'assistant', content: response.content })
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const use of toolUses) {
      if (use.name === 'find_hospitals') {
        const parsed = findHospitalsInput.safeParse(use.input)
        if (!parsed.success) {
          results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Invalid input: ' + parsed.error.issues[0]?.message })
          continue
        }
        recommendation = recommendHospitals(db, {
          origin,
          specialty: parsed.data.specialty,
          maxKm: parsed.data.max_distance_km,
          pmjayOnly: parsed.data.pmjay_only,
          hasPmjay: ctx.hasPmjay,
        })
        results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(compactForModel(recommendation)) })
      } else if (use.name === 'flag_emergency') {
        const parsed = flagEmergencyInput.safeParse(use.input)
        emergencyReasons.add(parsed.success ? parsed.data.reason : 'Possible emergency')
        results.push({ type: 'tool_result', tool_use_id: use.id, content: 'Emergency banner with SOS button is now showing to the user.' })
      } else {
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Unknown tool ${use.name}` })
      }
    }
    messages.push({ role: 'user', content: results })
  }
  return {
    reply: 'Here is what I found. Tap a hospital for details, or ask me something more specific.',
    emergency: { flagged: emergencyReasons.size > 0, reasons: [...emergencyReasons] },
    recommendation,
    mode: 'ai',
  }
}

function runRules(db: DB, text: string, ctx: AssistantContext, redFlags: RedFlag[]): AssistantReply {
  const origin = ctx.origin ?? SONIPAT_CENTRE
  if (redFlags.length) {
    return {
      reply: `This could be an emergency (${redFlags.map((f) => f.label.toLowerCase()).join(', ')}). Press the red SOS button now, or call 112 / 108. Don’t drive yourself if you feel faint or have chest pain.`,
      emergency: { flagged: true, reasons: redFlags.map((f) => f.label) },
      recommendation: recommendHospitals(db, { origin, specialty: 'emergency', maxKm: 30, hasPmjay: ctx.hasPmjay }),
      mode: 'rules',
    }
  }
  const [specialty] = matchSpecialties(text)
  if (!specialty || !isSpecialtyKey(specialty)) {
    return {
      reply: 'I couldn’t tell which kind of care you need. Try describing the main problem in a few words — for example “knee pain for two weeks”, “child has fever”, or “eye check-up”.',
      emergency: { flagged: false, reasons: [] },
      recommendation: null,
      mode: 'rules',
    }
  }
  const recommendation = recommendHospitals(db, { origin, specialty, maxKm: 100, hasPmjay: ctx.hasPmjay })
  const label = SPECIALTIES[specialty].label.toLowerCase()
  const near = recommendation.nearest[0]
  const best = recommendation.best[0]
  let reply = `This sounds like ${label}.`
  if (near) reply += ` The nearest option is ${near.name} (about ${near.distanceKm} km).`
  if (best && best.id !== near?.id) reply += ` If you can travel, ${best.name} (${best.distanceKm} km) is a stronger choice — ${best.reasons.slice(0, 2).join(', ').toLowerCase() || 'higher facility level'}.`
  if (!near) reply += ' I couldn’t find a listed facility for this nearby yet.'
  reply += ' This is guidance, not a diagnosis.'
  return { reply, emergency: { flagged: false, reasons: [] }, recommendation, mode: 'rules' }
}

export function assistantStatus() {
  return { aiAvailable: !aiDisabledReason, reason: aiDisabledReason }
}
