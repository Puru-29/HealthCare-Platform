// npm run seed            -> load/refresh the hospital directory from data/processed/sonipat_facilities.json
// npm run seed -- --demo  -> also create demo console logins + simulated ambulances (development only)
import { config } from '../src/config.js'
import { getDb, importFacilities } from '../src/db.js'
import { hashPassword, newId } from '../src/lib/security.js'

const db = getDb()
const n = importFacilities(db)
console.log(`Directory: ${n} facilities loaded from ${config.facilitiesFile}`)

if (process.argv.includes('--demo')) {
  if (config.production) {
    console.error('Refusing to create demo data with NODE_ENV=production.')
    process.exit(1)
  }
  const password = process.env.DEMO_CONSOLE_PASSWORD ?? 'demo-sonipat'
  const hash = await hashPassword(password)
  // Real hospitals spread across the district, so SOS from anywhere finds a partner.
  const partners = [
    { hospitalId: 'pmjay-hosp6g03224', username: 'civil-sonipat', fleet: 2 },
    { hospitalId: 'pmjay-hosp6g02452', username: 'sdh-gohana', fleet: 1 },
    { hospitalId: 'pmjay-hosp6g81063', username: 'sdh-ganaur', fleet: 1 },
    { hospitalId: 'pmjay-hosp6p130991', username: 'park-nidaan', fleet: 2 },
    { hospitalId: 'pmjay-hosp6p180905', username: 'nawal-kundli', fleet: 1 },
    { hospitalId: 'pmjay-hosp6g110984', username: 'chc-kharkhoda', fleet: 1 },
  ]
  let i = 0
  for (const p of partners) {
    const h = db.prepare('SELECT id, name, lat, lng FROM hospitals WHERE id = ?').get(p.hospitalId) as { id: string; name: string; lat: number | null; lng: number | null } | undefined
    if (!h) { console.warn(`  skip ${p.hospitalId}: not in directory`); continue }
    db.prepare(`INSERT INTO staff (id, hospital_id, username, password_hash, display_name) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`).run(newId(), h.id, p.username, hash, `${h.name} desk (demo)`)
    const existing = (db.prepare('SELECT COUNT(*) AS n FROM ambulances WHERE hospital_id = ? AND simulated = 1').get(h.id) as { n: number }).n
    for (let k = existing; k < p.fleet; k++) {
      i++
      // 0000000000 is deliberately non-dialable: demo drivers are not real people.
      db.prepare(`INSERT INTO ambulances (id, hospital_id, vehicle_number, kind, driver_name, driver_phone, status, lat, lng, location_at, simulated)
        VALUES (?, ?, ?, ?, ?, '0000000000', 'available', ?, ?, ?, 1)`)
        .run(newId(), h.id, `DEMO-${String(i).padStart(2, '0')}`, k === 0 ? 'ALS' : 'BLS', `Demo driver ${i}`, h.lat, h.lng, new Date().toISOString())
    }
    console.log(`  ${p.username.padEnd(16)} -> ${h.name}`)
  }
  console.log(`Demo console password for all of the above: ${password}`)
  if (!config.demoMode) console.log('Note: set DEMO_MODE=true in backend/.env so demo ambulances move on their own.')
}
