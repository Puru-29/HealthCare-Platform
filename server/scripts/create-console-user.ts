// Onboard a hospital to the CarePath console.
//   npm run console:create-user -- <hospital-id> <username> ["Display name"]
// Prints a one-time random password. Find hospital ids at GET /api/hospitals?q=<name>.
import { randomBytes } from 'node:crypto'
import { getDb } from '../src/db.js'
import { hashPassword, newId } from '../src/lib/security.js'

const [hospitalId, rawUsername, displayName] = process.argv.slice(2)
if (!hospitalId || !rawUsername) {
  console.error('Usage: npm run console:create-user -- <hospital-id> <username> ["Display name"]')
  process.exit(1)
}
const username = rawUsername.toLowerCase()
const db = getDb()
const hospital = db.prepare('SELECT id, name FROM hospitals WHERE id = ?').get(hospitalId) as { id: string; name: string } | undefined
if (!hospital) {
  console.error(`No hospital with id ${hospitalId}. Run "npm run seed" first, or search /api/hospitals?q=...`)
  process.exit(1)
}
if (db.prepare('SELECT 1 FROM staff WHERE username = ?').get(username)) {
  console.error(`Username ${username} is taken.`)
  process.exit(1)
}
const password = randomBytes(12).toString('base64url')
db.prepare('INSERT INTO staff (id, hospital_id, username, password_hash, display_name) VALUES (?, ?, ?, ?, ?)')
  .run(newId(), hospital.id, username, await hashPassword(password), displayName ?? `${hospital.name} desk`)
console.log(`Created console login for ${hospital.name}`)
console.log(`  username: ${username}`)
console.log(`  password: ${password}   (shown once — share it securely)`)
