import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'

export type DB = DatabaseSync

const SCHEMA = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hospitals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_name TEXT,
  ownership TEXT NOT NULL CHECK (ownership IN ('public','private','unknown')),
  facility_type TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  lat REAL,
  lng REAL,
  geo_source TEXT,
  geo_precision TEXT,
  beds INTEGER,
  beds_source TEXT,
  pmjay_json TEXT,
  sources_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  -- fields the hospital maintains itself through the console
  verified INTEGER NOT NULL DEFAULT 0,
  emergency_24x7 INTEGER,
  updated_by_hospital_at TEXT,
  district TEXT NOT NULL DEFAULT 'Sonipat'
);
CREATE INDEX IF NOT EXISTS hospitals_latlng ON hospitals(lat, lng);

CREATE TABLE IF NOT EXISTS hospital_specialties (
  hospital_id TEXT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (hospital_id, key)
);

CREATE TABLE IF NOT EXISTS hospital_insurers (
  hospital_id TEXT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  insurer TEXT NOT NULL,
  PRIMARY KEY (hospital_id, insurer)
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ambulances (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  vehicle_number TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('BLS','ALS','PTV')),
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','busy','offline')),
  lat REAL,
  lng REAL,
  location_at TEXT,
  simulated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  has_pmjay INTEGER NOT NULL DEFAULT 0,
  insurer TEXT,
  sum_insured INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('searching','assigned','arrived','to_hospital','completed','cancelled','no_response')),
  pickup_lat REAL NOT NULL,
  pickup_lng REAL NOT NULL,
  pickup_accuracy_m REAL,
  patient_name TEXT,
  patient_phone TEXT NOT NULL,
  note TEXT,
  wave INTEGER NOT NULL DEFAULT 0,
  hospital_id TEXT REFERENCES hospitals(id),
  ambulance_id TEXT REFERENCES ambulances(id),
  driver_token_hash TEXT UNIQUE,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  arrived_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS incident_offers (
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  wave INTEGER NOT NULL,
  distance_km REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','withdrawn')),
  offered_at TEXT NOT NULL,
  responded_at TEXT,
  PRIMARY KEY (incident_id, hospital_id)
);

CREATE TABLE IF NOT EXISTS incident_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  department TEXT NOT NULL,
  preferred_date TEXT NOT NULL,
  preferred_slot TEXT NOT NULL CHECK (preferred_slot IN ('morning','afternoon','evening')),
  reason TEXT,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','declined','cancelled')),
  confirmed_for TEXT,
  hospital_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

let instance: DB | null = null

export function openDb(path = config.databasePath): DB {
  const db = new DatabaseSync(path)
  db.exec(SCHEMA)
  return db
}

export function getDb(): DB {
  instance ??= openDb()
  return instance
}

/** Replace the default database (tests). */
export function setDb(db: DB) {
  instance = db
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

interface FacilityRecord {
  id: string
  name: string
  sourceName: string | null
  ownership: 'public' | 'private' | 'unknown'
  facilityType: string
  address: string | null
  phone: string | null
  location: { lat: number; lng: number; source: string; precision: string } | null
  beds: { count: number; source: string } | null
  pmjay: unknown
  specialties: Array<{ key: string; source: string }>
  sources: string[]
  notes: string | null
}

/**
 * Load (or refresh) the directory from the master file. Fields a hospital edits
 * itself (verified specialties, emergency flag, location pins) are preserved.
 */
export function importFacilities(db: DB, file = config.facilitiesFile): number {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { facilities: FacilityRecord[] }
  const upsert = db.prepare(`
    INSERT INTO hospitals (id, name, source_name, ownership, facility_type, address, phone, lat, lng, geo_source, geo_precision, beds, beds_source, pmjay_json, sources_json, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, source_name = excluded.source_name, ownership = excluded.ownership,
      facility_type = excluded.facility_type,
      address = COALESCE(hospitals.address, excluded.address),
      phone = CASE WHEN hospitals.updated_by_hospital_at IS NULL THEN excluded.phone ELSE hospitals.phone END,
      lat = CASE WHEN hospitals.geo_source = 'hospital' THEN hospitals.lat ELSE excluded.lat END,
      lng = CASE WHEN hospitals.geo_source = 'hospital' THEN hospitals.lng ELSE excluded.lng END,
      geo_precision = CASE WHEN hospitals.geo_source = 'hospital' THEN hospitals.geo_precision ELSE excluded.geo_precision END,
      geo_source = CASE WHEN hospitals.geo_source = 'hospital' THEN hospitals.geo_source ELSE excluded.geo_source END,
      beds = excluded.beds, beds_source = excluded.beds_source,
      pmjay_json = excluded.pmjay_json, sources_json = excluded.sources_json, notes = excluded.notes
  `)
  const clearInferred = db.prepare(`DELETE FROM hospital_specialties WHERE hospital_id = ? AND source <> 'hospital_verified'`)
  const addSpecialty = db.prepare(`INSERT OR IGNORE INTO hospital_specialties (hospital_id, key, source) VALUES (?, ?, ?)`)
  tx(db, () => {
    for (const f of data.facilities) {
      upsert.run(
        f.id, f.name, f.sourceName, f.ownership, f.facilityType, f.address, f.phone,
        f.location?.lat ?? null, f.location?.lng ?? null, f.location?.source ?? null, f.location?.precision ?? null,
        f.beds?.count ?? null, f.beds?.source ?? null,
        f.pmjay ? JSON.stringify(f.pmjay) : null, JSON.stringify(f.sources), f.notes,
      )
      clearInferred.run(f.id)
      for (const s of f.specialties) addSpecialty.run(f.id, s.key, s.source)
    }
  })
  return data.facilities.length
}

export function ensureSeeded(db: DB) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM hospitals').get() as { n: number }
  if (row.n === 0) importFacilities(db)
}
