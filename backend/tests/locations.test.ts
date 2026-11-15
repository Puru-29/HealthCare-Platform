import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config.js'
import { importFacilities, openDb } from '../src/db.js'
import { haversineKm } from '../src/domain/geo.js'

// Guards for the map pins that SOS, "nearest" and Directions all depend on.

interface Facility {
  id: string
  name: string
  address: string | null
  notes: string | null
  location: { lat: number; lng: number; precision: string } | null
}
const data = JSON.parse(readFileSync(config.facilitiesFile, 'utf8')) as { facilities: Facility[] }
const located = data.facilities.filter((f) => f.location)
const byId = (id: string) => data.facilities.find((f) => f.id === id)!

const TOWNS = {
  Gohana: { lat: 29.137, lng: 76.7 },
  Ganaur: { lat: 29.133, lng: 77.018 },
  Kharkhoda: { lat: 28.873, lng: 76.912 },
  Kundli: { lat: 28.873, lng: 77.12 },
  'Khanpur Kalan': { lat: 29.155, lng: 76.805 },
}

describe('hospital map pins', () => {
  it('every pin is inside Sonipat district', () => {
    for (const f of located) {
      expect(f.location!.lat, f.name).toBeGreaterThan(28.76)
      expect(f.location!.lat, f.name).toBeLessThan(29.32)
      expect(f.location!.lng, f.name).toBeGreaterThan(76.54)
      expect(f.location!.lng, f.name).toBeLessThan(77.24)
    }
  })

  it('a facility named after a town is pinned in that town', () => {
    let checked = 0
    for (const f of located) {
      for (const [town, centre] of Object.entries(TOWNS)) {
        if (!new RegExp(`\\b${town}\\b`, 'i').test(f.name)) continue
        checked++
        expect(haversineKm(f.location!, centre), `${f.name} should be in ${town}`).toBeLessThan(8)
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8)
  })

  it('a facility whose address names a town is pinned in that town (road names excluded)', () => {
    for (const f of located) {
      // "Gohana Road", "Ganaur - Gohana Road", "Gohana Panipat Road" are roads, not the facility's town.
      const address = (f.address ?? '').replace(/\b(\w+[\s-]+){1,2}road\b/gi, '')
      for (const [town, centre] of Object.entries(TOWNS)) {
        if (!new RegExp(`\\b${town}\\b`, 'i').test(address)) continue
        expect(haversineKm(f.location!, centre), `${f.name} (${f.address})`).toBeLessThan(8)
      }
    }
  })

  it('SDH Gohana is in Gohana, not at Civil Hospital Sonipat', () => {
    const gohana = byId('pmjay-hosp6g02452')
    const sonipat = byId('pmjay-hosp6g03224')
    expect(haversineKm(gohana.location!, TOWNS.Gohana)).toBeLessThan(2)
    expect(haversineKm(gohana.location!, sonipat.location!)).toBeGreaterThan(30)
  })

  it('manual corrections are applied', () => {
    expect(byId('pmjay-hosp6g03224').address).toBeNull() // OSM said "Rohtak"
    const sharma = byId('osm-node-7001287193')
    expect(sharma.location).toBeNull()
    expect(sharma.notes).toMatch(/not confirmed/)
  })

  it('re-importing replaces a stale stored address and removes a withdrawn pin', () => {
    const db = openDb(':memory:')
    importFacilities(db)
    db.prepare(`UPDATE hospitals SET address = 'Rohtak' WHERE id = 'pmjay-hosp6g03224'`).run()
    db.prepare(`UPDATE hospitals SET lat = 28.9999, lng = 77.0297 WHERE id = 'osm-node-7001287193'`).run()
    importFacilities(db)
    expect(db.prepare(`SELECT address FROM hospitals WHERE id = 'pmjay-hosp6g03224'`).get()).toEqual({ address: null })
    expect(db.prepare(`SELECT lat FROM hospitals WHERE id = 'osm-node-7001287193'`).get()).toEqual({ lat: null })
  })

  it('a pin set by the hospital itself survives re-import', () => {
    const db = openDb(':memory:')
    importFacilities(db)
    db.prepare(`UPDATE hospitals SET lat = 29.1, lng = 76.7, geo_source = 'hospital' WHERE id = 'pmjay-hosp6g02452'`).run()
    importFacilities(db)
    expect(db.prepare(`SELECT lat, lng FROM hospitals WHERE id = 'pmjay-hosp6g02452'`).get()).toEqual({ lat: 29.1, lng: 76.7 })
  })
})
