// Quick buttons on the SOS sheet. Keys and the accident text match backend/src/domain/sos.ts.

export const SOS_CATEGORIES = [
  { key: 'chest_pain', label: 'Chest pain', serious: true },
  { key: 'breathing', label: 'Breathing', serious: true },
  { key: 'unconscious', label: 'Unconscious', serious: true },
  { key: 'accident', label: 'Accident', serious: true },
  { key: 'pregnancy', label: 'Pregnancy', serious: false },
  { key: 'other', label: 'Other', serious: false },
] as const

export type SosCategoryKey = (typeof SOS_CATEGORIES)[number]['key']

export const ROAD_ACCIDENT_ADVISORY = 'Road accident victims get free treatment up to ₹1.5 lakh for 7 days at designated hospitals. Don’t pay a deposit first.'
