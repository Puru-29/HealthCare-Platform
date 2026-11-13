import { createApp } from './app.js'
import { config } from './config.js'
import { ensureSeeded, getDb } from './db.js'
import { getDispatcher } from './services/dispatch.js'

const db = getDb()
ensureSeeded(db)
const dispatcher = getDispatcher(db)
dispatcher.resume()

const server = createApp(db, dispatcher).listen(config.port, config.host, () => {
  const n = (db.prepare('SELECT COUNT(*) AS n FROM hospitals').get() as { n: number }).n
  const partners = (db.prepare('SELECT COUNT(DISTINCT hospital_id) AS n FROM ambulances').get() as { n: number }).n
  console.log(`CarePath API on http://${config.host}:${config.port}  (${n} facilities, ${partners} ambulance partners${config.demoMode ? ', DEMO MODE' : ''})`)
})

function shutdown() {
  dispatcher.stop()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
