#!/usr/bin/env node
// Builds data/processed/sonipat_facilities.json — the single master file the server seeds from.
//
// Inputs (all in repo):
//   data/processed/sonipat_pmjay_empanelled_hospitals.csv   AB-PMJAY roster (district, as on 2026-08-03)
//   data/processed/haryana_sonipat_primary_facilities.csv   Haryana health dept CHC/PHC list
//   data/processed/haryana_sonipat_hospitals_beds.csv        Govt hospital bed capacity
//   data/raw/osm/sonipat_health_facilities.json              OpenStreetMap extract (ODbL)
//   data/manual/pmjay_location_matches.json                  hand-reviewed roster -> location links
//   data/raw/osm/nominatim_cache.json                        cached geocodes (created/extended by this script)
//
// Usage: node data/pipeline/build-hospital-dataset.mjs [--offline]   (or: npm run data:build)
//   --offline  never call Nominatim; uncached geocodes stay unresolved.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const p = (...parts) => join(root, ...parts)
const OFFLINE = process.argv.includes('--offline')

// Sonipat district bounding box (generous). Anything geocoded outside is rejected.
const BOUNDS = { south: 28.76, north: 29.32, west: 76.54, east: 77.24 }
const inBounds = (lat, lng) => lat >= BOUNDS.south && lat <= BOUNDS.north && lng >= BOUNDS.west && lng <= BOUNDS.east

// ---------- CSV ----------
function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  text = text.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  const [header, ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}
const readCsv = (rel) => parseCsv(readFileSync(p(rel), 'utf8'))

// ---------- Specialty inference ----------
// Keys are shared with backend/src/domain/specialties.ts
const LEVEL_SPECIALTIES = {
  phc: ['primary_care', 'general_medicine', 'vaccination'],
  uhc: ['primary_care', 'general_medicine', 'vaccination'],
  dispensary: ['primary_care', 'general_medicine'],
  polyclinic: ['primary_care', 'general_medicine'],
  chc: ['primary_care', 'general_medicine', 'general_surgery', 'maternity', 'paediatrics', 'emergency'],
  sub_district_hospital: ['general_medicine', 'general_surgery', 'maternity', 'paediatrics', 'emergency', 'orthopaedics', 'ophthalmology', 'dental'],
  district_hospital: ['general_medicine', 'general_surgery', 'maternity', 'paediatrics', 'emergency', 'orthopaedics', 'ophthalmology', 'ent', 'dental', 'psychiatry', 'dermatology', 'trauma', 'icu'],
  medical_college: ['general_medicine', 'general_surgery', 'maternity', 'paediatrics', 'emergency', 'orthopaedics', 'ophthalmology', 'ent', 'dental', 'psychiatry', 'dermatology', 'pulmonology', 'trauma', 'icu'],
}
const KEYWORDS = [
  [/\beye\b|vision|netra/i, ['ophthalmology']],
  [/e\.?n\.?t\b|\bear\b|hearing|speech/i, ['ent']],
  [/heart|cardio/i, ['cardiology']],
  [/trauma/i, ['trauma', 'emergency', 'orthopaedics']],
  [/critical care|\bicu\b/i, ['icu', 'emergency']],
  [/maternity|women|mother|gyn|fertility/i, ['maternity']],
  [/child|children|kids|paediatric|pediatric/i, ['paediatrics']],
  [/ortho|spine|\bbone/i, ['orthopaedics']],
  [/digestive|gastro/i, ['gastroenterology']],
  [/neuro|brain/i, ['neurology']],
  [/dental|\bdent\b/i, ['dental']],
  [/chest|asthma|allergy/i, ['pulmonology']],
  [/psychiatr/i, ['psychiatry']],
  [/skin|derma/i, ['dermatology']],
  [/physio/i, ['physiotherapy']],
  [/cancer|onco/i, ['oncology']],
]
const SINGLE_SPECIALTY = /\beye\b|vision|e\.?n\.?t\b|dental|physio|skin|psychiatr|speech|hearing/i
const OSM_SPECIALITY = {
  orthopaedics: 'orthopaedics', orthopedic: 'orthopaedics', neurology: 'neurology', gastroenterology: 'gastroenterology',
  'eye care': 'ophthalmology', ophthalmology: 'ophthalmology', 'general surgery': 'general_surgery', medicine: 'general_medicine',
  cardiology: 'cardiology', paediatrics: 'paediatrics', gynaecology: 'maternity', dentistry: 'dental',
}

