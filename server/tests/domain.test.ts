import { describe, expect, it } from 'vitest'
import { estimateRoadKm, haversineKm, pointAlong } from '../src/domain/geo.js'
import { eligibleRoomRent, estimateClaim, estimatePmjay } from '../src/domain/insurance.js'
import { recommend, type RankableFacility } from '../src/domain/ranking.js'
import { detectRedFlags, matchSpecialties } from '../src/domain/triage.js'

describe('triage red flags', () => {
  it.each([
    ['my father has chest pain and is sweating', 'chest_pain'],
    ['seene me dard ho raha hai', 'chest_pain'],
    ['she cannot breathe properly', 'breathing'],
    ['saans lene me dikkat', 'breathing'],
    ['he fainted in the bathroom', 'unconscious'],
    ['behosh ho gaye', 'unconscious'],
    ['face drooping and slurred speech', 'stroke'],
    ['road accident near Murthal', 'accident'],
    ['child swallowed rat poison', 'poison'],
    ['I want to end my life', 'self_harm'],
    ['pregnant and bleeding a lot', 'pregnancy'],
  ])('flags "%s"', (text, id) => {
    expect(detectRedFlags(text).map((f) => f.id)).toContain(id)
  })

  it.each(['knee pain for two weeks', 'need an eye check-up', 'mild cold and cough', 'skin rash on arm'])('does not flag "%s"', (text) => {
    expect(detectRedFlags(text)).toEqual([])
  })

  it('matches specialties from everyday words', () => {
    expect(matchSpecialties('knee pain since a month')[0]).toBe('orthopaedics')
    expect(matchSpecialties('aankh me jalan')[0]).toBe('ophthalmology')
    expect(matchSpecialties('bachcha ko bukhar hai')).toEqual(expect.arrayContaining(['paediatrics', 'general_medicine']))
  })
})

describe('geo', () => {
  it('computes distances within Sonipat sensibly', () => {
    const sonipat = { lat: 28.9931, lng: 77.0151 }
    const gohana = { lat: 29.1382, lng: 76.693 }
    const km = haversineKm(sonipat, gohana)
    expect(km).toBeGreaterThan(33)
    expect(km).toBeLessThan(37)
    expect(estimateRoadKm(sonipat, gohana)).toBeCloseTo(km * 1.3)
  })

  it('interpolates along a path', () => {
    const p = pointAlong([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 }], 0.75)
    expect(p.lng).toBeCloseTo(1.5, 3)
  })
})

describe('recommend', () => {
  const base = (over: Partial<RankableFacility> & Pick<RankableFacility, 'id' | 'location'>): RankableFacility => ({
    name: over.id, facilityType: 'hospital', ownership: 'private', specialties: [], pmjayEmpanelled: false,
    verified: false, emergency24x7: null, beds: null, ambulancesAvailable: 0, ...over,
  })
  const origin = { lat: 28.99, lng: 77.02 }
  const facilities = [
    base({ id: 'near-clinic', facilityType: 'clinic', location: { lat: 28.991, lng: 77.021 }, specialties: [{ key: 'general_medicine', source: 'name_inference' }] }),
    base({ id: 'eye-centre', location: { lat: 29.0, lng: 77.03 }, specialties: [{ key: 'ophthalmology', source: 'name_inference' }] }),
    base({ id: 'medical-college', facilityType: 'medical_college', ownership: 'public', pmjayEmpanelled: true, location: { lat: 29.15, lng: 76.81 },
      specialties: ['general_medicine', 'ophthalmology', 'emergency', 'icu'].map((key) => ({ key: key as never, source: 'facility_level_norm' as const })) }),
    base({ id: 'far-away', facilityType: 'medical_college', location: { lat: 30.5, lng: 76.5 }, specialties: [{ key: 'ophthalmology', source: 'facility_level_norm' }] }),
    base({ id: 'unlocated', location: null, specialties: [{ key: 'ophthalmology', source: 'name_inference' }] }),
  ]

  it('returns only facilities that treat the specialty, nearest first, within range', () => {
    const r = recommend(facilities, { origin, specialty: 'ophthalmology' })
    expect(r.nearest.map((x) => x.facility.id)).toEqual(['eye-centre', 'medical-college'])
    expect(r.considered).toBe(2) // far-away (>100 km) and unlocated are excluded
  })

  it('weights PM-JAY empanelment heavily for card holders', () => {
    const without = recommend(facilities, { origin, specialty: 'ophthalmology' }).best.find((x) => x.facility.id === 'medical-college')!
    const withCard = recommend(facilities, { origin, specialty: 'ophthalmology', hasPmjay: true }).best.find((x) => x.facility.id === 'medical-college')!
    expect(withCard.score).toBeGreaterThan(without.score)
    expect(withCard.reasons).toContain('Cashless with your Ayushman card')
  })

  it('respects pmjayOnly', () => {
    const r = recommend(facilities, { origin, specialty: 'ophthalmology', pmjayOnly: true })
    expect(r.nearest.map((x) => x.facility.id)).toEqual(['medical-college'])
  })
})

describe('insurance estimate', () => {
  const bill = { roomRentPerDay: 6000, days: 3, associatedCharges: 60_000, medicinesAndConsumables: 20_000, otherCharges: 10_000 }

  it('applies room-rent cap with proportionate deduction', () => {
    const r = estimateClaim(bill, {
      sumInsured: 300_000, alreadyClaimedThisYear: 0, roomRentLimit: { kind: 'percent_of_si', percent: 1 },
      copayPercent: 0, deductible: 0, nonPayablePercent: 0,
    })
    // limit = 3000/day; ratio 0.5
    expect(eligibleRoomRent({ kind: 'percent_of_si', percent: 1 }, 300_000)).toBe(3000)
    expect(r.lines[0]!.payable).toBe(9000)
    expect(r.lines[1]!.payable).toBe(30_000)
    expect(r.totalBill).toBe(108_000)
    expect(r.insurerPays).toBe(9000 + 30_000 + 20_000 + 10_000)
    expect(r.youPay).toBe(108_000 - 69_000)
    expect(r.warnings[0]).toMatch(/above the policy limit/)
  })

  it('applies deductible, co-pay and remaining cover in order', () => {
    const r = estimateClaim(bill, {
      sumInsured: 100_000, alreadyClaimedThisYear: 40_000, roomRentLimit: { kind: 'none' },
      copayPercent: 10, deductible: 5000, nonPayablePercent: 10,
    })
    // admissible = 18000 + 60000 + 18000 + 10000 = 106000; -5000 = 101000; copay 10100 -> 90900; cover 60000
    expect(r.admissible).toBe(106_000)
    expect(r.copayApplied).toBe(10_100)
    expect(r.insurerPays).toBe(60_000)
    expect(r.warnings.some((w) => /remaining cover/.test(w))).toBe(true)
  })

  it('PM-JAY covers up to the family limit at empanelled hospitals only', () => {
    expect(estimatePmjay(120_000, 450_000, true)).toMatchObject({ eligible: true, covered: 50_000, youPay: 70_000 })
    expect(estimatePmjay(120_000, 0, false)).toMatchObject({ eligible: false, covered: 0, youPay: 120_000 })
  })
})

describe('hindi / hinglish keyword stems', () => {
  it.each([
    ['meri maa ke ghutne me 2 hafte se dard hai', 'orthopaedics'],
    ['bachche ko khaansi hai', 'paediatrics'],
    ['ankh lal hai', 'ophthalmology'],
    ['daat me dard', 'dental'],
  ])('"%s" -> %s', (text, key) => {
    expect(matchSpecialties(text)).toContain(key)
  })
})
