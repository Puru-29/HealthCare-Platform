// Runs the backend (port 3001) and the frontend (port 5173) together. Ctrl+C stops both.
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const procs = [
  { name: 'backend', color: '\x1b[36m', cwd: join(root, 'backend') },
  { name: 'frontend', color: '\x1b[35m', cwd: join(root, 'frontend') },
].map(({ name, color, cwd }) => {
  const child = spawn('npm', ['run', 'dev'], { cwd, shell: true, env: { ...process.env, FORCE_COLOR: '1' } })
  const prefix = `${color}[${name}]\x1b[0m `
  const pipe = (stream, out) => stream.on('data', (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (line && !/ExperimentalWarning: SQLite|--trace-warnings/.test(line)) out.write(prefix + line + '\n')
    }
  })
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code) => { console.log(`${prefix}exited (${code})`); shutdown() })
  return child
})

let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  for (const p of procs) p.kill()
  setTimeout(() => process.exit(0), 500)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
console.log('Open http://127.0.0.1:5173  ·  hospital console: /console')