function inferSpecialties({ name, facilityType, osmTags }) {
  const out = new Map()
  const add = (key, source) => { if (!out.has(key)) out.set(key, source) }
  for (const key of LEVEL_SPECIALTIES[facilityType] ?? []) add(key, 'facility_level_norm')
  for (const [re, keys] of KEYWORDS) if (re.test(name)) keys.forEach((k) => add(k, 'name_inference'))
  const tag = osmTags?.['healthcare:speciality']
  if (tag) {
    const lower = tag.toLowerCase()
    for (const [needle, key] of Object.entries(OSM_SPECIALITY)) if (lower.includes(needle)) add(key, 'osm_tag')
  }
  if ((facilityType === 'hospital' || facilityType === 'clinic') && !SINGLE_SPECIALTY.test(name)) {
    add('general_medicine', 'name_inference')
    if (facilityType === 'hospital' && /multi|general|memorial|charitable|hospital/i.test(name)) add('general_surgery', 'name_inference')
  }
  return [...out].map(([key, source]) => ({ key, source }))
}

// ---------- OSM ----------
const osm = JSON.parse(readFileSync(p('data/raw/osm/sonipat_health_facilities.json'), 'utf8'))
const manual = JSON.parse(readFileSync(p('data/manual/pmjay_location_matches.json'), 'utf8'))
const osmFeatures = osm.elements
  .map((e) => ({
    ref: `${e.type}/${e.id}`,
    name: e.tags?.name?.trim(),
    tags: e.tags ?? {},
    lat: e.center?.lat ?? e.lat,
    lng: e.center?.lon ?? e.lon,
  }))
  .filter((f) => f.name && Number.isFinite(f.lat) && !manual.osmExclusions.names.includes(f.name))

const byName = new Map()
for (const f of osmFeatures) {
  const keep = manual.osmExclusions.duplicateNamesKeepNearest[f.name]
  const existing = byName.get(f.name)
  if (!existing) { byName.set(f.name, f); continue }
  if (!keep) throw new Error(`Ambiguous OSM name "${f.name}" — add it to osmExclusions.duplicateNamesKeepNearest`)
  const d = (x) => Math.hypot(x.lat - keep[0], x.lng - keep[1])
  if (d(f) < d(existing)) byName.set(f.name, f)
}

// ---------- Nominatim (cached) ----------
const cachePath = p('data/raw/osm/nominatim_cache.json')
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}
let lastCall = 0
async function geocode(query, kind) {
  const key = `${kind}|${query}`
  if (!(key in cache)) {
    if (OFFLINE) return null
    const wait = 1100 - (Date.now() - lastCall)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCall = Date.now()
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.search = new URLSearchParams({
      q: query, format: 'jsonv2', limit: '5', countrycodes: 'in', bounded: '1',
      viewbox: `${BOUNDS.west},${BOUNDS.north},${BOUNDS.east},${BOUNDS.south}`,
    })
    const res = await fetch(url, { headers: { 'user-agent': 'carepath-dataset-builder/1.0' } })
    if (!res.ok) throw new Error(`Nominatim ${res.status} for ${query}`)
    cache[key] = (await res.json()).map((r) => ({
      lat: Number(r.lat), lng: Number(r.lon), category: r.category, type: r.type, name: r.name, display: r.display_name,
    }))
    process.stdout.write('.')
  }
  const results = (cache[key] ?? []).filter((r) => inBounds(r.lat, r.lng))
  if (kind === 'poi') {
    const tokens = query.split(',')[0].toLowerCase().split(/\s+/).filter((t) => t.length > 3 && !/hospital|nursing|home|multispeciality|memorial|charitable/.test(t))
    return results.find((r) => ['amenity', 'healthcare'].includes(r.category) && tokens.some((t) => r.name?.toLowerCase().includes(t))) ?? null
  }
  const placeName = query.split(',')[0].trim().toLowerCase()
  return results.find((r) => ['place', 'boundary'].includes(r.category))
    // a locality query ("Sector 7") may resolve to the residential landuse polygon
    ?? (kind === 'locality' ? results.find((r) => r.category === 'landuse' && r.type === 'residential') : undefined)
    // village railway halts carry the village's name and sit at the village
    ?? (kind === 'village' ? results.find((r) => r.category === 'railway' && r.name?.toLowerCase() === placeName) : undefined)
    ?? null
}

