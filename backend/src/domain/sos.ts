// What the patient taps on the SOS sheet, and what that changes.

export const SOS_CATEGORIES = {
  chest_pain: { label: 'Chest pain', serious: true },
  breathing: { label: 'Breathing trouble', serious: true },
  unconscious: { label: 'Unconscious', serious: true },
  accident: { label: 'Accident', serious: true },
  pregnancy: { label: 'Pregnancy', serious: false },
  other: { label: 'Other', serious: false },
} as const

export type SosCategory = keyof typeof SOS_CATEGORIES
export const SOS_CATEGORY_KEYS = Object.keys(SOS_CATEGORIES) as SosCategory[]

export function isSosCategory(value: unknown): value is SosCategory {
  return typeof value === 'string' && value in SOS_CATEGORIES
}

/** Serious cases prefer an advanced-life-support (ALS) ambulance — but never wait for one. */
export function prefersAls(category: string | null | undefined): boolean {
  return isSosCategory(category) && SOS_CATEGORIES[category].serious
}

export interface Advisory {
  id: string
  text: string
}

export const ROAD_ACCIDENT_ADVISORY: Advisory = {
  id: 'road_accident_cashless',
  text: 'Road accident victims get free treatment up to ₹1.5 lakh for 7 days at designated hospitals. Don’t pay a deposit first.',
}

export function advisoriesFor(category: string | null | undefined): Advisory[] {
  return category === 'accident' ? [ROAD_ACCIDENT_ADVISORY] : []
}
