import { SPECIALTIES, SPECIALTY_KEYS, type SpecialtyKey } from './specialties.js'

// Deterministic safety net that runs on every assistant message, before and
// independent of the language model. It errs toward flagging: a false alarm
// costs a banner, a miss can cost a life.
const RED_FLAGS: Array<{ id: string; label: string; patterns: RegExp[] }> = [
  { id: 'chest_pain', label: 'Chest pain', patterns: [/chest\s*(pain|tightness|pressure)/i, /seen[ae]\s*(me|mein|main)?\s*dard/i, /heart\s*attack/i, /dil\s*ka\s*daura/i] },
  { id: 'breathing', label: 'Trouble breathing', patterns: [/(can'?t|cannot|not able to|unable to|difficulty|trouble|hard to)\s*breath/i, /short(ness)?\s*of\s*breath/i, /not\s*breathing/i, /saa?ns\s*(nahi|nhi|lene\s*(me|mein)\s*(dikkat|taklee?f)|phool)/i, /choking/i] },
  { id: 'unconscious', label: 'Unconscious / fainted', patterns: [/unconscious/i, /not\s*responding/i, /faint(ed)?/i, /behosh/i, /collapsed/i] },
  { id: 'bleeding', label: 'Severe bleeding', patterns: [/(heavy|severe|lot of|bahut|zyada)\s*(bleeding|khoon)/i, /bleeding\s*(heavily|won'?t stop|not stopping)/i, /khoon\s*(nahi|nhi)\s*ruk/i] },
  { id: 'stroke', label: 'Stroke signs', patterns: [/stroke/i, /face\s*(droop|tedha)/i, /slurred\s*speech/i, /weakness\s*(on|in)\s*one\s*side/i, /lakwa/i, /sudden(ly)?\s*(numb|paraly)/i] },
  { id: 'seizure', label: 'Seizure', patterns: [/seizure/i, /convulsion/i, /\bfits?\b/i, /mirgi/i] },
  { id: 'accident', label: 'Accident / major injury', patterns: [/accident/i, /hit\s*by/i, /head\s*injury/i, /fell\s*from/i, /durghatna/i] },
  { id: 'burn', label: 'Serious burn', patterns: [/\bburn(s|ed|t)?\b/i, /jal\s*gay[ae]/i] },
  { id: 'poison', label: 'Poisoning / overdose', patterns: [/poison/i, /overdose/i, /zeh(e)?r/i, /swallowed/i, /pesticide/i] },
  { id: 'self_harm', label: 'Risk of self-harm', patterns: [/suicid/i, /kill\s*(my|him|her)self/i, /end\s*my\s*life/i, /khudkushi/i, /marna\s*chahta/i, /marna\s*chahti/i] },
  { id: 'bite', label: 'Snake or animal bite', patterns: [/snake\s*bite/i, /saa?np\s*ne\s*kaat/i, /bitten\s*by/i, /dog\s*bite/i] },
  { id: 'pregnancy', label: 'Pregnancy emergency', patterns: [/pregnan\w*.*(bleed|pain|water)/i, /labou?r\s*pain/i, /water\s*broke/i, /delivery\s*pain/i] },
]

export interface RedFlag {
  id: string
  label: string
}

export function detectRedFlags(text: string): RedFlag[] {
  return RED_FLAGS.filter((f) => f.patterns.some((re) => re.test(text))).map(({ id, label }) => ({ id, label }))
}

/** Keyword match used when the AI assistant is not configured. Best match first. */
export function matchSpecialties(text: string): SpecialtyKey[] {
  const lower = text.toLowerCase()
  const scored = SPECIALTY_KEYS
    .map((key) => ({ key, score: SPECIALTIES[key].keywords.filter((k) => lower.includes(k)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.map((s) => s.key)
}