// ---------- Village keys for the government network ----------
const VILLAGE_ALIASES = {
  badhkhalsa: 'badkhalsa', ferojpurbangar: 'firozepurbangar', ferozpurbangar: 'firozepurbangar', ferozepurbangar: 'firozepurbangar',
  dubheta: 'dubeta', bidhlan: 'bidhlana', bhatanajafrabad: 'butanazafrabad', bhatanazafrabad: 'butanazafrabad',
  saragthal: 'sargathal', datoli: 'dhatoli', dattoli: 'dhatoli', nahri: 'nahari', baroda: 'barodamor',
  begah: 'bega', halalapur: 'halalpur', gannaur: 'ganaur', rajlugarhi: 'rajlugarhi', moimajri: 'moimajri',
}
function villageKey(name) {
  const k = name.toLowerCase()
    .replace(/\b(phc|chc|uhc|sdh|primary|community|health|centre|center|government|govt|hospital|civil|sonipat|sonepat|,)\b/g, '')
    .replace(/[^a-z]/g, '')
  return VILLAGE_ALIASES[k] ?? k
}
const GOVT_RE = /\b(phc|chc|uhc|sdh|government|govt|civil hospital|dispensary|e\.?s\.?i|primary health|community health|urban health|polyclinic|poly clinic)\b/i

// ---------- Build ----------
const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Phc|Chc|Uhc|Sdh|Ent|Esi|Bps|Gmc|Dr)\b/g, (m) => m.toUpperCase().replace('DR', 'Dr'))

const pmjay = readCsv('data/processed/sonipat_pmjay_empanelled_hospitals.csv')
const primary = readCsv('data/processed/haryana_sonipat_primary_facilities.csv').filter((r) => r.record_type === 'named_facility')
const beds = readCsv('data/processed/haryana_sonipat_hospitals_beds.csv')
const pmjaySource = { name: 'AB-PMJAY empanelled hospitals, District Sonipat', document: pmjay[0].source_document, asOf: pmjay[0].source_date }

const facilities = []
const usedOsm = new Set()
const coveredVillages = new Set()
const issues = []

for (const row of pmjay) {
  const m = manual.entries[row.pdf_entry_number]
  if (!m) throw new Error(`No manual entry for PM-JAY entry ${row.pdf_entry_number}`)
  let location = null
  let osmTags = null
  if (m.osm) {
    const f = byName.get(m.osm)
    if (!f) throw new Error(`Entry ${row.pdf_entry_number}: OSM feature "${m.osm}" not found`)
    usedOsm.add(f.ref)
    osmTags = f.tags
    location = { lat: f.lat, lng: f.lng, source: 'osm', precision: 'building', ref: f.ref }
  } else if (m.geocode) {
    const g = await geocode(m.geocode, m.kind)
    if (g) location = { lat: g.lat, lng: g.lng, source: 'nominatim', precision: m.kind === 'poi' ? 'building' : m.kind, ref: g.display }
    else issues.push(`entry ${row.pdf_entry_number} ${m.displayName}: geocode "${m.geocode}" (${m.kind}) unresolved`)
  } else issues.push(`entry ${row.pdf_entry_number} ${m.displayName}: ${m.unresolvedReason ?? 'no location'}`)

  const bedRow = m.bedsKey ? beds.find((b) => b.hospital_name === m.bedsKey) : null
  const ownership = row.hospital_type.toLowerCase() === 'public' ? 'public' : 'private'
  if (ownership === 'public') coveredVillages.add(villageKey(m.displayName))
  facilities.push({
    id: `pmjay-${row.hospital_id.toLowerCase()}`,
    name: m.displayName,
    sourceName: row.hospital_name,
    ownership,
    facilityType: m.facilityType,
    address: osmTags?.['addr:full'] ?? osmTags?.['addr:street'] ?? null,
    phone: osmTags?.phone ?? null,
    location,
    beds: bedRow ? { count: Number(bedRow.bed_capacity), source: `${bedRow.source_document} p.${bedRow.source_page} (${bedRow.source_date})` } : null,
    pmjay: {
      empanelled: true,
      hospitalId: row.hospital_id,
      asOf: row.source_date,
      desk: { officer: row.nodal_officer_name || null, phone: row.contact_number || null, email: (row.email || '').toLowerCase() || null },
    },
    specialties: inferSpecialties({ name: `${m.displayName} ${row.hospital_name}`, facilityType: m.facilityType, osmTags }),
    sources: [pmjaySource.name + ` (as on ${row.source_date}, entry ${row.pdf_entry_number})`, ...(location?.source === 'osm' ? ['OpenStreetMap'] : [])],
    notes: m.note ?? null,
  })
}

