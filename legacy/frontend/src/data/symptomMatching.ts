export interface ConcernGuidance {
  urgent: boolean
  specialty: string | null
}

const emergencyIndicators = [
  'chest pain',
  'difficulty breathing',
  'trouble breathing',
  'shortness of breath',
  'cannot breathe',
  "can't breathe",
  'unconscious',
  'severe bleeding',
  'face drooping',
  'weakness on one side',
  'stroke symptoms',
]

const specialtyIndicators: Array<{ specialty: string; phrases: string[] }> = [
  { specialty: 'Orthopaedics', phrases: ['knee pain', 'joint pain', 'bone pain', 'back pain', 'joint injury'] },
  { specialty: 'Dermatology', phrases: ['skin rash', 'rash', 'skin problem', 'itchy skin'] },
  { specialty: 'Neurology', phrases: ['migraine', 'headache'] },
  { specialty: 'General medicine', phrases: ['fever', 'cold', 'cough'] },
]

export function matchConcernToSpecialty(concern: string): ConcernGuidance {
  const normalized = concern.trim().toLocaleLowerCase('en')
  if (emergencyIndicators.some((indicator) => normalized.includes(indicator))) {
    return { urgent: true, specialty: null }
  }

  const match = specialtyIndicators.find(({ phrases }) =>
    phrases.some((phrase) => normalized.includes(phrase)))
  return { urgent: false, specialty: match?.specialty ?? null }
}