const primaryByVillage = new Map(primary.map((r) => [villageKey(r.facility_name), r]))

// OSM-only facilities
for (const f of byName.values()) {
  if (usedOsm.has(f.ref)) continue
  const amenity = f.tags.amenity ?? f.tags.healthcare
  const isGovt = GOVT_RE.test(f.name)
  let facilityType
  if (isGovt) {
    const listed = primaryByVillage.get(villageKey(f.name))
    if (/dispensary|e\.?s\.?i/i.test(f.name)) facilityType = 'dispensary'
    else if (/polyclinic|poly clinic/i.test(f.name)) facilityType = 'polyclinic'
    else if (/\buhc\b/i.test(f.name)) facilityType = 'uhc'
    else if (listed) facilityType = listed.facility_type === 'CHC' ? 'chc' : 'phc'
    else if (/\bchc\b/i.test(f.name)) facilityType = 'chc'
    else facilityType = 'phc'
    if (coveredVillages.has(villageKey(f.name)) && facilityType !== 'dispensary') continue // already listed via PM-JAY
    coveredVillages.add(villageKey(f.name))
  } else facilityType = amenity === 'clinic' ? 'clinic' : 'hospital'
  const name = facilityType === 'phc' && !/phc/i.test(f.name) ? `PHC ${f.name.replace(/^(government|civil) hospital,?\s*/i, '')}` : f.name.replace(/,\s*(Sonipat|Sonepat)$/i, '')
  facilities.push({
    id: `osm-${f.ref.replace('/', '-')}`,
    name: /^[A-Z\s]+$/.test(name) ? titleCase(name) : name,
    sourceName: f.name,
    ownership: isGovt ? 'public' : 'unknown',
    facilityType,
    address: f.tags['addr:full'] ?? f.tags['addr:street'] ?? null,
    phone: f.tags.phone ?? null,
    location: { lat: f.lat, lng: f.lng, source: 'osm', precision: 'building', ref: f.ref },
    beds: null,
    pmjay: null,
    specialties: inferSpecialties({ name: f.name, facilityType, osmTags: f.tags }),
    sources: ['OpenStreetMap'],
    notes: null,
  })
}

// Government centres from the state list that are still missing — place at village centroid.
for (const r of primary) {
  const key = villageKey(r.facility_name)
  if (coveredVillages.has(key)) continue
  const type = r.facility_type === 'CHC' ? 'chc' : 'phc'
  const village = r.facility_name.replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim()
  const g = await geocode(`${village}, Sonipat, Haryana`, 'village')
  if (!g) { issues.push(`${r.facility_type} ${village}: village geocode unresolved`); }
  coveredVillages.add(key)
  facilities.push({
    id: `hry-${type}-${key}`,
    name: `${r.facility_type} ${titleCase(village)}`,
    sourceName: r.facility_name,
    ownership: 'public',
    facilityType: type,
    address: null,
    phone: null,
    location: g ? { lat: g.lat, lng: g.lng, source: 'nominatim', precision: 'village', ref: g.display } : null,
    beds: null,
    pmjay: null,
    specialties: inferSpecialties({ name: village, facilityType: type }),
    sources: [`Haryana Health Dept facility list (${r.source_document}, ${r.source_date})`],
    notes: g ? 'Location is the village centre, not the building.' : null,
  })
}

writeFileSync(cachePath, JSON.stringify(cache, null, 1))
facilities.sort((a, b) => a.name.localeCompare(b.name))
const out = {
  generatedAt: new Date().toISOString(),
  district: 'Sonipat',
  state: 'Haryana',
  attribution: 'Location data © OpenStreetMap contributors (ODbL 1.0). Hospital roster: AB-PMJAY / National Health Authority district list. Facility list and beds: Haryana Health Department.',
  counts: {
    total: facilities.length,
    pmjay: facilities.filter((f) => f.pmjay).length,
    located: facilities.filter((f) => f.location).length,
    byType: facilities.reduce((acc, f) => ({ ...acc, [f.facilityType]: (acc[f.facilityType] ?? 0) + 1 }), {}),
  },
  unresolved: issues,
  facilities,
}
writeFileSync(p('data/processed/sonipat_facilities.json'), JSON.stringify(out, null, 1))
console.log(`\nWrote ${facilities.length} facilities (${out.counts.located} located, ${out.counts.pmjay} PM-JAY).`)
console.log(out.counts.byType)
if (issues.length) console.log(`Unresolved (${issues.length}):\n  ` + issues.join('\n  '))
